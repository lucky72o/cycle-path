// app/src/cycle-tracking/interpretation/__tests__/classificationDecisions.test.ts
import { describe, it, expect } from 'vitest';
import {
  decideMarkAnovulatory,
  decideMarkUninterpretable,
} from '../../classificationDecisions';
import type { CycleDayInput } from '../types';

// ---- Data-shape helpers ----

function day(n: number, bbtF: number | null, opts: Partial<CycleDayInput> = {}): CycleDayInput {
  return {
    dayNumber: n,
    bbt: bbtF,
    bbtTime: null,
    excludeFromInterpretation: false,
    disturbanceFactors: [],
    travelTimeDiff: null,
    ...opts,
  };
}

function cToF(c: number): number { return (c * 9) / 5 + 32; }

/** Days that force engine → none + no_shift_detected (zigzag, no biphasic). */
function daysWithNoShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 24; i++) {
    d.push(day(i, cToF(36.3 + (i % 2 === 0 ? 0.05 : -0.05))));
  }
  return d;
}

/** Days that force engine → none + insufficient_data (< 6 valid temps). */
function daysWithInsufficientData(): CycleDayInput[] {
  return [day(1, cToF(36.3)), day(2, cToF(36.2)), day(3, cToF(36.3))];
}

/** Days that force engine → confirmed (clear biphasic). */
function daysWithConfirmedShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 6; i++) d.push(day(i, cToF(36.2)));
  d.push(day(7, cToF(36.55)));
  d.push(day(8, cToF(36.55)));
  d.push(day(9, cToF(36.50)));
  return d;
}

/** Days that force engine → pending (candidate, no confirmation). */
function daysWithPendingShift(): CycleDayInput[] {
  const d: CycleDayInput[] = [];
  for (let i = 1; i <= 6; i++) d.push(day(i, cToF(36.2)));
  d.push(day(7, cToF(36.55)));
  return d;
}

const NOW = new Date('2026-04-20T12:00:00Z');

// ============================================================
// decideMarkAnovulatory
// ============================================================

describe('decideMarkAnovulatory', () => {
  // ---- Rejection: active cycle (Sensiplan strict) ----

  it('rejects 400 when cycle is active, regardless of engine result', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: true,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') {
      expect(decision.status).toBe(400);
      expect(decision.detail).toMatch(/anovulation.*retrospectively/i);
    }
  });

  // ---- Rejection: CONFIRMED/ADJUSTED state ----

  it('rejects 409 when existing interpretation is CONFIRMED', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'CONFIRMED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when existing interpretation is ADJUSTED', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'ADJUSTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  // ---- Rejection: engine gate ----

  it('rejects 409 when engine returns confirmed (viable shift)', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithConfirmedShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns pending', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithPendingShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns none + insufficient_data', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithInsufficientData(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  // ---- Acceptance: happy paths ----

  it('accepts when inactive + no existing row + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedAnovulatoryAt).toEqual(NOW);
      expect(decision.cycleUpdate.markedUninterpretableAt).toBeNull();
      expect(decision.deleteInterpretationId).toBeNull();
    }
  });

  it('accepts when inactive + state is DISMISSED + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i-dismissed', state: 'DISMISSED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBe('i-dismissed');
    }
  });

  it('accepts when inactive + state is SUGGESTED (engine-none) + engine says no_shift_detected', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: { id: 'i-sugg', state: 'SUGGESTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBe('i-sugg');
    }
  });

  // ---- Mutual exclusivity ----

  it('always sets markedUninterpretableAt to null on proceed (mutual exclusivity)', () => {
    const decision = decideMarkAnovulatory({
      cycleIsActive: false,
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedUninterpretableAt).toBeNull();
    } else {
      throw new Error('expected proceed');
    }
  });
});

// ============================================================
// decideMarkUninterpretable
// ============================================================

describe('decideMarkUninterpretable', () => {
  it('accepts on ACTIVE cycle + engine says no_shift_detected (no active-cycle guard)', () => {
    // Note: unlike anovulatory, uninterpretable is allowed on active cycles per §4.3
    // The decision itself takes no cycleIsActive arg — that guard doesn't exist here.
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
  });

  it('rejects 409 when existing interpretation is CONFIRMED', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'CONFIRMED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when existing interpretation is ADJUSTED', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'ADJUSTED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns confirmed (closes dismiss→mark bypass)', () => {
    // Explicit regression test: DISMISSED cycle whose latest engine result
    // is still a viable confirmed shift should be blocked.
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithConfirmedShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns pending (closes bypass for pending shifts)', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i1', state: 'DISMISSED' },
      days: daysWithPendingShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('rejects 409 when engine returns insufficient_data (active cycle, no row)', () => {
    // Regression: the original bypass path — active cycle with too little data
    // shouldn't be marked unreliable because the engine hasn't actually had a chance.
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithInsufficientData(),
      now: NOW,
    });
    expect(decision.kind).toBe('reject');
    if (decision.kind === 'reject') expect(decision.status).toBe(409);
  });

  it('accepts + proposes deleting existing DISMISSED row', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: { id: 'i-dismiss', state: 'DISMISSED' },
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedUninterpretableAt).toEqual(NOW);
      expect(decision.cycleUpdate.markedAnovulatoryAt).toBeNull();
      expect(decision.deleteInterpretationId).toBe('i-dismiss');
    }
  });

  it('accepts + no delete when no existing row', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    expect(decision.kind).toBe('proceed');
    if (decision.kind === 'proceed') {
      expect(decision.deleteInterpretationId).toBeNull();
    }
  });

  // ---- Mutual exclusivity ----

  it('always sets markedAnovulatoryAt to null on proceed (mutual exclusivity)', () => {
    const decision = decideMarkUninterpretable({
      existingInterpretation: null,
      days: daysWithNoShift(),
      now: NOW,
    });
    if (decision.kind === 'proceed') {
      expect(decision.cycleUpdate.markedAnovulatoryAt).toBeNull();
    } else {
      throw new Error('expected proceed');
    }
  });
});
