import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';
import { validateAdjustment } from './sensiplan/validateAdjustment';

export type ChartAnnotationData = {
  referenceDays: number[];        // length 6, ascending
  anchorDay: number;              // dayNumber of the coverline anchor (highest of the 6)
  confirmingDays: number[];       // length 1-4, ascending; index 0 is the shift day
  coverlineTemp: number;          // °C, full precision
  usedFourthDayException: boolean; // true if the engine fired the 4th-day exception path
};

/**
 * Pick the coverline anchor — the reference-low day whose Celsius temp equals
 * coverlineTemp. On ties, the latest dayNumber wins (the one closest to the
 * shift, which keeps the anchor visually adjacent to the shift narrative).
 *
 * Throws if no day matches: this would mean the engine produced a coverlineTemp
 * not present in referenceDays, which is an invariant violation in
 * collectReferenceDays.
 */
export function pickAnchorDay(
  days: CycleDayInput[],
  referenceDays: number[],
  coverlineTemp: number,
): number {
  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));
  let anchor: number | null = null;
  for (const dayNumber of referenceDays) {
    const day = dayMap.get(dayNumber);
    if (!day || day.bbt === null) continue;
    if (day.bbt === coverlineTemp) {
      anchor = dayNumber; // overwrite to keep the latest match
    }
  }
  if (anchor === null) {
    throw new Error(
      `pickAnchorDay: no reference day matches coverlineTemp ${coverlineTemp}`,
    );
  }
  return anchor;
}

/**
 * Select the chart-annotation data for the current interpretation state.
 *
 * Pure function — no side effects. The annotation source depends on the
 * interpretation state:
 *   - null / DISMISSED → no annotations
 *   - SUGGESTED / CONFIRMED with engine shift → engine's referenceDays,
 *       confirmingDays, coverlineTemp
 *   - SUGGESTED / CONFIRMED with engine status='none' → no annotations
 *   - ADJUSTED → derived from validateAdjustment(days, userOverrides.shiftDay)
 *       so the chart reflects the user's pick even when it differs from the
 *       engine's shift (or when the engine reports 'none')
 *
 * Returns ChartAnnotationData with referenceDays, anchorDay (the latest
 * matching reference low), confirmingDays (length 1-4, including shiftDay
 * at index 0), and coverlineTemp.
 *
 * Returns null when no annotations should render.
 */
export function getChartAnnotations(
  days: CycleDayInput[],
  interpretation: { state: string; userOverrides: UserOverrides | null } | null,
  engineResult: ThermalShiftResult | null | undefined,
): ChartAnnotationData | null {
  if (!interpretation) return null;
  if (interpretation.state === 'DISMISSED') return null;

  if (interpretation.state === 'ADJUSTED') {
    const shiftDay = interpretation.userOverrides?.shiftDay;
    if (shiftDay == null) return null;
    const result = validateAdjustment(days, shiftDay);
    if (result.kind !== 'valid') return null;
    return {
      referenceDays: result.referenceDays,
      anchorDay: pickAnchorDay(days, result.referenceDays, result.coverlineTemp),
      confirmingDays: result.confirmingDays,
      coverlineTemp: result.coverlineTemp,
      usedFourthDayException: result.usedFourthDayException,
    };
  }

  // SUGGESTED or CONFIRMED
  if (!engineResult || engineResult.status === 'none') return null;

  // SUGGESTED or CONFIRMED with engine pending/confirmed shift
  return {
    referenceDays: engineResult.referenceDays,
    anchorDay: pickAnchorDay(days, engineResult.referenceDays, engineResult.coverlineTemp),
    confirmingDays: engineResult.confirmingDays,
    coverlineTemp: engineResult.coverlineTemp,
    usedFourthDayException: engineResult.usedFourthDayException,
  };
}
