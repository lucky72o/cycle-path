import { describe, it, expect } from 'vitest';
import { toDisplayTemperature, convertToCelsiusForStorage } from '../utils';

describe('toDisplayTemperature', () => {
  it('returns the Celsius value unchanged when unit is CELSIUS', () => {
    expect(toDisplayTemperature(36.5, 'CELSIUS')).toBe(36.5);
  });

  it('converts Celsius to Fahrenheit when unit is FAHRENHEIT', () => {
    // 36.5 °C = 97.7 °F
    expect(toDisplayTemperature(36.5, 'FAHRENHEIT')).toBeCloseTo(97.7, 10);
  });

  it('converts at full float precision (no rounding)', () => {
    // 36.6996 °C = 98.05928 °F
    const result = toDisplayTemperature(36.6996, 'FAHRENHEIT');
    expect(result).toBeCloseTo(98.05928, 10);
  });

  it('returns null for null input', () => {
    expect(toDisplayTemperature(null, 'CELSIUS')).toBeNull();
    expect(toDisplayTemperature(null, 'FAHRENHEIT')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toDisplayTemperature(undefined, 'CELSIUS')).toBeNull();
    expect(toDisplayTemperature(undefined, 'FAHRENHEIT')).toBeNull();
  });

  it('treats 0 °C as a real value, not nullish', () => {
    expect(toDisplayTemperature(0, 'CELSIUS')).toBe(0);
    expect(toDisplayTemperature(0, 'FAHRENHEIT')).toBe(32);
  });
});

describe('convertToCelsiusForStorage', () => {
  it('returns Celsius input unchanged', () => {
    expect(convertToCelsiusForStorage(36.5, 'CELSIUS')).toBe(36.5);
  });

  it('converts Fahrenheit input to Celsius at full precision', () => {
    // 97.7 °F = (97.7 - 32) * 5/9 = 36.5 °C exactly
    expect(convertToCelsiusForStorage(97.7, 'FAHRENHEIT')).toBeCloseTo(36.5, 10);
  });

  it('does not round the result', () => {
    // 97.55 °F → 36.41666… °C (does not terminate at 2 decimals)
    const result = convertToCelsiusForStorage(97.55, 'FAHRENHEIT');
    expect(result).toBeCloseTo(36.41666666, 6);
  });
});
