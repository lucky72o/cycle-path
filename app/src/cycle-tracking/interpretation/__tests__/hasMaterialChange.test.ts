import { describe, it, expect } from 'vitest';
import { hasMaterialChange } from '../materialChange';

/**
 * Tests for the material change detection logic.
 *
 * Only these fields are "material" from a Sensiplan perspective:
 *   status, shiftDay, coverlineTemp, usedFourthDayException
 *
 * Changes to metadata fields (referenceDays, skippedDays, failedAttempts,
 * confidence, confidenceReasons, confirmingDays) should NOT trigger a review.
 */

const baseResult = {
  status: 'confirmed',
  shiftDay: 15,
  coverlineTemp: 36.3,
  referenceDays: [9, 10, 11, 12, 13, 14],
  confirmingDays: [15, 16, 17],
  skippedDays: [],
  usedFourthDayException: false,
  confidence: 'high' as const,
  confidenceReasons: [],
  failedAttempts: [],
};

describe('hasMaterialChange', () => {
  // ---- No change cases ----

  it('returns false when results are identical', () => {
    expect(hasMaterialChange(baseResult, { ...baseResult })).toBe(false);
  });

  it('returns false when only referenceDays change', () => {
    const incoming = { ...baseResult, referenceDays: [8, 10, 11, 12, 13, 14] };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  it('returns false when only confirmingDays change', () => {
    const incoming = { ...baseResult, confirmingDays: [15, 16, 18] };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  it('returns false when only skippedDays change', () => {
    const incoming = { ...baseResult, skippedDays: [14] };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  it('returns false when only confidence changes', () => {
    const incoming = { ...baseResult, confidence: 'low', confidenceReasons: ['skipped_days'] };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  it('returns false when only failedAttempts change', () => {
    const incoming = {
      ...baseResult,
      failedAttempts: [{ attemptedShiftDay: 10, coverlineTemp: 36.2, referenceDays: [4, 5, 6, 7, 8, 9], failureReason: 'temp_not_above', failedOnDay: 11 }],
    };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  it('returns false when multiple metadata fields change at once', () => {
    const incoming = {
      ...baseResult,
      referenceDays: [8, 10, 11, 12, 13, 14],
      confirmingDays: [15, 17, 18],
      skippedDays: [16],
      confidence: 'low' as const,
      confidenceReasons: ['skipped_days'],
      failedAttempts: [{ attemptedShiftDay: 10, coverlineTemp: 36.2, referenceDays: [], failureReason: 'test', failedOnDay: 11 }],
    };
    expect(hasMaterialChange(baseResult, incoming)).toBe(false);
  });

  // ---- Material change cases ----

  it('returns true when shiftDay changes', () => {
    const incoming = { ...baseResult, shiftDay: 16 };
    expect(hasMaterialChange(baseResult, incoming)).toBe(true);
  });

  it('returns true when coverlineTemp changes', () => {
    const incoming = { ...baseResult, coverlineTemp: 36.4 };
    expect(hasMaterialChange(baseResult, incoming)).toBe(true);
  });

  it('returns true when status changes (confirmed → pending)', () => {
    const incoming = { ...baseResult, status: 'pending' };
    expect(hasMaterialChange(baseResult, incoming)).toBe(true);
  });

  it('returns true when usedFourthDayException changes', () => {
    const incoming = { ...baseResult, usedFourthDayException: true };
    expect(hasMaterialChange(baseResult, incoming)).toBe(true);
  });

  it('returns true when status changes to none', () => {
    const incoming = { status: 'none', reason: 'no_shift_detected', failedAttempts: [] };
    expect(hasMaterialChange(baseResult, incoming)).toBe(true);
  });

  // ---- Edge cases ----

  it('handles null/undefined existing gracefully', () => {
    expect(hasMaterialChange(null, baseResult)).toBe(true);
    expect(hasMaterialChange(undefined, baseResult)).toBe(true);
  });

  it('handles null/undefined incoming gracefully', () => {
    expect(hasMaterialChange(baseResult, null)).toBe(true);
    expect(hasMaterialChange(baseResult, undefined)).toBe(true);
  });

  it('returns false when both are null', () => {
    expect(hasMaterialChange(null, null)).toBe(false);
  });

  it('returns false when both are undefined', () => {
    expect(hasMaterialChange(undefined, undefined)).toBe(false);
  });
});
