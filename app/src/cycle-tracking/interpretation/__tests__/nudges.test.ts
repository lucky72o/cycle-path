import { describe, it, expect } from 'vitest';
import { generateNudges } from '../sensiplan/nudges';
import type { CycleDayInput, ThermalShiftResult, TimeWindowResult } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9 / 5) + 32; }

const noWindow: TimeWindowResult = { hasWindow: false, segments: [] };

describe('generateNudges', () => {
  describe('pre-shift outlier detection', () => {
    it('nudges when a pre-shift temp spikes ≥ 0.2°C above neighbors', () => {
      const days = [
        day(1, cToF(36.3)), day(2, cToF(36.3)),
        day(3, cToF(36.6)), // spike: 0.3°C above neighbors
        day(4, cToF(36.3)), day(5, cToF(36.3)),
      ];
      // No shift — all pre-shift
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(1);
      expect(nudges[0].day).toBe(3);
      expect(nudges[0].type).toBe('pre_shift_outlier');
    });

    it('does not nudge when spike is < 0.2°C', () => {
      const days = [
        day(1, cToF(36.3)), day(2, cToF(36.3)),
        day(3, cToF(36.49)), // 0.19°C — below threshold
        day(4, cToF(36.3)), day(5, cToF(36.3)),
      ];
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(0);
    });

    it('skips excluded days when computing neighbors', () => {
      const days = [
        day(1, cToF(36.3)),
        day(2, cToF(36.8), { excludeFromInterpretation: true }), // excluded — skip
        day(3, cToF(36.6)), // neighbors are day 1 (36.3) and day 4 (36.3) → spike of 0.3
        day(4, cToF(36.3)),
      ];
      const shiftResult: ThermalShiftResult = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
      const nudges = generateNudges(days, shiftResult, noWindow);
      expect(nudges).toHaveLength(1);
      expect(nudges[0].day).toBe(3);
    });
  });

  describe('post-shift dip detection', () => {
    it('nudges when a post-shift temp drops below coverline without disturbance', () => {
      const shiftResult: ThermalShiftResult = {
        status: 'confirmed',
        shiftDay: 7, coverlineTemp: 36.3,
        referenceDays: [1, 2, 3, 4, 5, 6], confirmingDays: [7, 8, 9],
        skippedDays: [], usedFourthDayException: false,
        confidence: 'high', confidenceReasons: [], failedAttempts: [],
      };
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        day(10, cToF(36.2)), // below coverline, no disturbance
      ];
      const nudges = generateNudges(days, shiftResult, noWindow);
      const postNudges = nudges.filter((n) => n.type === 'post_shift_dip');
      expect(postNudges).toHaveLength(1);
      expect(postNudges[0].day).toBe(10);
    });

    it('does not nudge when post-shift dip has disturbance factors', () => {
      const shiftResult: ThermalShiftResult = {
        status: 'confirmed',
        shiftDay: 7, coverlineTemp: 36.3,
        referenceDays: [1, 2, 3, 4, 5, 6], confirmingDays: [7, 8, 9],
        skippedDays: [], usedFourthDayException: false,
        confidence: 'high', confidenceReasons: [], failedAttempts: [],
      };
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        day(10, cToF(36.2), { disturbanceFactors: ['POOR_SLEEP'] }),
      ];
      const nudges = generateNudges(days, shiftResult, noWindow);
      const postNudges = nudges.filter((n) => n.type === 'post_shift_dip');
      expect(postNudges).toHaveLength(0);
    });
  });
});
