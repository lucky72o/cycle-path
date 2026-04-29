import type { CycleDayInput } from '../types';
import { collectReferenceDays } from './excludedDays';
import { detectThermalShift } from './thermalShift';
import { checkFourthDayException } from './fourthDayException';
import { fahrenheitToCelsius } from '../../utils';

const THRESHOLD_C = 0.2;

/**
 * Sensiplan flags shifts before CD8 as suspicious — early shifts are often
 * an artifact of post-menstrual elevation rather than true ovulation.
 * Used as a soft warning, not a hard validity check.
 */
const EARLY_SHIFT_MAX_DAY = 7;

export type AdjustValidation =
  | {
      kind: 'valid';
      status: 'confirmed' | 'pending';
      coverlineTemp: number; // °C
      referenceDays: number[];
      skippedDays: number[];
      confirmingDays: number[];
      usedFourthDayException: boolean;
      softWarning: 'early_shift' | null;
    }
  | { kind: 'invalid'; reason: 'picked_day_no_temp' }
  | { kind: 'invalid'; reason: 'picked_day_excluded' }
  | { kind: 'invalid'; reason: 'not_above_coverline' }
  | {
      kind: 'invalid';
      reason: 'insufficient_lows';
      validLowsCount: number;
      missingDaysCount: number;
      excludedDaysCount: number;
    }
  | {
      kind: 'invalid';
      reason: 'earlier_valid_shift_exists';
      earlierShiftDay: number;
    }
  | {
      kind: 'invalid';
      reason: 'rule_broken';
      failedOnDay: number;
    }
  | {
      kind: 'invalid';
      reason: 'fourth_day_failed';
      failedOnDay: number;
    };

/**
 * Validate a user-proposed thermal shift day against Sensiplan rules using
 * raw cycle days. Pure function — no side effects, no I/O.
 *
 * Returns a tagged union: 'valid' (confirmed or pending) or 'invalid' with a
 * specific reason code. Used by AdjustFlow (live validation as user picks)
 * and upsertCycleInterpretation (ADJUSTED-state review trigger).
 */
export function validateAdjustment(
  days: CycleDayInput[],
  pickedShiftDay: number,
): AdjustValidation {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  // 1. Picked day exists, has temp, not excluded
  const pickedDay = sorted.find((d) => d.dayNumber === pickedShiftDay);
  if (!pickedDay) return { kind: 'invalid', reason: 'picked_day_no_temp' };
  if (pickedDay.bbt === null) return { kind: 'invalid', reason: 'picked_day_no_temp' };
  if (pickedDay.excludeFromInterpretation) {
    return { kind: 'invalid', reason: 'picked_day_excluded' };
  }

  // 2. P1.A: no earlier confirmed valid shift.
  //
  // Sensiplan defines the shift as the FIRST day above the coverline with
  // 3-over-6 satisfied. If the engine has confirmed an earlier candidate,
  // the user cannot silently override it by picking a later day — they
  // must explicitly mark the earlier day(s) as excluded from interpretation
  // first. This block is run BEFORE the reference window / not_above_coverline
  // check because the user's late pick may produce a contaminated reference
  // window that masks the real Sensiplan violation.
  const autoDetected = detectThermalShift(sorted);
  if (autoDetected.status === 'confirmed' && autoDetected.shiftDay < pickedShiftDay) {
    return {
      kind: 'invalid',
      reason: 'earlier_valid_shift_exists',
      earlierShiftDay: autoDetected.shiftDay,
    };
  }

  // 3. Reference window
  const refResult = collectReferenceDays(sorted, pickedShiftDay);
  if (!refResult) {
    const validLowsCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.bbt !== null && !d.excludeFromInterpretation,
    ).length;
    const missingDaysCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.bbt === null,
    ).length;
    const excludedDaysCount = sorted.filter(
      (d) => d.dayNumber < pickedShiftDay && d.excludeFromInterpretation,
    ).length;
    return {
      kind: 'invalid',
      reason: 'insufficient_lows',
      validLowsCount,
      missingDaysCount,
      excludedDaysCount,
    };
  }
  const { coverlineTemp, referenceDays, skippedDays } = refResult;

  // 4. Picked day above coverline
  const pickedTempC = fahrenheitToCelsius(pickedDay.bbt);
  if (pickedTempC <= coverlineTemp) {
    return { kind: 'invalid', reason: 'not_above_coverline' };
  }

  // 5. 3-over-6 confirmation from picked day
  const confirmResult = checkConfirmingFromPicked(sorted, pickedShiftDay, coverlineTemp);

  if (confirmResult.outcome === 'rule_broken') {
    return { kind: 'invalid', reason: 'rule_broken', failedOnDay: confirmResult.failedOnDay };
  }
  if (confirmResult.outcome === 'fourth_day_failed') {
    return {
      kind: 'invalid',
      reason: 'fourth_day_failed',
      failedOnDay: confirmResult.failedOnDay,
    };
  }

  const softWarning: 'early_shift' | null = pickedShiftDay <= EARLY_SHIFT_MAX_DAY ? 'early_shift' : null;

  return {
    kind: 'valid',
    status: confirmResult.outcome,
    coverlineTemp,
    referenceDays,
    skippedDays,
    confirmingDays: [pickedShiftDay, ...confirmResult.confirmingDays],
    usedFourthDayException: confirmResult.usedFourthDay ?? false,
    softWarning,
  };
}

