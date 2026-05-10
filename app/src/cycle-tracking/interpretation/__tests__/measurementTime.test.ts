import { describe, it, expect } from 'vitest';
import { calculateTimeWindow, isWithinWindow } from '../sensiplan/measurementTime';
import type { CycleDayInput } from '../types';

function day(dayNumber: number, bbt: number | null, bbtTime: string | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber, bbt, bbtTime,
    excludeFromInterpretation: false, disturbanceFactors: [], travelTimeDiff: null,
    ...opts,
  };
}

describe('calculateTimeWindow', () => {
  it('returns hasWindow=false with fewer than 5 data points', () => {
    const days = [
      day(1, 36.39, '06:30'), day(2, 36.44, '06:45'),
      day(3, 36.33, '07:00'), day(4, 36.39, '06:50'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(false);
    expect(result.segments).toEqual([]);
  });

  it('calculates a single-segment window with 5+ data points', () => {
    const days = [
      day(1, 36.39, '06:30'), day(2, 36.44, '06:45'),
      day(3, 36.33, '07:00'), day(4, 36.39, '06:50'),
      day(5, 36.44, '06:35'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    expect(result.segments).toHaveLength(1);
    const seg = result.segments[0];
    expect(seg.window.meanMinutes).toBeGreaterThan(390);
    expect(seg.window.meanMinutes).toBeLessThan(420);
  });

  it('handles midnight-crossing times correctly via circular averaging', () => {
    const days = [
      day(1, 36.39, '23:30'), day(2, 36.44, '23:45'),
      day(3, 36.33, '00:00'), day(4, 36.39, '00:15'),
      day(5, 36.44, '00:30'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    const mean = result.segments[0].window.meanMinutes;
    const nearMidnight = mean < 30 || mean > 1410;
    expect(nearMidnight).toBe(true);
  });

  it('skips days with null bbtTime in the calculation', () => {
    const days = [
      day(1, 36.39, '06:30'), day(2, 36.44, null),
      day(3, 36.33, '07:00'), day(4, 36.39, '06:50'),
      day(5, 36.44, '06:35'), day(6, 36.39, '06:40'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    expect(result.segments).toHaveLength(1);
  });

  it('splits into segments when travel event detected', () => {
    const days = [
      day(1, 36.39, '06:30'), day(2, 36.44, '06:45'),
      day(3, 36.33, '07:00'), day(4, 36.39, '06:50'),
      day(5, 36.44, '06:35'),
      day(6, 36.39, '09:30', { travelTimeDiff: 180 }),
      day(7, 36.44, '09:45'), day(8, 36.33, '10:00'),
      day(9, 36.39, '09:50'), day(10, 36.44, '09:35'),
    ];
    const result = calculateTimeWindow(days);
    expect(result.hasWindow).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].toDay).toBe(5);
    expect(result.segments[1].fromDay).toBe(6);
  });
});

describe('isWithinWindow', () => {
  it('returns true for a time within the window', () => {
    expect(isWithinWindow('06:30', { meanMinutes: 400, windowStart: 340, windowEnd: 460 })).toBe(true);
  });

  it('returns false for a time outside the window', () => {
    expect(isWithinWindow('10:00', { meanMinutes: 400, windowStart: 340, windowEnd: 460 })).toBe(false);
  });

  it('handles midnight-wrapped window (windowStart > windowEnd)', () => {
    expect(isWithinWindow('23:30', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(true);
    expect(isWithinWindow('00:30', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(true);
    expect(isWithinWindow('12:00', { meanMinutes: 0, windowStart: 1380, windowEnd: 60 })).toBe(false);
  });
});
