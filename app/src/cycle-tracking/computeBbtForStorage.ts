import { convertToCelsiusForStorage, type TemperatureUnit } from './utils';

/**
 * Decide what value to persist for `bbt` given the form's current state.
 *
 * Returns:
 * - a `number` to write a fresh value
 * - `null` to explicitly clear (existing-day case only)
 * - `undefined` to omit the field entirely (new-day-no-input)
 *
 * Behavioural rules:
 * - On an existing day where the user did NOT touch the BBT input string
 *   (`bbt === prefilledBbt`), preserve `existingDayBbt` raw. This avoids
 *   a prefill→submit round-trip through `.toFixed(2)` silently truncating
 *   precision (e.g. `36.6996 → "36.70" → 36.7`).
 * - On an existing day where the user cleared the field (`bbt === ''`),
 *   return `null` so Prisma sets the column to NULL.
 * - Otherwise, parse and convert via `convertToCelsiusForStorage`.
 */
export function computeBbtForStorage(args: {
  bbt: string;
  prefilledBbt: string;
  existingDayBbt: number | null | undefined;
  hasExistingDay: boolean;
  inputUnit: TemperatureUnit;
}): number | null | undefined {
  const { bbt, prefilledBbt, existingDayBbt, hasExistingDay, inputUnit } = args;
  const bbtChanged = bbt !== prefilledBbt;

  if (hasExistingDay && !bbtChanged) {
    return existingDayBbt ?? null;
  }
  if (bbt === '') {
    return hasExistingDay ? null : undefined;
  }
  return convertToCelsiusForStorage(parseFloat(bbt), inputUnit);
}