type ConfirmFromPickedOutcome =
  | { outcome: 'confirmed'; confirmingDays: number[]; usedFourthDay: boolean }
  | { outcome: 'pending'; confirmingDays: number[] }
  | { outcome: 'rule_broken'; failedOnDay: number; confirmingDays: number[] }
  | { outcome: 'fourth_day_failed'; failedOnDay: number; confirmingDays: number[] };

/**
 * Confirms 3-over-6 from a user-picked candidate day.
 *
 * NOTE: This duplicates the core logic of `checkConfirmingTemps` in
 * thermalShift.ts. They diverge on outcome alphabet — that helper returns
 * 'failed' for any rule violation; this helper distinguishes 'rule_broken'
 * (a confirming temp dropped) from 'fourth_day_failed' (4th-day exception
 * failed) because the AdjustFlow UI shows different messages for each.
 *
 * If the Sensiplan rule changes, both helpers must update in lock-step.
 * Future cleanup: extract a shared core that both wrap.
 */
function checkConfirmingFromPicked(
  sorted: CycleDayInput[],
  pickedShiftDay: number,
  coverlineC: number,
): ConfirmFromPickedOutcome {
  const confirmingDays: number[] = [];
  let needFourthDay = false;
  let i = sorted.findIndex((d) => d.dayNumber === pickedShiftDay) + 1;

  while (i < sorted.length) {
    const d = sorted[i];
    if (d.bbt === null || d.excludeFromInterpretation) {
      i++;
      continue;
    }
    const tempC = fahrenheitToCelsius(d.bbt);
    const positionInConfirm = confirmingDays.length + 1;

    if (positionInConfirm === 1) {
      if (tempC <= coverlineC) {
        return { outcome: 'rule_broken', failedOnDay: d.dayNumber, confirmingDays };
      }
      confirmingDays.push(d.dayNumber);
    } else if (positionInConfirm === 2) {
      if (tempC <= coverlineC) {
        return { outcome: 'rule_broken', failedOnDay: d.dayNumber, confirmingDays };
      }
      if (tempC >= coverlineC + THRESHOLD_C) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: false };
      }
      confirmingDays.push(d.dayNumber);
      needFourthDay = true;
    } else if (positionInConfirm === 3 && needFourthDay) {
      if (checkFourthDayException(tempC, coverlineC)) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: true };
      }
      return { outcome: 'fourth_day_failed', failedOnDay: d.dayNumber, confirmingDays };
    }
    i++;
  }

  return { outcome: 'pending', confirmingDays };
}
