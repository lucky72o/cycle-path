import { describe, it, expect } from 'vitest';
import { decideDismissedAction } from '../dismissedDecision';

describe('decideDismissedAction', () => {
  const confirmedResult = { status: 'confirmed', shiftDay: 15, coverlineTemp: 36.3 };
  const noneResult = { status: 'none', reason: 'no_shift_detected' };

  it('stays dismissed when fingerprint unchanged and engine finds same shift', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', confirmedResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('resets to SUGGESTED when fingerprint changed and engine finds same shift', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', confirmedResult, 'xyz');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('stays dismissed when fingerprint changed but engine returns none', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', noneResult, 'xyz');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('stays dismissed when fingerprint unchanged and engine returns none', () => {
    const action = decideDismissedAction(confirmedResult, 15, 'abc', noneResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });

  it('resets to SUGGESTED when engine finds a DIFFERENT shift day', () => {
    const newShift = { status: 'confirmed', shiftDay: 17, coverlineTemp: 36.4 };
    const action = decideDismissedAction(confirmedResult, 15, 'abc', newShift, 'abc');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('existing fingerprint null (legacy row) + new fingerprint present → treats as changed', () => {
    const action = decideDismissedAction(confirmedResult, 15, null, confirmedResult, 'abc');
    expect(action.kind).toBe('reset_to_suggested');
  });

  it('prefers engineResult.shiftDay when dismissedShiftDay is null', () => {
    const action = decideDismissedAction(confirmedResult, null, 'abc', confirmedResult, 'abc');
    expect(action.kind).toBe('refresh_engine_result');
  });
});
