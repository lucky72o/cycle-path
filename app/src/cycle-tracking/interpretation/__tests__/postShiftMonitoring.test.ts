import { describe, it, expect } from 'vitest';
import { monitorPostShift } from '../sensiplan/postShiftMonitoring';
import type { CycleDayInput, Nudge, PostShiftMonitoring } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9 / 5) + 32; }

describe('monitorPostShift', () => {
  const shiftDay = 7;
  const coverlineC = 36.3;
  const lastConfirmDay = 9;

  it('returns inactive monitoring when no post-shift data exists', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.isActive).toBe(true);
    expect(result.daysMonitored).toBe(0);
    expect(result.dipsBelow).toEqual([]);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('counts unexplained dips below coverline', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), // dip, no disturbance
      day(11, cToF(36.25)), // still below, unexplained
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow).toHaveLength(2);
    expect(result.dipsBelow[0]).toEqual({ day: 10, temp: expect.closeTo(36.2, 1), explained: false, factors: [] });
    expect(result.consecutiveUnexplainedDips).toBe(2);
  });

  it('marks dip as explained when user resolved nudge with yes_disturbed', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), // dip
    ];
    const resolvedNudges: Nudge[] = [
      { day: 10, type: 'post_shift_dip', message: '', resolved: true, response: 'yes_disturbed' },
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, resolvedNudges);
    expect(result.dipsBelow[0].explained).toBe(true);
    expect(result.consecutiveUnexplainedDips).toBe(0);
  });

  it('marks dip as explained when day has disturbance factors', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2), { disturbanceFactors: ['ILLNESS_FEVER'] }),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow[0].explained).toBe(true);
    expect(result.consecutiveUnexplainedDips).toBe(0);
  });

  it('triggers false rise warning at 3+ consecutive unexplained dips', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)), day(12, cToF(36.25)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(3);
    expect(result.falseRiseWarning).toBe('active');
  });

  it('does not trigger at 2 consecutive unexplained dips', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)),
      day(12, cToF(36.5)), // above coverline — breaks chain
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(0); // reset by above-coverline day
    expect(result.falseRiseWarning).toBeNull();
  });

  it('resets consecutive count when explained dip breaks the chain', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)),  // unexplained
      day(11, cToF(36.2), { disturbanceFactors: ['POOR_SLEEP'] }), // explained — breaks chain
      day(12, cToF(36.25)), // unexplained
      day(13, cToF(36.1)),  // unexplained — only 2 consecutive
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(2);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('preserves dismissed warning state', () => {
    const days = [
      day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
      day(10, cToF(36.2)), day(11, cToF(36.1)), day(12, cToF(36.25)),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, [], 'dismissed');
    // Warning was previously dismissed — should stay dismissed even though dips still exist
    expect(result.falseRiseWarning).toBe('dismissed');
  });
});
