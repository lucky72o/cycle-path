import type { CycleDayInput, ThermalShiftResult, UserOverrides } from './types';
import { collectReferenceDays } from './sensiplan/excludedDays';

/**
 * Compute the active coverline for an interpretation, given raw cycle days
 * and the latest engine result. Pure function.
 *
 * For ADJUSTED state: recompute coverline from userOverrides.shiftDay using
 * the same logic the engine uses (collectReferenceDays). Stale
 * userOverrides.coverlineTemp values from old DB records are ignored.
 *
 * For SUGGESTED/CONFIRMED: return the engine's coverline if a shift is
 * detected, else null.
 *
 * For DISMISSED: return null (chart shouldn't draw a coverline for dismissed
 * interpretations).
 *
 * P2 robustness: engineResult can be null/undefined (e.g., marked cycles or
 * empty days where the client engine is skipped). The function returns null
 * in that case for SUGGESTED/CONFIRMED, but ADJUSTED derivation still works
 * since it only depends on raw days + shiftDay.
 */
export function getActiveCoverline(
  days: CycleDayInput[],
  interpretation: { state: string; userOverrides: UserOverrides | null } | null,
  engineResult: ThermalShiftResult | null | undefined,
): number | null {
  if (!interpretation) return null;
  if (interpretation.state === 'DISMISSED') return null;

  if (interpretation.state === 'ADJUSTED') {
    const shiftDay = interpretation.userOverrides?.shiftDay;
    if (shiftDay == null) return null;
    const refResult = collectReferenceDays(days, shiftDay);
    return refResult ? refResult.coverlineTemp : null;
  }

  // SUGGESTED or CONFIRMED
  if (!engineResult || engineResult.status === 'none') return null;
  return engineResult.coverlineTemp;
}
