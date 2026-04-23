/**
 * Compare only the fields that constitute a materially different interpretation
 * from the user's perspective — the core Sensiplan result.
 *
 * Material fields: status, shiftDay, coverlineTemp, usedFourthDayException.
 *
 * Metadata fields that do NOT warrant a review notification:
 * referenceDays, skippedDays, failedAttempts, confidence, confidenceReasons,
 * confirmingDays (the specific day numbers — the count is implicit in
 * usedFourthDayException which covers the 3-vs-4 distinction).
 *
 * This prevents false "Needs Review" notifications when a data edit changes
 * internal engine bookkeeping but leaves the actual interpretation intact.
 */
export function hasMaterialChange(existing: any, incoming: any): boolean {
  const fields = ['status', 'shiftDay', 'coverlineTemp', 'usedFourthDayException'] as const;
  for (const field of fields) {
    if (existing?.[field] !== incoming?.[field]) return true;
  }
  return false;
}
