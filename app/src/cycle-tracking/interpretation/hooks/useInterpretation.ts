import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleInterpretation } from 'wasp/client/operations';
import { runInterpretation } from '../sensiplan/index';
import { monitorPostShift } from '../sensiplan/postShiftMonitoring';
import { computeCycleDataFingerprint } from '../dataFingerprint';
import type {
  CycleDayInput,
  ThermalShiftResult,
  InterpretationResult,
  PostShiftMonitoring,
  UserOverrides,
  Nudge,
} from '../types';

type UseInterpretationReturn = {
  /** The engine's latest evaluation */
  engineResult: InterpretationResult | null;
  /** The persisted interpretation from the DB (may be null if no proposition) */
  interpretation: any | null;  // CycleInterpretation entity
  /** Post-shift monitoring (computed against active values) */
  postShiftMonitoring: PostShiftMonitoring | null;
  /** Whether the interpretation is loading */
  isLoading: boolean;
  /** True when the user clicked Keep Watching on a pending card (local state only) */
  keepWatchingDismissed: boolean;
  /** Collapse the pending card locally (resets when engine result changes) */
  onKeepWatching: () => void;
  /** User action handlers */
  actions: {
    confirm: () => Promise<void>;
    adjust: (overrides: UserOverrides) => Promise<void>;
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
    resolveNudge: (day: number, response: 'yes_disturbed' | 'no_correct') => Promise<void>;
  };
};

/**
 * Orchestrates the interpretation engine lifecycle:
 * 1. Runs the engine when cycle data changes
 * 2. Compares with persisted state
 * 3. Handles persistence (create/update/delete)
 * 4. Manages re-evaluation and needsReview
 * 5. Exposes user action handlers
 */
