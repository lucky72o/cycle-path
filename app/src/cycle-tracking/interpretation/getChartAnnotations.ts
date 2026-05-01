import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';

export type ChartAnnotationData = {
  referenceDays: number[];   // length 6, ascending
  anchorDay: number;         // dayNumber of the coverline anchor (highest of the 6)
  confirmingDays: number[];  // length 1-4, ascending; index 0 is the shift day
  coverlineTemp: number;     // °C, full precision
};

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
