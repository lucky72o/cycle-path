import { describe, it, expect } from 'vitest';
import { roundTo1Decimal, getTempNodeLabel, formatLocalIsoDate } from '../utils';

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

describe('formatLocalIsoDate', () => {
  it('formats a plain local-midnight date as YYYY-MM-DD', () => {
    // new Date(year, monthIdx, day) constructs at LOCAL midnight regardless
    // of timezone, so this assertion holds in any TZ the test runs in.
    expect(formatLocalIsoDate(new Date(2025, 0, 1))).toBe('2025-01-01');
    expect(formatLocalIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('zero-pads month and day', () => {
    expect(formatLocalIsoDate(new Date(2025, 2, 5))).toBe('2025-03-05');
    expect(formatLocalIsoDate(new Date(2025, 8, 9))).toBe('2025-09-09');
  });

  it('returns the local date even when the local time would shift the UTC date', () => {
    // 23:30 local on March 1 — in any TZ east of UTC, toISOString() rolls to
    // March 2. The helper must NOT do that — it returns the calendar date the
    // user is sitting in, not what UTC happens to be at that instant.
    const lateEvening = new Date(2025, 2, 1, 23, 30, 0);
    expect(formatLocalIsoDate(lateEvening)).toBe('2025-03-01');

    // 00:30 local on March 1 — in any TZ west of UTC, toISOString() rolls to
    // Feb 28. Helper must still report March 1.
    const earlyMorning = new Date(2025, 2, 1, 0, 30, 0);
    expect(formatLocalIsoDate(earlyMorning)).toBe('2025-03-01');
  });

  it('survives setDate arithmetic across a DST boundary', () => {
    // Simulate the "padded chart day" path: cycle starts March 1 (in many
    // northern-hemisphere zones, this is BEFORE the spring-forward DST
    // change). Click day 35, which lands in April (AFTER the change).
    // setDate operates in local time — local midnight stays local midnight
    // through the DST hop. The helper reads local fields, so the saved
    // date matches the user's intended calendar day, not the UTC drift.
    const cycleStart = new Date(2025, 2, 1); // March 1 local
    const padded = new Date(cycleStart);
    padded.setDate(cycleStart.getDate() + 34); // advance 34 days → April 4 local
    expect(formatLocalIsoDate(padded)).toBe('2025-04-04');
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
