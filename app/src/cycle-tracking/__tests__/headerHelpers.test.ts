import { describe, it, expect } from 'vitest';
import { getDayOfWeekAbbreviationChip } from '../utils';

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
