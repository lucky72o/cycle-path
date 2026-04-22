/**
 * Given an existing DISMISSED interpretation and a new engine result,
 * decide what the next persistence action should be. Pure function — no DB.
 */
export type DismissedAction =
  | { kind: 'reset_to_suggested' }  // Data changed OR different shift day
  | { kind: 'refresh_engine_result' };  // Stay DISMISSED, keep engineResult current

export function decideDismissedAction(
  existingEngineResult: any,
  dismissedShiftDay: number | null,
  existingFingerprint: string | null,
  incomingEngineResult: any,
  incomingFingerprint: string,
): DismissedAction {
  const oldShiftDay = dismissedShiftDay ?? (existingEngineResult?.shiftDay ?? null);

  // Different shift day always resets (existing logic)
  if (
    incomingEngineResult?.status !== 'none' &&
    oldShiftDay !== null &&
    incomingEngineResult?.shiftDay !== oldShiftDay
  ) {
    return { kind: 'reset_to_suggested' };
  }

  // Same shift day + fingerprint changed + engine still finds a shift → auto-recover
  const fingerprintChanged = existingFingerprint !== incomingFingerprint;
  if (fingerprintChanged && incomingEngineResult?.status !== 'none') {
    return { kind: 'reset_to_suggested' };
  }

  return { kind: 'refresh_engine_result' };
}
