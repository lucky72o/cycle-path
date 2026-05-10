import type { CycleDayInput } from './types';

/**
 * Compute a stable fingerprint of cycle data that affects thermal shift
 * evaluation. Two cycles with identical fingerprints should produce identical
 * engine results.
 *
 * Contributing fields: dayNumber, bbt (raw float), excludeFromInterpretation,
 * disturbanceFactors (sorted), travelTimeDiff.
 *
 * Excluded from fingerprint: intercourse, cervical observations, OPK, menstrual
 * flow — these do not affect thermal shift interpretation.
 */
export function computeCycleDataFingerprint(days: CycleDayInput[]): string {
  const normalized = days
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => ({
      n: d.dayNumber,
      t: d.bbt,  // raw stored Celsius float, no rounding (mirrors engine input exactly)
      x: d.excludeFromInterpretation ? 1 : 0,
      f: [...d.disturbanceFactors].sort(),
      v: d.travelTimeDiff,
    }));
  return djb2(JSON.stringify(normalized));
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0; // force to 32-bit unsigned
  }
  return hash.toString(36);
}
