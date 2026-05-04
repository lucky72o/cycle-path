import { describe, it, expect } from 'vitest';
import { collectReferenceDays } from '../sensiplan/excludedDays';
import type { CycleDayInput } from '../types';

/** Helper: build a CycleDayInput with defaults. bbt is in Fahrenheit. */
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
      day(1, 97.5), day(2, 97.6), day(3, 97.4),
      day(4, 97.7), day(5, 97.5), day(6, 97.6),
      day(7, 97.8), day(8, 98.5),
    ];
    const result = collectReferenceDays(days, 7);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('skips excluded days and reaches back further', () => {
    const days = [
      day(1, 97.3), day(2, 97.5), day(3, 97.4),
      day(4, 97.7, { excludeFromInterpretation: true }),
      day(5, 97.5), day(6, 97.6), day(7, 97.4),
      day(8, 97.5), day(9, 98.5),
    ];
    const result = collectReferenceDays(days, 9);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([2, 3, 5, 6, 7, 8]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('skips excluded day that would have been highest — coverline recalculates lower', () => {
    const days = [
      day(1, 97.3), day(2, 97.5), day(3, 97.6),
      day(4, 98.0, { excludeFromInterpretation: true }),
      day(5, 97.4), day(6, 97.5), day(7, 97.7),
      day(8, 97.6),
      day(9, 98.5),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([4]);
  });

  it('handles 3+ excluded days (still evaluable, reaches back)', () => {
    const days = [
      day(1, 97.0), day(2, 97.1), day(3, 97.2),
      day(4, 97.3, { excludeFromInterpretation: true }),
      day(5, 97.4, { excludeFromInterpretation: true }),
      day(6, 97.5, { excludeFromInterpretation: true }),
      day(7, 97.6), day(8, 97.7), day(9, 97.8),
      day(10, 98.5),
    ];
    const result = collectReferenceDays(days, 10);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 7, 8, 9]);
    expect(result!.skippedDays).toEqual([4, 5, 6]);
  });

  it('returns null when fewer than 6 valid temps exist', () => {
    const days = [
      day(1, 97.5), day(2, 97.6), day(3, 97.4),
      day(4, 97.7), day(5, 97.5),
      day(6, 98.5),
    ];
    const result = collectReferenceDays(days, 6);
    expect(result).toBeNull();
  });

  it('skips days with null bbt', () => {
    const days = [
      day(1, 97.3), day(2, null), day(3, 97.5),
      day(4, 97.6), day(5, 97.4), day(6, 97.5),
      day(7, 97.7), day(8, 97.6),
      day(9, 98.5),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 3, 4, 5, 6, 7]);
    expect(result!.skippedDays).toEqual([]);
  });

  it('handles excluded day immediately before the candidate', () => {
    const days = [
      day(1, 97.3), day(2, 97.4), day(3, 97.5),
      day(4, 97.6), day(5, 97.7), day(6, 97.5),
      day(7, 97.6, { excludeFromInterpretation: true }),
      day(8, 98.5),
    ];
    const result = collectReferenceDays(days, 8);
    expect(result).not.toBeNull();
    expect(result!.referenceDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.skippedDays).toEqual([7]);
  });
});