export function useInterpretation(
  cycleId: string | undefined,
  days: CycleDayInput[],
): UseInterpretationReturn {
  const { data: interpretation, isLoading } = useQuery(
    getCycleInterpretation,
    { cycleId: cycleId ?? '', type: 'THERMAL_SHIFT' as const },
    { enabled: !!cycleId }
  );

  // Run engine whenever days change
  const engineResult = useMemo(() => {
    if (days.length === 0) return null;
    return runInterpretation(days);
  }, [days]);

  // Stable fingerprint of the BBT/exclusion data that affects the engine.
  // Used by upsertCycleInterpretation to detect data changes for DISMISSED
  // auto-recovery (fingerprint-aware dismissal reset).
  const dataFingerprint = useMemo(() => computeCycleDataFingerprint(days), [days]);

  // Keep Watching: local-only state. Collapses the pending card without
  // persisting anything. Resets when the engine result changes (new data
  // arrived), so the card re-appears with updated information.
  const [keepWatchingDismissed, setKeepWatchingDismissed] = useState(false);
  const prevResultRef = useRef<string | null>(null);

  useEffect(() => {
    const currentKey = engineResult
      ? JSON.stringify({
          s: engineResult.thermalShift.status,
          d: engineResult.thermalShift.status !== 'none'
            ? (engineResult.thermalShift as any).shiftDay
            : null,
        })
      : null;
    if (currentKey !== prevResultRef.current) {
      prevResultRef.current = currentKey;
      setKeepWatchingDismissed(false);
    }
  }, [engineResult]);

  const onKeepWatching = useCallback(() => {
    setKeepWatchingDismissed(true);
  }, []);

  // Compute post-shift monitoring against ACTIVE values.
  // Active values come from userOverrides (ADJUSTED) or engineResult (CONFIRMED).
  // Monitoring must also run when the engine returns none but the user kept their
  // shift (ADJUSTED + none) — the active values live entirely in userOverrides.
  const postShiftMonitoring = useMemo((): PostShiftMonitoring | null => {
    if (!interpretation || (interpretation.state !== 'CONFIRMED' && interpretation.state !== 'ADJUSTED')) return null;

    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shift = engineResult?.thermalShift;

    // Determine active values: overrides take precedence, fall back to engine
    const activeShiftDay = overrides?.shiftDay
      ?? (shift && shift.status !== 'none' ? shift.shiftDay : null);
    const activeCoverline = overrides?.coverlineTemp
      ?? (shift && shift.status !== 'none' ? shift.coverlineTemp : null);

    // If we can't determine active values, we can't monitor
    if (activeShiftDay == null || activeCoverline == null) return null;

    // lastConfirmDay: use engine's confirming days if available, otherwise
    // fall back to activeShiftDay + 2 (the minimum 3-over-6 window)
    const lastConfirmDay = (shift && shift.status === 'confirmed')
      ? Math.max(...shift.confirmingDays)
      : activeShiftDay + 2;

    const resolvedNudges = ((interpretation.pendingNudges as Nudge[]) ?? []).filter(
      (n) => n.resolved
    );

    const previousWarning = (interpretation.postShiftMonitoring as PostShiftMonitoring | null)?.falseRiseWarning ?? null;

    return monitorPostShift(
      days, activeShiftDay, activeCoverline, lastConfirmDay, resolvedNudges, previousWarning
    );
  }, [engineResult, interpretation, days]);

  // Persist engine results when they change.
  // The server-side upsertCycleInterpretation handles ALL state-aware
  // persistence logic (needsReview, delete for none+SUGGESTED, no-op for
  // DISMISSED, etc.) — so the hook is a thin caller.
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cycleId || !engineResult) return;

    // Dedupe key covers the full persisted payload — thermalShift, monitoring,
    // nudges, and data fingerprint — so changes to any of them trigger a write.
    const payload = {
      ts: engineResult.thermalShift,
      psm: postShiftMonitoring,
      n: engineResult.nudges,
      fp: dataFingerprint,
    };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastPersistedRef.current) return;
    lastPersistedRef.current = payloadJson;

    (async () => {
      try {
        const { upsertCycleInterpretation } = await import('wasp/client/operations');
        await upsertCycleInterpretation({
          cycleId,
          type: 'THERMAL_SHIFT',
          engineResult: engineResult.thermalShift,
          postShiftMonitoring: postShiftMonitoring ?? undefined,
          pendingNudges: engineResult.nudges,
          dataFingerprint,
        });
      } catch (err) {
        console.error('Failed to persist interpretation:', err);
      }
    })();
  }, [cycleId, engineResult, postShiftMonitoring, dataFingerprint]);

  // Action handlers
  const confirm = useCallback(async () => {
    if (!interpretation) return;
    const { confirmInterpretation } = await import('wasp/client/operations');
    await confirmInterpretation({ interpretationId: interpretation.id });
  }, [interpretation]);

  const adjust = useCallback(async (overrides: UserOverrides) => {
    if (!interpretation) return;
    const { adjustInterpretation } = await import('wasp/client/operations');
    await adjustInterpretation({ interpretationId: interpretation.id, userOverrides: overrides });
  }, [interpretation]);

  const dismiss = useCallback(async () => {
    if (!interpretation || !engineResult) return;
    const shift = engineResult.thermalShift;
    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shiftDay = overrides?.shiftDay ??
      (shift.status !== 'none' ? shift.shiftDay : 0);

    const { dismissInterpretation } = await import('wasp/client/operations');
    await dismissInterpretation({
      interpretationId: interpretation.id,
      dismissedShiftDay: shiftDay,
      dataFingerprint,
    });
  }, [interpretation, engineResult, dataFingerprint]);

  const resolveReviewAction = useCallback(async (action: 'keep_mine' | 'accept_new' | 'reject') => {
    if (!interpretation || !engineResult) return;
    const { resolveReview } = await import('wasp/client/operations');

    const prev = interpretation.previousEngineResult as any;
    const keptValues = action === 'keep_mine'
      ? (interpretation.userOverrides as UserOverrides) ??
        (prev ? { shiftDay: prev.shiftDay, coverlineTemp: prev.coverlineTemp } : undefined)
      : undefined;

    const dismissedShiftDay = action === 'reject'
      ? keptValues?.shiftDay ??
        ((interpretation.previousEngineResult as any)?.shiftDay) ?? 0
      : undefined;

    await resolveReview({
      interpretationId: interpretation.id,
      action,
      latestEngineResult: engineResult.thermalShift,
      keptValues: keptValues as { shiftDay: number; coverlineTemp: number } | undefined,
      dismissedShiftDay,
      dataFingerprint,
    });
  }, [interpretation, engineResult, dataFingerprint]);

  const resolveFalseRise = useCallback(async (action: 'reject_shift' | 'keep_shift') => {
    if (!interpretation || !engineResult) return;
    const { resolveFalseRiseWarning } = await import('wasp/client/operations');
    const shift = engineResult.thermalShift;
    const overrides = interpretation.userOverrides as UserOverrides | null;
    const shiftDay = overrides?.shiftDay ?? (shift.status !== 'none' ? shift.shiftDay : 0);

    await resolveFalseRiseWarning({
      interpretationId: interpretation.id,
      action,
      dismissedShiftDay: action === 'reject_shift' ? shiftDay : undefined,
    });
  }, [interpretation, engineResult]);

  const resolveNudgeAction = useCallback(async (day: number, response: 'yes_disturbed' | 'no_correct') => {
    if (!interpretation) return;
    const { resolveNudge } = await import('wasp/client/operations');
    await resolveNudge({
      interpretationId: interpretation.id,
      day,
      response,
    });
  }, [interpretation]);

  return {
    engineResult,
    interpretation,
    postShiftMonitoring,
    isLoading,
    keepWatchingDismissed,
    onKeepWatching,
    actions: {
      confirm,
      adjust,
      dismiss,
      resolveReview: resolveReviewAction,
      resolveFalseRise,
      resolveNudge: resolveNudgeAction,
    },
  };
}
