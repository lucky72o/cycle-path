import { describe, it, expect } from 'vitest';
import { buildMonthSpans } from '../utils';
import { focusedOpenBlock, STANDARD_FRAME_DAYS, PILLS_FRAME_DAYS } from '../monthFolding';
import { buildReturnPath, dayNumberForDate } from '../returnFocus';

// 2026-07-07 start, 105 days: Jul = days 1-25, Aug 26-56, Sep 57-86, Oct 87-105.
const spans = buildMonthSpans(new Date('2026-07-07'), 1, 105);

describe('focusedOpenBlock', () => {
  it('keeps the default block when it already contains the focus day', () => {
    expect(focusedOpenBlock(spans, { from: 3, to: 3 }, 90, PILLS_FRAME_DAYS)).toEqual({ from: 3, to: 3 });
  });

  it('opens the focus month instead of the default when the day is folded', () => {
    expect(focusedOpenBlock(spans, { from: 3, to: 3 }, 30, PILLS_FRAME_DAYS)).toEqual({ from: 1, to: 1 });
  });

  it('grows later months first to fill the frame', () => {
    expect(focusedOpenBlock(spans, { from: 2, to: 3 }, 10, STANDARD_FRAME_DAYS)).toEqual({ from: 0, to: 1 });
  });

  it('grows earlier months when the focus month is the last one', () => {
    expect(focusedOpenBlock(spans, { from: 0, to: 1 }, 100, STANDARD_FRAME_DAYS)).toEqual({ from: 2, to: 3 });
  });

  it('keeps the default block for a day outside the cycle', () => {
    expect(focusedOpenBlock(spans, { from: 3, to: 3 }, 200, PILLS_FRAME_DAYS)).toEqual({ from: 3, to: 3 });
  });
});

describe('dayNumberForDate', () => {
  it('counts the start date as day 1', () => {
    expect(dayNumberForDate('2026-07-07T00:00:00.000Z', '2026-07-07')).toBe(1);
    expect(dayNumberForDate(new Date('2026-07-07'), '2026-08-01')).toBe(26);
  });
});

describe('buildReturnPath', () => {
  it('returns to the chart with the saved date when the change began on the chart', () => {
    expect(buildReturnPath('c1', 'chart', '2026-08-01')).toBe('/cycles/c1/chart?focus=2026-08-01');
  });

  it('returns to View Days otherwise', () => {
    expect(buildReturnPath('c1', null, '2026-08-01')).toBe('/cycles/c1/days?focus=2026-08-01');
  });

  it('carries no focus without a date (cancel)', () => {
    expect(buildReturnPath('c1', 'chart')).toBe('/cycles/c1/chart');
  });
});
