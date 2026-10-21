import { describe, it, expect } from 'vitest';
import { computeMissingBbtDaysOnLine } from '../utils';

const days = [
  { dayNumber: 32, bbt: 37.08, excludeFromInterpretation: false },
  { dayNumber: 33, bbt: null, excludeFromInterpretation: false },
  { dayNumber: 34, bbt: 36.99, excludeFromInterpretation: false },
  { dayNumber: 35, bbt: 36.9, excludeFromInterpretation: false },
  // day 36 absent entirely
  { dayNumber: 37, bbt: 36.7, excludeFromInterpretation: false },
];
const id = (t: number) => t;

describe('computeMissingBbtDaysOnLine', () => {
  it('interpolates missing days only inside the displayed range', () => {
    expect(computeMissingBbtDaysOnLine(days, { minDay: 1, maxDay: 105 }, id)).toEqual([
      { dayNumber: 33, interpolatedTemp: (37.08 + 36.99) / 2 },
      { dayNumber: 36, interpolatedTemp: (36.9 + 36.7) / 2 },
    ]);
    expect(computeMissingBbtDaysOnLine(days, { minDay: 34, maxDay: 40 }, id)).toEqual([
      { dayNumber: 36, interpolatedTemp: (36.9 + 36.7) / 2 },
    ]);
  });

  it('does not mark excluded days that have a BBT (they show a grey dot already)', () => {
    const d = [
      { dayNumber: 1, bbt: 36, excludeFromInterpretation: false },
      { dayNumber: 2, bbt: 40, excludeFromInterpretation: true },
      { dayNumber: 3, bbt: 38, excludeFromInterpretation: false },
    ];
    expect(computeMissingBbtDaysOnLine(d, { minDay: 1, maxDay: 5 }, id)).toEqual([]);
  });

  it('applies the display conversion before interpolating', () => {
    const d = [
      { dayNumber: 1, bbt: 36, excludeFromInterpretation: false },
      { dayNumber: 3, bbt: 38, excludeFromInterpretation: false },
    ];
    expect(computeMissingBbtDaysOnLine(d, { minDay: 1, maxDay: 5 }, (t) => t * 2)).toEqual([
      { dayNumber: 2, interpolatedTemp: 74 },
    ]);
  });

  it('returns nothing with fewer than two usable days', () => {
    expect(computeMissingBbtDaysOnLine([days[0]], { minDay: 1, maxDay: 5 }, id)).toEqual([]);
  });
});
