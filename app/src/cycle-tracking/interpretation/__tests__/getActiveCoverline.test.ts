import { describe, it, expect } from 'vitest';
import { getActiveCoverline } from '../getActiveCoverline';
import type { CycleDayInput, ThermalShiftResult } from '../types';
import { celsiusToFahrenheit } from '../../utils';

function buildDays(tempsC: (number | null)[]): CycleDayInput[] {
  return tempsC.map((tC, i) => ({
    dayNumber: i + 1,
    bbt: tC === null ? null : celsiusToFahrenheit(tC),
    bbtTime: '06:30',
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
  }));
}

const days = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32, 36.28, 36.30, 36.32,
  36.55, 36.50, 36.70, 36.55, 36.55, 36.55, 36.55,
]);

const engineConfirmed: ThermalShiftResult = {
  status: 'confirmed',
  shiftDay: 15,
  coverlineTemp: 36.32,
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15, 16, 17],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
};

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('getActiveCoverline', () => {
  it('returns null when interpretation is null', () => {
    expect(getActiveCoverline(days, null, engineConfirmed)).toBeNull();
  });

  it('returns engine coverline for SUGGESTED state', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns engine coverline for CONFIRMED state', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns null for SUGGESTED with engine status=none', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeNull();
  });

  it('returns derived coverline for ADJUSTED state with shiftDay override', () => {
    // User picks Day 14. 6 preceding lows = Days 8-13. Max = 36.32.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns derived coverline for ADJUSTED state even when engine status=none', () => {
    // KeptShiftCard scenario: engine no longer detects, but user's override stands.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeCloseTo(36.32, 2);
  });

  it('returns null for ADJUSTED state when override has insufficient preceding lows', () => {
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 4 } } as any;
    expect(getActiveCoverline(days, interp, engineNone)).toBeNull();
  });

  it('returns null for DISMISSED state', () => {
    const interp = { state: 'DISMISSED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeNull();
  });

  it('ignores stale userOverrides.coverlineTemp (no longer trusted)', () => {
    // Old DB record may have coverlineTemp; we recompute from shiftDay regardless.
    const interp = {
      state: 'ADJUSTED',
      userOverrides: { shiftDay: 14, coverlineTemp: 99.99 },
    } as any;
    expect(getActiveCoverline(days, interp, engineConfirmed)).toBeCloseTo(36.32, 2);
  });

  it('returns null when engineResult is null/undefined (P2 robustness)', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getActiveCoverline(days, interp, null)).toBeNull();
    expect(getActiveCoverline(days, interp, undefined)).toBeNull();
  });

  it('still derives ADJUSTED coverline even when engineResult is null', () => {
    // ADJUSTED path doesn't depend on engineResult — only on raw days + shiftDay.
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 14 } } as any;
    expect(getActiveCoverline(days, interp, null)).toBeCloseTo(36.32, 2);
  });
});
