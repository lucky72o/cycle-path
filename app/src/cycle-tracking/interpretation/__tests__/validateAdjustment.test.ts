import { describe, it, expect } from 'vitest';
import { validateAdjustment } from '../sensiplan/validateAdjustment';
import type { CycleDayInput } from '../types';
import { celsiusToFahrenheit } from '../../utils';

// Helper: build CycleDayInput[] from a sequence of °C temperatures.
// Index in array = dayNumber - 1.
function buildDays(tempsC: (number | null)[], excludedDays: number[] = []): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: excludedDays.includes(i + 1),
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

// Standard 14-day low phase + 7-day high phase setup, easy to perturb
const cleanCycleDays = buildDays([
  // Days 1-14: low phase around 36.3
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  // Days 15-21: high phase, Day 15 is the shift, 17 clears +0.2
  36.55, 36.50, 36.60, 36.55, 36.55, 36.55, 36.55,
]);

describe('validateAdjustment', () => {
  it('1. returns confirmed when 3 highs satisfy 3-over-6 with 3rd clearing +0.2°C', () => {
    const result = validateAdjustment(cleanCycleDays, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
    expect(result.coverlineTemp).toBeCloseTo(36.32, 2);
    expect(result.usedFourthDayException).toBe(false);
  });

  it('2. returns confirmed via 4th-day exception when 3rd does not clear +0.2°C', () => {
    // Days 15-18 high but 17 doesn't clear +0.2; 18 still above coverline → confirmed via 4th
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, 36.40, 36.50, 36.50, 36.50, 36.50,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
    expect(result.usedFourthDayException).toBe(true);
  });

  it('3. returns pending when only 1 high recorded after picked day', () => {
    // Only Days 15-16 recorded; 17 onwards null
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.55, null, null, null, null, null, null,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('pending');
  });

  it('4. returns pending when 2 highs recorded but 2nd does not clear +0.2°C and no 3rd yet', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, null, null, null, null, null,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('pending');
  });

  it('5. returns invalid when a confirming temp drops at/below coverline', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.55, 36.30, 36.55, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('rule_broken');
  });

  it('6. returns invalid when 3rd does not clear +0.2°C and 4th day also at/below coverline', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.50, 36.45, 36.40, 36.30, 36.30, 36.30, 36.30,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('fourth_day_failed');
  });

  it('7. returns invalid with insufficient_lows when <6 valid preceding temps', () => {
    // Pick Day 5; only 4 preceding temps exist
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.55, 36.55, 36.70]);
    const result = validateAdjustment(days, 5);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('insufficient_lows');
  });

  it('8. returns invalid when picked day is excluded from interpretation', () => {
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [15],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('picked_day_excluded');
  });

  it('9. returns invalid when picked day has no temperature recorded', () => {
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      null, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('picked_day_no_temp');
  });

  it('10. returns invalid when picked day temp is not above the computed coverline', () => {
    // Days 9-14 max = 36.32 → coverline 36.32; Day 15 = 36.30 (below) → not above
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
      36.30, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('not_above_coverline');
  });

  it('11. soft-warning flag set when confirmed shift has pickedShiftDay <= 7', () => {
    // Build a cycle where Day 7 is a Sensiplan-valid shift and no earlier valid candidate exists
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28,           // Days 1-6 lows
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,    // Days 7-13 highs (Day 7 = shift)
    ]);
    const result = validateAdjustment(days, 7);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.softWarning).toBe('early_shift');
  });

  it('12. exclusions inside the 6-back window are skipped, scan continues further back', () => {
    // Pick Day 15. Days 9, 11 excluded. Reference window should pull from Days 7,8,10,12,13,14.
    const days = buildDays(
      [
        36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.50, 36.30, 36.50, 36.28, 36.30, 36.32,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [9, 11],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.referenceDays).toEqual([7, 8, 10, 12, 13, 14]);
    expect(result.skippedDays).toEqual([9, 11]);
  });

  it('13. P1.A: returns invalid when an earlier confirmed valid shift exists', () => {
    // Days 1-7 low (36.30), Days 8-13 high (36.50), Day 14 high (36.60).
    // detectThermalShift would return Day 8 as confirmed.
    // User picks Day 14 → reject with earlier_valid_shift_exists.
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50,
      36.60,
    ]);
    const result = validateAdjustment(days, 14);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.reason).toBe('earlier_valid_shift_exists');
    expect(result.earlierShiftDay).toBe(8);
  });

  it('14. P1.A: pending earlier candidates do not block', () => {
    // Days 1-7 low, Day 8 above coverline (would-be candidate) but only 1 confirming temp exists,
    // then no more data until Day 15 onwards.
    const days = buildDays([
      36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
      36.50, null, null, null, null, null, null,
      36.50, 36.50, 36.70, 36.50, 36.50, 36.50, 36.50,
    ]);
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
  });

  it('15. P1.A: user picks earlier than auto-detected shift → valid', () => {
    // Build a cycle where engine auto-detects Day 16 (e.g., because Day 14-15 don't have 3-over-6),
    // but user thinks Day 14 is right and Day 14 happens to have its own valid 3-over-6.
    // For this test we just verify that a valid earlier pick is accepted.
    const days = buildDays([
      36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30,
      36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
    ]);
    const result = validateAdjustment(days, 14);
    expect(result.kind).toBe('valid');
  });

  it('16. P1.A: user picks engine pick exactly → valid', () => {
    const result = validateAdjustment(cleanCycleDays, 15);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') return;
    expect(result.status).toBe('confirmed');
  });

  it('17. P1.A: excluded earlier days no longer count as earlier-valid-shift', () => {
    // Days 1-7 low, Days 8-10 high (would auto-confirm at Day 8) BUT all excluded.
    // Days 11-14 low again. Days 15-21 high.
    // detectThermalShift should skip Days 8-10 (excluded) and confirm at Day 15.
    // User picks Day 15 → valid.
    const days = buildDays(
      [
        36.30, 36.30, 36.30, 36.30, 36.30, 36.30, 36.30,
        36.50, 36.50, 36.50,
        36.30, 36.30, 36.30, 36.30,
        36.55, 36.55, 36.70, 36.55, 36.55, 36.55, 36.55,
      ],
      [8, 9, 10],
    );
    const result = validateAdjustment(days, 15);
    expect(result.kind).toBe('valid');
  });
});
