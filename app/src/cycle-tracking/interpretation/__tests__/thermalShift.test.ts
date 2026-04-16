import { describe, it, expect } from 'vitest';
import { detectThermalShift } from '../sensiplan/thermalShift';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime: null,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

// Helper: convert °C to °F for test data (stored in Fahrenheit)
function cToF(c: number): number { return (c * 9 / 5) + 32; }

describe('detectThermalShift', () => {
  describe('standard 3-over-6 confirmation', () => {
    it('detects a textbook thermal shift', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
        day(8, cToF(36.50)),
        day(9, cToF(36.55)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
        expect(result.confirmingDays).toEqual([7, 8, 9]);
        expect(result.usedFourthDayException).toBe(false);
      }
    });

    it('returns none when no shift is detectable', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.2)), day(8, cToF(36.3)), day(9, cToF(36.1)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('none');
      if (result.status === 'none') {
        expect(result.reason).toBe('no_shift_detected');
      }
    });

    it('returns none with insufficient_data when fewer than 6 valid temps', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)),
        day(3, cToF(36.5)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('none');
      if (result.status === 'none') {
        expect(result.reason).toBe('insufficient_data');
      }
    });
  });

  describe('pending detection', () => {
    it('returns pending when only 1 of 3 confirming temps recorded', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7]);
      }
    });

    it('returns pending when 2 of 3 confirming temps recorded', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
        day(8, cToF(36.50)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8]);
      }
    });

    it('returns pending when 4th-day exception is in progress', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
        day(8, cToF(36.40)),
        day(9, cToF(36.48)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8, 9]);
      }
    });
  });

  describe('4th-day exception', () => {
    it('confirms shift with 4th-day exception when 3rd temp below +0.2', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
        day(8, cToF(36.40)),
        day(9, cToF(36.48)),
        day(10, cToF(36.42)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 8, 9, 10]);
        expect(result.usedFourthDayException).toBe(true);
      }
    });
  });

  describe('failed attempts and resume scanning', () => {
    it('records failed attempt and finds shift later', () => {
      // day7=36.35 is above the 36.3 coverline (days 1-6) but fails when day8=36.20 drops below.
      // day11=36.45 is above the new 36.35 coverline (days 5-10) and gets confirmed by days 12,13.
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.35)),
        day(8, cToF(36.20)),
        day(9, cToF(36.3)),  day(10, cToF(36.2)),
        day(11, cToF(36.45)),
        day(12, cToF(36.50)),
        day(13, cToF(36.60)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(11);
        expect(result.failedAttempts).toHaveLength(1);
        expect(result.failedAttempts[0].attemptedShiftDay).toBe(7);
        expect(result.failedAttempts[0].failedOnDay).toBe(8);
      }
    });
  });

  describe('excluded days in confirming temps', () => {
    it('skips excluded day in the 3 highs and extends', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)),
        day(8, cToF(36.50), { excludeFromInterpretation: true }),
        day(9, cToF(36.48)),
        day(10, cToF(36.55)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
        expect(result.confirmingDays).toEqual([7, 9, 10]);
      }
    });
  });

  describe('first valid shift wins', () => {
    it('stops scanning after the first confirmed shift', () => {
      const days = [
        day(1, cToF(36.2)), day(2, cToF(36.3)), day(3, cToF(36.1)),
        day(4, cToF(36.3)), day(5, cToF(36.2)), day(6, cToF(36.3)),
        day(7, cToF(36.45)), day(8, cToF(36.50)), day(9, cToF(36.55)),
        day(10, cToF(36.2)), day(11, cToF(36.3)),
        day(12, cToF(36.6)), day(13, cToF(36.7)), day(14, cToF(36.8)),
      ];
      const result = detectThermalShift(days);
      expect(result.status).toBe('confirmed');
      if (result.status === 'confirmed') {
        expect(result.shiftDay).toBe(7);
      }
    });
  });
});
