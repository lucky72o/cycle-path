import { describe, it, expect } from 'vitest';
import { getChartAnnotations } from '../getChartAnnotations';
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
