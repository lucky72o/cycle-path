import { describe, it, expect } from 'vitest';
import { calculateConfidence } from '../sensiplan/confidence';

describe('calculateConfidence', () => {
  it('returns high with 0 excluded days', () => {
    const result = calculateConfidence(0);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns high with 1 excluded day', () => {
    const result = calculateConfidence(1);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns high with 2 excluded days', () => {
    const result = calculateConfidence(2);
    expect(result.confidence).toBe('high');
    expect(result.reasons).toEqual([]);
  });

  it('returns low with 3 excluded days', () => {
    const result = calculateConfidence(3);
    expect(result.confidence).toBe('low');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('3');
  });

  it('returns low with 5 excluded days', () => {
    const result = calculateConfidence(5);
    expect(result.confidence).toBe('low');
    expect(result.reasons[0]).toContain('5');
  });
});
