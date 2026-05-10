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
    const a = [day(1, 36.28), day(2, 36.33), day(3, 36.22)];
    const b = [day(1, 36.28), day(2, 36.33), day(3, 36.22)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('returns the same hash regardless of input order', () => {
    const a = [day(1, 36.28), day(2, 36.33), day(3, 36.22)];
    const b = [day(3, 36.22), day(1, 36.28), day(2, 36.33)];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a temperature changes', () => {
    const a = [day(1, 36.28)];
    const b = [day(1, 36.33)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('detects floating-point noise in raw floats (mirrors engine input exactly)', () => {
    const a = [day(1, 36.28)];
    const b = [day(1, 36.28000000001)];
    // With raw float hashing, even tiny differences produce different fingerprints
    // This ensures the fingerprint reflects the exact input the engine receives
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when an exclusion flag changes', () => {
    const a = [day(1, 36.28, { excludeFromInterpretation: false })];
    const b = [day(1, 36.28, { excludeFromInterpretation: true })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when disturbance factors change', () => {
    const a = [day(1, 36.28, { disturbanceFactors: ['ILLNESS_FEVER'] })];
    const b = [day(1, 36.28, { disturbanceFactors: ['POOR_SLEEP'] })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('is order-insensitive for disturbance factors', () => {
    const a = [day(1, 36.28, { disturbanceFactors: ['ILLNESS_FEVER', 'POOR_SLEEP'] })];
    const b = [day(1, 36.28, { disturbanceFactors: ['POOR_SLEEP', 'ILLNESS_FEVER'] })];
    expect(computeCycleDataFingerprint(a)).toBe(computeCycleDataFingerprint(b));
  });

  it('changes when travelTimeDiff changes', () => {
    const a = [day(1, 36.28, { travelTimeDiff: null })];
    const b = [day(1, 36.28, { travelTimeDiff: 120 })];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('treats null bbt differently from 0', () => {
    const a = [day(1, null)];
    const b = [day(1, 0)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('changes when a day is added', () => {
    const a = [day(1, 36.28)];
    const b = [day(1, 36.28), day(2, 36.33)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces non-empty string for empty input', () => {
    expect(computeCycleDataFingerprint([])).toMatch(/^[a-z0-9]+$/);
  });
});

describe('computeCycleDataFingerprint — threshold-edge precision', () => {
  it('produces different fingerprints for 36.699 vs 36.700', () => {
    const a = [day(1, 36.699)];
    const b = [day(1, 36.700)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces different fingerprints for 36.6996 vs 36.7004 (3-dp would have collapsed)', () => {
    const a = [day(1, 36.6996)];
    const b = [day(1, 36.7004)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });

  it('produces different fingerprints for 36.69999 vs 36.70001 (deep float territory)', () => {
    const a = [day(1, 36.69999)];
    const b = [day(1, 36.70001)];
    expect(computeCycleDataFingerprint(a)).not.toBe(computeCycleDataFingerprint(b));
  });
});
