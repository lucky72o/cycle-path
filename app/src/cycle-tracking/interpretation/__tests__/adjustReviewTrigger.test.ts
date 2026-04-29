import { describe, it, expect } from 'vitest';
import { shouldTriggerReviewForAdjusted } from '../adjustReviewTrigger';
import type { CycleDayInput, ThermalShiftResult } from '../types';
import { celsiusToFahrenheit } from '../../utils';

function buildDays(tempsC: (number | null)[], excluded: number[] = []): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: excluded.includes(i + 1),
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

const validDays = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
]);

const engineConfirmed = (shiftDay: number): ThermalShiftResult => ({
  status: 'confirmed',
  shiftDay,
  coverlineTemp: 36.32,
  referenceDays: [shiftDay - 6, shiftDay - 5, shiftDay - 4, shiftDay - 3, shiftDay - 2, shiftDay - 1],
  confirmingDays: [shiftDay, shiftDay + 1, shiftDay + 2],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
});

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('shouldTriggerReviewForAdjusted', () => {
  it('does NOT trigger when user pick is still valid and engine is unchanged', () => {
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(15));
    expect(result.trigger).toBe(false);
  });

  it('does NOT trigger when engine.status flips pending->confirmed at same shiftDay', () => {
    // engine output is confirmed, user pick still valid → no review (regression test for P1.2)
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(15));
    expect(result.trigger).toBe(false);
  });

  it('does NOT trigger when engine.shiftDay moves but user pick still valid', () => {
    // User picked Day 15; engine now picks Day 18 (somehow). User's pick still valid.
    // No earlier confirmed engine shift before Day 15.
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineConfirmed(18));
    expect(result.trigger).toBe(false);
  });

  it('triggers with reason="invalid_pick" when user pick fails Sensiplan rules', () => {
    // Days 1-14 lows but Day 15 (user's pick) has no temp recorded
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      null, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = shouldTriggerReviewForAdjusted(days, 15, engineConfirmed(16));
    expect(result.trigger).toBe(true);
    if (!result.trigger) return;
    expect(result.reason).toMatch(/invalid_pick/);
  });

  it('triggers when engine.status flips to none', () => {
    const result = shouldTriggerReviewForAdjusted(validDays, 15, engineNone);
    expect(result.trigger).toBe(true);
    if (!result.trigger) return;
    expect(result.reason).toMatch(/engine_lost_shift/);
  });

  it('triggers when raw data now shows earlier valid shift', () => {
    // User picked Day 15, but data now has Day 8 as confirmed earlier candidate
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50, 36.50,
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = shouldTriggerReviewForAdjusted(days, 15, engineConfirmed(8));
    expect(result.trigger).toBe(true);
    if (!result.trigger) return;
    expect(result.reason).toMatch(/invalid_pick|earlier_valid_shift/);
  });

  it('triggers when user excluded a low and now <6 valid pre-shift temps', () => {
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32,
        36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [1, 2],
    );
    const result = shouldTriggerReviewForAdjusted(days, 6, engineNone);
    expect(result.trigger).toBe(true);
  });
});
