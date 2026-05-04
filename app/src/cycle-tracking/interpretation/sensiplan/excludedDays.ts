import type { CycleDayInput } from '../types';
import { fahrenheitToCelsius } from '../../utils';

export type ReferenceResult = {
  referenceDays: number[];   // dayNumbers of the 6 valid reference days
  coverlineTemp: number;     // °C — highest of the 6
  skippedDays: number[];     // excluded dayNumbers that were skipped
};

/**
 * Collect the 6 valid (non-excluded, non-null bbt) temperatures
 * immediately before candidateDay, scanning backward.
 *
 * Returns null if fewer than 6 valid temps are available.
 */
export function collectReferenceDays(
  days: CycleDayInput[],
  candidateDay: number,
): ReferenceResult | null {
  const referenceDays: number[] = [];
  const skippedDays: number[] = [];

  // Sort days by dayNumber descending so we scan backward from candidateDay
  const sorted = [...days]
    .filter((d) => d.dayNumber < candidateDay)
    .sort((a, b) => b.dayNumber - a.dayNumber);

  for (const d of sorted) {
    if (referenceDays.length >= 6) break;

    if (d.bbt === null) {
      // No recorded temp — skip silently (not an "excluded" day)
      continue;
    }

    if (d.excludeFromInterpretation) {
      skippedDays.push(d.dayNumber);
      continue;
    }

    referenceDays.push(d.dayNumber);
  }

  if (referenceDays.length < 6) return null;

  // Reverse so they're in ascending order
  referenceDays.reverse();
  skippedDays.reverse();

  // Calculate coverline = highest of the 6 valid temps (in °C, full precision)
  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));
  let coverlineTemp = -Infinity;
  for (const dayNum of referenceDays) {
    const tempF = dayMap.get(dayNum)!.bbt!;
    const tempC = fahrenheitToCelsius(tempF);
    if (tempC > coverlineTemp) {
      coverlineTemp = tempC;
    }
  }

  return { referenceDays, coverlineTemp, skippedDays };
}
