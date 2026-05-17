import { describe, it, expect } from 'vitest';
import {
  getDayOfWeekAbbreviationChip,
  buildMonthSpans,
  computeContainerMinWidth,
  LEFT_PLOT_RESERVE_FALLBACK,
  RIGHT_PLOT_RESERVE,
  MIN_CELL_WIDTH,
  isCycleDayInTail,
  getCFBarColor,
  getCFBarHeight,
  type MonthSpan,
} from '../utils';

describe('getDayOfWeekAbbreviationChip', () => {
  it.each([
    ['Monday',    'M'],
    ['Tuesday',   'T'],
    ['Wednesday', 'W'],
    ['Thursday',  'Th'],
    ['Friday',    'F'],
    ['Saturday',  'Sa'],
    ['Sunday',    'Su'],
  ])('returns chip-sized abbreviation for %s -> %s', (input, expected) => {
    expect(getDayOfWeekAbbreviationChip(input)).toBe(expected);
  });

  it('returns the input unchanged for unknown values', () => {
    expect(getDayOfWeekAbbreviationChip('not-a-day')).toBe('not-a-day');
  });
});

describe('buildMonthSpans', () => {
  it('returns a single span for a cycle that stays within one month', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 1), 1, 15);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 1, endDayNumber: 15 },
    ]);
  });

  it('returns two spans for a cycle crossing a month boundary', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 26), 1, 13);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October',  startDayNumber: 1, endDayNumber: 6 },
      { monthIndex: 1, monthLabel: 'November', startDayNumber: 7, endDayNumber: 13 },
    ]);
  });

  it('returns four spans for a long cycle crossing three boundaries', () => {
    const spans = buildMonthSpans(new Date(2026, 8, 25), 1, 70);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'September', startDayNumber: 1,  endDayNumber: 6  },
      { monthIndex: 1, monthLabel: 'October',   startDayNumber: 7,  endDayNumber: 37 },
      { monthIndex: 2, monthLabel: 'November',  startDayNumber: 38, endDayNumber: 67 },
      { monthIndex: 3, monthLabel: 'December',  startDayNumber: 68, endDayNumber: 70 },
    ]);
  });

  it('handles cycle range starting at minDay > 1', () => {
    const spans = buildMonthSpans(new Date(2026, 9, 1), 10, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'October', startDayNumber: 10, endDayNumber: 20 },
    ]);
  });

  it('handles year boundary (Dec → Jan)', () => {
    const spans = buildMonthSpans(new Date(2026, 11, 20), 1, 20);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'December', startDayNumber: 1,  endDayNumber: 12 },
      { monthIndex: 1, monthLabel: 'January',  startDayNumber: 13, endDayNumber: 20 },
    ]);
  });

  it('returns an empty array when displayMaxDay < displayMinDay', () => {
    expect(buildMonthSpans(new Date(2026, 9, 1), 5, 3)).toEqual([]);
  });

  it('handles cycle starting on the last day of a month (1-day first span)', () => {
    // Cycle starts Jan 31, 2026; show days 1..10 → 1-day Jan span then 9-day Feb span.
    // This is the edge case that motivated pill-width clamping in CycleChartPage.tsx.
    const spans = buildMonthSpans(new Date(2026, 0, 31), 1, 10);
    expect(spans).toEqual<MonthSpan[]>([
      { monthIndex: 0, monthLabel: 'January',  startDayNumber: 1, endDayNumber: 1 },
      { monthIndex: 1, monthLabel: 'February', startDayNumber: 2, endDayNumber: 10 },
    ]);
  });
});

describe('computeContainerMinWidth', () => {
  it('returns the 800-px floor for typical 28-day cycles before measurement', () => {
    expect(computeContainerMinWidth(28, 0)).toBe(800);
  });

  it('scales with numDays when the floor is exceeded', () => {
    expect(computeContainerMinWidth(32, 0)).toBe(874);
    expect(computeContainerMinWidth(40, 0)).toBe(1050);
    expect(computeContainerMinWidth(50, 0)).toBe(1270);
  });

  it('prefers measured plotAreaOffset when larger than the fallback', () => {
    expect(computeContainerMinWidth(40, 145)).toBe(1065);
  });

  it('keeps the fallback when measured offset is smaller', () => {
    expect(computeContainerMinWidth(40, 100)).toBe(1050);
  });

  it('exports the constants so the chart component can re-use them', () => {
    expect(LEFT_PLOT_RESERVE_FALLBACK).toBe(130);
    expect(RIGHT_PLOT_RESERVE).toBe(40);
    expect(MIN_CELL_WIDTH).toBe(22);
  });
});

describe('isCycleDayInTail', () => {
  it('returns false for active cycles at any dayNumber', () => {
    const active = { isActive: true };
    expect(isCycleDayInTail(active, 1, 5)).toBe(false);
    expect(isCycleDayInTail(active, 5, 5)).toBe(false);
    expect(isCycleDayInTail(active, 28, 5)).toBe(false);
    expect(isCycleDayInTail(active, 6, 5)).toBe(false);
  });

  it('returns false for ended cycles within the recorded range', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 1, 8)).toBe(false);
    expect(isCycleDayInTail(ended, 5, 8)).toBe(false);
    expect(isCycleDayInTail(ended, 8, 8)).toBe(false);
  });

  it('returns true for ended cycles beyond the recorded max day', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 9, 8)).toBe(true);
    expect(isCycleDayInTail(ended, 14, 8)).toBe(true);
    expect(isCycleDayInTail(ended, 28, 8)).toBe(true);
  });

  it('returns false at the exact boundary (dayNumber === recordedMaxDay)', () => {
    expect(isCycleDayInTail({ isActive: false }, 8, 8)).toBe(false);
  });

  it('returns false for ended cycles whose recordedMaxDay >= 28 (long cycles)', () => {
    const ended = { isActive: false };
    expect(isCycleDayInTail(ended, 28, 35)).toBe(false);
    expect(isCycleDayInTail(ended, 35, 35)).toBe(false);
    // numbers above recordedMaxDay still tail, but in practice displayDayRange
    // wouldn't extend past recordedMaxDay for long cycles so the chart wouldn't ask.
    expect(isCycleDayInTail(ended, 36, 35)).toBe(true);
  });
});

describe('getCFBarColor (softened palette)', () => {
  it('maps each appearance to the softened hex', () => {
    expect(getCFBarColor('EGGWHITE')).toBe('#8fd9e6');
    expect(getCFBarColor('WATERY')).toBe('#bfe9f3');
    expect(getCFBarColor('CREAMY')).toBe('#cdeef0');
    expect(getCFBarColor('STICKY')).toBe('#dcf0f1');
    expect(getCFBarColor('NONE')).toBe('#e2e8f0');
  });
});

describe('getCFBarHeight (unchanged mapping)', () => {
  it('keeps the existing per-quality heights', () => {
    expect(getCFBarHeight('NONE')).toBe(28);
    expect(getCFBarHeight('STICKY')).toBe(56);
    expect(getCFBarHeight('CREAMY')).toBe(84);
    expect(getCFBarHeight('WATERY')).toBe(112);
    expect(getCFBarHeight('EGGWHITE')).toBe(140);
  });
});
