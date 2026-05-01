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
