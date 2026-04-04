import { describe, it, expect } from 'vitest';
import { roundTo1Decimal, getTempNodeLabel } from '../utils';

describe('roundTo1Decimal', () => {
  it.each([
    // Fahrenheit raw -> expected rounded
    [98.25, 98.3],
    [97.77, 97.8],
    [98.15, 98.2],
    [98.07, 98.1],
    [98.60, 98.6],
    [97.95, 98.0],
    // Celsius raw -> expected rounded
    [36.58, 36.6],
    [36.65, 36.7],
    [36.00, 36.0],
    [37.04, 37.0],
    [37.06, 37.1],
  ])('rounds %f to %f', (input, expected) => {
    expect(roundTo1Decimal(input)).toBe(expected);
  });
});

describe('getTempNodeLabel', () => {
  describe('Fahrenheit (pre-rounded display values)', () => {
    it.each([
      [98.3, '3'],
      [97.8, '8'],
      [98.2, '2'],
      [98.1, '1'],
      [98.6, '6'],
      [98.0, '98'],
    ])('%.1f -> "%s"', (displayTemp, expected) => {
      expect(getTempNodeLabel(displayTemp)).toBe(expected);
    });
  });

  describe('Celsius (pre-rounded display values)', () => {
    it.each([
      [36.6, '6'],
      [36.7, '7'],
      [36.0, '36'],
      [37.0, '37'],
      [37.1, '1'],
    ])('%.1f -> "%s"', (displayTemp, expected) => {
      expect(getTempNodeLabel(displayTemp)).toBe(expected);
    });
  });

  describe('full pipeline (raw -> rounded -> label)', () => {
    it.each([
      [98.25, '3'],
      [97.77, '8'],
      [98.15, '2'],
      [98.07, '1'],
      [98.60, '6'],
      [97.95, '98'],
      [36.58, '6'],
      [36.65, '7'],
      [36.00, '36'],
      [37.04, '37'],
      [37.06, '1'],
    ])('raw %f -> label "%s"', (raw, expected) => {
      expect(getTempNodeLabel(roundTo1Decimal(raw))).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('returns null for null', () => {
      expect(getTempNodeLabel(null)).toBeNull();
    });
    it('returns null for undefined', () => {
      expect(getTempNodeLabel(undefined)).toBeNull();
    });
    it('returns null for NaN', () => {
      expect(getTempNodeLabel(NaN)).toBeNull();
    });
  });
});
