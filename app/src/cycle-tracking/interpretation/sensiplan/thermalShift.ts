import type {
  CycleDayInput,
  ThermalShiftResult,
  FailedAttempt,
} from '../types';
import { collectReferenceDays } from './excludedDays';
import { checkFourthDayException } from './fourthDayException';
import { calculateConfidence } from './confidence';

const THRESHOLD_C = 0.2;

/**
 * Sensiplan sequential thermal shift detection.
 *
 * Scans forward through cycle days. For each candidate first higher
 * temperature, checks 3-over-6 rule with +0.2°C on the 3rd.
 * Finds the FIRST valid shift and stops.
 */
export function detectThermalShift(days: CycleDayInput[]): ThermalShiftResult {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const failedAttempts: FailedAttempt[] = [];

  let hadEnoughData = false;

  let i = 0;
  while (i < sorted.length) {
    const candidateDay = sorted[i];

    if (candidateDay.bbt === null || candidateDay.excludeFromInterpretation) {
      i++;
      continue;
    }

    const refResult = collectReferenceDays(sorted, candidateDay.dayNumber);
    if (!refResult) {
      i++;
      continue;
    }

    hadEnoughData = true;
    const { coverlineTemp, referenceDays, skippedDays } = refResult;
    const candidateTempC = candidateDay.bbt;

    if (candidateTempC <= coverlineTemp) {
      i++;
      continue;
    }

    const confirmResult = checkConfirmingTemps(
      sorted, i, coverlineTemp, candidateDay.dayNumber
    );

    if (confirmResult.outcome === 'confirmed') {
      const { confidence, reasons } = calculateConfidence(skippedDays.length);
      return {
        status: 'confirmed',
        shiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        confirmingDays: [candidateDay.dayNumber, ...confirmResult.confirmingDays],
        skippedDays,
        usedFourthDayException: confirmResult.usedFourthDay,
        confidence,
        confidenceReasons: reasons,
        failedAttempts,
      };
    }

    if (confirmResult.outcome === 'pending') {
      const { confidence, reasons } = calculateConfidence(skippedDays.length);
      return {
        status: 'pending',
        shiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        confirmingDays: [candidateDay.dayNumber, ...confirmResult.confirmingDays],
        skippedDays,
        usedFourthDayException: false,
        confidence,
        confidenceReasons: reasons,
        failedAttempts,
      };
    }

    if (confirmResult.outcome === 'failed') {
      failedAttempts.push({
        attemptedShiftDay: candidateDay.dayNumber,
        coverlineTemp,
        referenceDays,
        failureReason: `Temperature on Day ${confirmResult.failedOnDay} dropped below coverline`,
        failedOnDay: confirmResult.failedOnDay,
      });

      const failIdx = sorted.findIndex((d) => d.dayNumber === confirmResult.failedOnDay);
      i = failIdx >= 0 ? failIdx + 1 : i + 1;
      continue;
    }

    i++;
  }

  return {
    status: 'none',
    reason: hadEnoughData ? 'no_shift_detected' : 'insufficient_data',
    failedAttempts,
  };
}

type ConfirmOutcome =
  | { outcome: 'confirmed'; confirmingDays: number[]; usedFourthDay: boolean }
  | { outcome: 'pending'; confirmingDays: number[] }
  | { outcome: 'failed'; failedOnDay: number };

function checkConfirmingTemps(
  sorted: CycleDayInput[],
  candidateIdx: number,
  coverlineC: number,
  _candidateDayNumber: number,
): ConfirmOutcome {
  const confirmingDays: number[] = [];
  let needFourthDay = false;

  let j = candidateIdx + 1;

  while (j < sorted.length && confirmingDays.length < (needFourthDay ? 3 : 2)) {
    const d = sorted[j];

    if (d.bbt === null || d.excludeFromInterpretation) {
      j++;
      continue;
    }

    const tempC = d.bbt;
    const positionInConfirm = confirmingDays.length + 1;

    if (positionInConfirm === 1) {
      if (tempC <= coverlineC) {
        return { outcome: 'failed', failedOnDay: d.dayNumber };
      }
      confirmingDays.push(d.dayNumber);
    } else if (positionInConfirm === 2 && !needFourthDay) {
      if (tempC <= coverlineC) {
        return { outcome: 'failed', failedOnDay: d.dayNumber };
      }
      if (tempC >= coverlineC + THRESHOLD_C) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: false };
      }
      confirmingDays.push(d.dayNumber);
      needFourthDay = true;
    } else if (needFourthDay && positionInConfirm === 3) {
      if (checkFourthDayException(tempC, coverlineC)) {
        confirmingDays.push(d.dayNumber);
        return { outcome: 'confirmed', confirmingDays, usedFourthDay: true };
      }
      return { outcome: 'failed', failedOnDay: d.dayNumber };
    }

    j++;
  }

  return { outcome: 'pending', confirmingDays };
}
