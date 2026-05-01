import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';
import { fahrenheitToCelsius } from '../utils';

export type ChartAnnotationData = {
  referenceDays: number[];   // length 6, ascending
  anchorDay: number;         // dayNumber of the coverline anchor (highest of the 6)
  confirmingDays: number[];  // length 1-4, ascending; index 0 is the shift day
  coverlineTemp: number;     // °C, full precision
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
    if (fahrenheitToCelsius(day.bbt) === coverlineTemp) {
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

export function getChartAnnotations(
  days: CycleDayInput[],
  interpretation: { state: string; userOverrides: UserOverrides | null } | null,
  engineResult: ThermalShiftResult | null | undefined,
): ChartAnnotationData | null {
  if (!interpretation) return null;
  if (interpretation.state === 'DISMISSED') return null;

  if (interpretation.state === 'ADJUSTED') {
    // Implemented in Task 2
    return null;
  }

  // SUGGESTED or CONFIRMED
  if (!engineResult || engineResult.status === 'none') return null;

  // Implemented in Task 3
  return null;
}
