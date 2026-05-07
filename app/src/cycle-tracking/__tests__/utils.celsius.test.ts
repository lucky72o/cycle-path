import { describe, it, expect } from 'vitest';
import { toDisplayTemperature } from '../utils';

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
