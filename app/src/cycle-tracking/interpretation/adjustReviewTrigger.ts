import type { CycleDayInput, ThermalShiftResult } from './types';
import { validateAdjustment } from './sensiplan/validateAdjustment';

export type AdjustReviewDecision =
  | { trigger: false }
  | { trigger: true; reason: string };

/**
 * Decide whether ADJUSTED-state interpretation should enter needsReview.
 *
 * Rule (per spec): trigger only when
 *   (a) validateAdjustment returns invalid (user's pick no longer satisfies
 *       Sensiplan rules with current data), OR
 *   (b) engineResult.status === 'none' (engine lost the shift entirely).
 *
 * The previous hasMaterialChange check is dropped for ADJUSTED state — engine
 * wobbling around its own pick (pending↔confirmed, shiftDay shifting) does
 * not trigger review when the user's pick remains valid.
 */
export function shouldTriggerReviewForAdjusted(
  days: CycleDayInput[],
  userShiftDay: number,
  newEngineResult: ThermalShiftResult,
): AdjustReviewDecision {
  if (newEngineResult.status === 'none') {
    return {
      trigger: true,
      reason: 'engine_lost_shift: The data no longer supports a thermal shift.',
    };
  }

  const validation = validateAdjustment(days, userShiftDay);
  if (validation.kind === 'invalid') {
    return {
      trigger: true,
      reason: `invalid_pick: ${validation.reason}`,
    };
  }

  return { trigger: false };
}
