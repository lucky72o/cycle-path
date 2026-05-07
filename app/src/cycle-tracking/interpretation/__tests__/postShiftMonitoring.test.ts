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


describe('monitorPostShift', () => {
  const shiftDay = 7;
  const coverlineC = 36.3;
  const lastConfirmDay = 9;

  it('returns inactive monitoring when no post-shift data exists', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.isActive).toBe(true);
    expect(result.daysMonitored).toBe(0);
    expect(result.dipsBelow).toEqual([]);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('counts unexplained dips below coverline', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), // dip, no disturbance
      day(11, 36.25), // still below, unexplained
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow).toHaveLength(2);
    expect(result.dipsBelow[0]).toEqual({ day: 10, temp: expect.closeTo(36.2, 1), explained: false, factors: [] });
    expect(result.consecutiveUnexplainedDips).toBe(2);
  });

  it('marks dip as explained when user resolved nudge with yes_disturbed', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), // dip
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
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2, { disturbanceFactors: ['ILLNESS_FEVER'] }),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow[0].explained).toBe(true);
    expect(result.consecutiveUnexplainedDips).toBe(0);
  });

  it('triggers false rise warning at 3+ consecutive unexplained dips', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), day(11, 36.1), day(12, 36.25),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(3);
    expect(result.falseRiseWarning).toBe('active');
  });

  it('does not trigger at 2 consecutive unexplained dips', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), day(11, 36.1),
      day(12, 36.5), // above coverline — breaks running chain
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(2); // max consecutive was 2 (before reset)
    expect(result.falseRiseWarning).toBeNull();
  });

  it('resets consecutive count when explained dip breaks the chain', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2),  // unexplained
      day(11, 36.2, { disturbanceFactors: ['POOR_SLEEP'] }), // explained — breaks chain
      day(12, 36.25), // unexplained
      day(13, 36.1),  // unexplained — only 2 consecutive
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.consecutiveUnexplainedDips).toBe(2);
    expect(result.falseRiseWarning).toBeNull();
  });

  it('preserves dismissed warning state when dips at threshold', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), day(11, 36.1), day(12, 36.25),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, [], 'dismissed');
    // Warning was previously dismissed at threshold (3) — stays dismissed
    expect(result.falseRiseWarning).toBe('dismissed');
  });

  it('re-triggers warning when dismissed but new dips exceed threshold', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2), day(11, 36.1), day(12, 36.25), day(13, 36.15),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, [], 'dismissed');
    // 4 consecutive unexplained dips > threshold of 3 — re-trigger despite previous dismissal
    expect(result.consecutiveUnexplainedDips).toBe(4);
    expect(result.falseRiseWarning).toBe('active');
  });

  it('skips excluded days in post-shift monitoring', () => {
    const days = [
      day(7, 36.45), day(8, 36.50), day(9, 36.55),
      day(10, 36.2, { excludeFromInterpretation: true }), // excluded — should not count
      day(11, 36.5),
    ];
    const result = monitorPostShift(days, shiftDay, coverlineC, lastConfirmDay, []);
    expect(result.dipsBelow).toHaveLength(0); // excluded day not counted
    expect(result.daysMonitored).toBe(1); // only day 11
  });
});
