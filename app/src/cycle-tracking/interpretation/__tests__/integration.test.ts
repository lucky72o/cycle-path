import { describe, it, expect } from 'vitest';
import { runInterpretation } from '../sensiplan/index';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: '06:30',
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}


describe('runInterpretation (orchestrator)', () => {
  it('returns full result for a textbook shift cycle', () => {
    const days: CycleDayInput[] = [];
    // 6 low temps + 3 confirming
    for (let i = 1; i <= 6; i++) days.push(day(i, 36.2 + (i % 2) * 0.1));
    days.push(day(7, 36.5));  // 1st higher
    days.push(day(8, 36.55)); // 2nd higher
    days.push(day(9, 36.6));  // 3rd higher ≥ +0.2

    const result = runInterpretation(days);

    expect(result.thermalShift.status).toBe('confirmed');
    expect(result.nudges).toBeDefined();
    expect(result.timeWindow).toBeDefined();
  });

  it('returns none result for an anovulatory cycle', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 20; i++) {
      days.push(day(i, 36.2 + (i % 3) * 0.05));
    }
    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('none');
  });

  it('returns pending when shift is mid-confirmation', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 6; i++) days.push(day(i, 36.2 + (i % 2) * 0.1));
    days.push(day(7, 36.5)); // only 1 higher temp

    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('pending');
  });

  it('generates post-shift dip nudge when applicable', () => {
    const days: CycleDayInput[] = [];
    for (let i = 1; i <= 6; i++) days.push(day(i, 36.2 + (i % 2) * 0.1));
    days.push(day(7, 36.5));
    days.push(day(8, 36.55));
    days.push(day(9, 36.6));
    days.push(day(10, 36.1)); // dip below coverline

    const result = runInterpretation(days);
    expect(result.thermalShift.status).toBe('confirmed');
    const dipNudges = result.nudges.filter((n) => n.type === 'post_shift_dip');
    expect(dipNudges.length).toBeGreaterThanOrEqual(1);
    expect(dipNudges[0].day).toBe(10);
  });
});
