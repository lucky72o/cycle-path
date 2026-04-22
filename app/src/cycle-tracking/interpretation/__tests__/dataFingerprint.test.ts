import { describe, it, expect } from 'vitest';
import { computeCycleDataFingerprint } from '../dataFingerprint';
import type { CycleDayInput } from '../types';

function day(n: number, bbt: number | null, overrides: Partial<CycleDayInput> = {}): CycleDayInput {
  return {
    dayNumber: n,
    bbt,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...overrides,
  };
}

describe('computeCycleDataFingerprint', () => {
  it('returns the same hash for identical inputs', () => {
    const a = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    const b = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('returns the same hash regardless of input order', () => {
    const a = [day(1, 97.3), day(2, 97.4), day(3, 97.2)];
    const b = [day(3, 97.2), day(1, 97.3), day(2, 97.4)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a temperature changes', () => {
    const a = [day(1, 97.3)];
    const b = [day(1, 97.4)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('ignores floating-point noise beyond 2 decimal places', () => {
    const a = [day(1, 97.30)];
    const b = [day(1, 97.30000000001)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when an exclusion flag changes', () => {
    const a = [day(1, 97.3, { excludeFromInterpretation: false })];
    const b = [day(1, 97.3, { excludeFromInterpretation: true })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when disturbance factors change', () => {
    const a = [day(1, 97.3, { disturbanceFactors: ['ILLNESS_FEVER'] })];
    const b = [day(1, 97.3, { disturbanceFactors: ['POOR_SLEEP'] })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('is order-insensitive for disturbance factors', () => {
    const a = [day(1, 97.3, { disturbanceFactors: ['ILLNESS_FEVER', 'POOR_SLEEP'] })];
    const b = [day(1, 97.3, { disturbanceFactors: ['POOR_SLEEP', 'ILLNESS_FEVER'] })];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when travelTimeDiff changes', () => {
    const a = [day(1, 97.3, { travelTimeDiff: null })];
    const b = [day(1, 97.3, { travelTimeDiff: 120 })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('treats null bbt differently from 0', () => {
    const a = [day(1, null)];
    const b = [day(1, 0)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a day is added', () => {
    const a = [day(1, 97.3)];
    const b = [day(1, 97.3), day(2, 97.4)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces non-empty string for empty input', () => {
    expect(computeCycleDataFingerprint([])).toMatch(/^[a-z0-9]+$/);
  });
});
