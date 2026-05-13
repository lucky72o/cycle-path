import { describe, it, expect } from 'vitest';
import { getDayOfWeekAbbreviationChip, buildMonthSpans, type MonthSpan } from '../utils';

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
});
