import { describe, it, expect } from 'vitest';
import { getChartAnnotations, pickAnchorDay } from '../getChartAnnotations';
import type { CycleDayInput, ThermalShiftResult } from '../types';
import { celsiusToFahrenheit, fahrenheitToCelsius } from '../../utils';

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

/**
 * Build a `coverlineTemp` value matching the production engine's path:
 * the engine reads stored bbt (Fahrenheit) and converts to Celsius. Tests
 * must use the same round-trip so float-equality assertions exercise the
 * actual production precision behavior, not a literal that coincidentally
 * round-trips through F↔C.
 */
function makeCoverline(tempC: number): number {
  return fahrenheitToCelsius(celsiusToFahrenheit(tempC));
}

const engineNone: ThermalShiftResult = {
  status: 'none',
  reason: 'no_shift_detected',
  failedAttempts: [],
};

describe('getChartAnnotations', () => {
  const days = buildDays(Array.from({ length: 21 }, () => 36.3));

  it('returns null when interpretation is null', () => {
    expect(getChartAnnotations(days, null, engineNone)).toBeNull();
  });

  it('returns null for DISMISSED state', () => {
    const interp = { state: 'DISMISSED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null for SUGGESTED with engine status=none', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null for CONFIRMED with engine status=none', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, engineNone)).toBeNull();
  });

  it('returns null when engineResult is null/undefined and state is not ADJUSTED', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    expect(getChartAnnotations(days, interp, null)).toBeNull();
    expect(getChartAnnotations(days, interp, undefined)).toBeNull();
  });
});

describe('pickAnchorDay', () => {
  it('returns the only day matching coverlineTemp', () => {
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.32, 36.40]);
    const anchor = pickAnchorDay(days, [1, 2, 3, 4, 5, 6], makeCoverline(36.40));
    expect(anchor).toBe(6);
  });

  it('returns the latest day when multiple days tie at coverlineTemp', () => {
    // Days 2 and 5 both at 36.40 — anchor must be the latest (5)
    const days = buildDays([36.30, 36.40, 36.28, 36.30, 36.40, 36.32]);
    const anchor = pickAnchorDay(days, [1, 2, 3, 4, 5, 6], makeCoverline(36.40));
    expect(anchor).toBe(5);
  });

  it('throws when no day matches coverlineTemp (engine invariant violation)', () => {
    const days = buildDays([36.30, 36.32, 36.28, 36.30, 36.32, 36.30]);
    expect(() => pickAnchorDay(days, [1, 2, 3, 4, 5, 6], makeCoverline(36.99))).toThrow();
  });
});

const confirmedShift: ThermalShiftResult = {
  status: 'confirmed',
  shiftDay: 15,
  coverlineTemp: makeCoverline(36.32),
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15, 16, 17],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
};

const pendingShift: ThermalShiftResult = {
  status: 'pending',
  shiftDay: 15,
  coverlineTemp: makeCoverline(36.32),
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high',
  confidenceReasons: [],
  failedAttempts: [],
};

// Days 9-14 with day 14 = coverline temp (36.32)
const fullCycleDays = buildDays([
  36.30, 36.32, 36.28, 36.30, 36.32, 36.28,
  36.30, 36.32, 36.28, 36.30, 36.30, 36.30,
  36.30, 36.32,                              // day 14 = anchor (day 2 also 36.32 but outside referenceDays)
  36.55, 36.60, 36.58,                       // days 15, 16, 17
]);

describe('getChartAnnotations — SUGGESTED/CONFIRMED', () => {
  it('returns engine annotations for CONFIRMED state', () => {
    const interp = { state: 'CONFIRMED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, confirmedShift);
    expect(result).toEqual({
      referenceDays: [9, 10, 11, 12, 13, 14],
      anchorDay: 14,
      confirmingDays: [15, 16, 17],
      coverlineTemp: makeCoverline(36.32),
    });
  });

  it('returns engine annotations for SUGGESTED state', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, confirmedShift);
    expect(result?.anchorDay).toBe(14);
    expect(result?.referenceDays).toEqual([9, 10, 11, 12, 13, 14]);
  });

  it('returns pending data with confirmingDays length 1', () => {
    const interp = { state: 'SUGGESTED', userOverrides: null } as any;
    const result = getChartAnnotations(fullCycleDays, interp, pendingShift);
    expect(result?.confirmingDays).toEqual([15]);
    expect(result?.anchorDay).toBe(14);
    expect(result?.coverlineTemp).toBe(makeCoverline(36.32));
  });
});

describe('getChartAnnotations — ADJUSTED', () => {
  // 21-day cycle where the user picked day 15 as the shift day.
  // Days 9-14 are valid lows; day 14 is the highest (anchor).
  const adjustedDays = buildDays([
    36.30, 36.32, 36.28, 36.30, 36.32, 36.28,
    36.30, 36.32, 36.28, 36.30, 36.30, 36.30,
    36.30, 36.32,
    36.55, 36.60, 36.58,
    36.55, 36.55, 36.55, 36.55,
  ]);

  it('uses validateAdjustment when state is ADJUSTED — even if engine has none', () => {
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 15 } } as any;
    const result = getChartAnnotations(adjustedDays, interp, engineNone);
    expect(result).not.toBeNull();
    expect(result?.confirmingDays[0]).toBe(15);
    expect(result?.referenceDays).toHaveLength(6);
  });

  it('uses the user shift day, not the engine shift day, when they differ', () => {
    const otherShift: ThermalShiftResult = {
      ...confirmedShift,
      shiftDay: 16,            // engine says 16
      confirmingDays: [16, 17],
    };
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 15 } } as any;
    const result = getChartAnnotations(adjustedDays, interp, otherShift);
    expect(result?.confirmingDays[0]).toBe(15);
  });

  it('returns null for ADJUSTED with no userOverrides.shiftDay', () => {
    const interp = { state: 'ADJUSTED', userOverrides: null } as any;
    expect(getChartAnnotations(adjustedDays, interp, engineNone)).toBeNull();
    const interp2 = { state: 'ADJUSTED', userOverrides: {} } as any;
    expect(getChartAnnotations(adjustedDays, interp2, engineNone)).toBeNull();
  });

  it('returns null when validateAdjustment is invalid (stale ADJUSTED)', () => {
    // userOverrides points at day 1 — too early to have 6 reference days
    const interp = { state: 'ADJUSTED', userOverrides: { shiftDay: 1 } } as any;
    expect(getChartAnnotations(adjustedDays, interp, engineNone)).toBeNull();
  });
});
