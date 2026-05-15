import { describe, it, expect } from 'vitest';
import { computeCycleStartDate } from '../utils';

describe('computeCycleStartDate', () => {
  it('returns the first row date unchanged when firstDayNumber is 1', () => {
    const firstRowDate = new Date(2025, 1, 9); // 2025-02-09, local-calendar
    const result = computeCycleStartDate(firstRowDate, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February (0-indexed)
    expect(result.getDate()).toBe(9);
  });

  it('back-computes the start date for a mid-cycle first row', () => {
    // Cycle #1 case: first CSV row is 2025-01-27 with cd=16.
    // Day 1 should be 15 days earlier: 2025-01-12.
    const firstRowDate = new Date(2025, 0, 27); // 2025-01-27
    const result = computeCycleStartDate(firstRowDate, 16);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(12);
  });

  it('handles month boundaries correctly', () => {
    // First row 2025-03-02 with cd=5 -> start date = 2025-02-26
    const firstRowDate = new Date(2025, 2, 2);
    const result = computeCycleStartDate(firstRowDate, 5);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(26);
  });

  it('does not mutate the input date', () => {
    const firstRowDate = new Date(2025, 0, 27);
    const originalTime = firstRowDate.getTime();
    computeCycleStartDate(firstRowDate, 16);
    expect(firstRowDate.getTime()).toBe(originalTime);
  });

  it('returns a date with the same time-of-day as the input (no UTC drift)', () => {
    // Guard against accidental UTC arithmetic. Input is 2025-01-27 00:00 local;
    // result must be 2025-01-12 00:00 local, not shifted by the TZ offset.
    const firstRowDate = new Date(2025, 0, 27, 0, 0, 0, 0);
    const result = computeCycleStartDate(firstRowDate, 16);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('handles year boundaries correctly', () => {
    // First row 2025-01-05 with cd=10 -> start date = 2024-12-27.
    // setDate(5 - 9) normalizes back into the previous year.
    const result = computeCycleStartDate(new Date(2025, 0, 5), 10);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(27);
  });

  it('handles leap-year February correctly', () => {
    // 2024 is a leap year. First row 2024-03-03 with cd=5 -> start = 2024-02-28
    // (2024-02-29 exists, so day-1 lands two days before Mar 1, i.e. Feb 28).
    const result = computeCycleStartDate(new Date(2024, 2, 3), 5);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });
});
