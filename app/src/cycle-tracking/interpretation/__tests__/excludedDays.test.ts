import { describe, it, expect } from 'vitest';
import { collectReferenceDays } from '../sensiplan/excludedDays';
import type { CycleDayInput } from '../types';

/** Helper: build a CycleDayInput with defaults. bbt is in Celsius. */
function day(dayNumber: number, bbt: number | null, opts?: Partial<CycleDayInput>): CycleDayInput {
  return {
    dayNumber,
    bbt,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...opts,
  };
}

describe('collectReferenceDays', () => {
  it('returns 6 consecutive valid days immediately before candidateDay', () => {
    const days = [
      day(1, 36.39), day(2, 36.44), day(3, 36.33),
      day(4, 36.50), day(5, 36.39), day(6, 36.44),
      day(7, 36.56), day(8, 36.94),
    ];
    const result = collectReferenceDays(days, 7);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('skips excluded days and reaches back further', () => {
    const days = [
      day(1, 36.28), day(2, 36.39), day(3, 36.33),
      day(4, 36.50, { excludeFromInterpretation: true }),
      day(5, 36.39), day(6, 36.44), day(7, 36.33),
      day(8, 36.39), day(9, 36.94),
    ];
    const result = collectReferenceDays(days, 9);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([2, 3, 5, 6, 7, 8]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('skips excluded day that would have been highest — coverline recalculates lower', () => {
    const days = [
      day(1, 36.28), day(2, 36.39), day(3, 36.44),
      day(4, 36.67, { excludeFromInterpretation: true }),
      day(5, 36.33), day(6, 36.39), day(7, 36.50),
      day(8, 36.44),
      day(9, 36.94),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('handles 3+ excluded days (still evaluable, reaches back)', () => {
    const days = [
      day(1, 36.11), day(2, 36.17), day(3, 36.22),
      day(4, 36.28, { excludeFromInterpretation: true }),
      day(5, 36.33, { excludeFromInterpretation: true }),
      day(6, 36.39, { excludeFromInterpretation: true }),
      day(7, 36.44), day(8, 36.50), day(9, 36.56),
      day(10, 36.94),
    ];
    const result = collectReferenceDays(days, 10);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 7, 8, 9]);
    expect(result!.skippedDays).toEqual([4, 5, 6]);
  });

  it('returns null when fewer than 6 valid temps exist', () => {
    const days = [
      day(1, 36.39), day(2, 36.44), day(3, 36.33),
      day(4, 36.50), day(5, 36.39),
      day(6, 36.94),
    ];
    const result = collectReferenceDays(days, 6);
    expect(result).toBeNull();
  });

  it('skips days with null bbt', () => {
    const days = [
      day(1, 36.28), day(2, null), day(3, 36.39),
      day(4, 36.44), day(5, 36.33), day(6, 36.39),
      day(7, 36.50), day(8, 36.44),
      day(9, 36.94),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 3, 4, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('handles excluded day immediately before the candidate', () => {
    const days = [
      day(1, 36.28), day(2, 36.33), day(3, 36.39),
      day(4, 36.44), day(5, 36.50), day(6, 36.39),
      day(7, 36.44, { excludeFromInterpretation: true }),
      day(8, 36.94),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([7]);
  });
});
