// app/src/cycle-tracking/interpretation/interpretationOperations.ts
import { HttpError } from 'wasp/server';
import type {
  GetCycleInterpretation,
  UpsertCycleInterpretation,
  DeleteCycleInterpretation,
  ConfirmInterpretation,
  AdjustInterpretation,
  DismissInterpretation,
  ResolveReview,
  ResolveFalseRiseWarning,
  ResolveNudge,
} from 'wasp/server/operations';
import type { CycleInterpretation } from 'wasp/entities';

// ===== OWNERSHIP HELPER =====

/**
 * Fetch an interpretation by ID and verify the owning cycle belongs to the
 * requesting user. Throws 404 if not found, 403 if ownership check fails.
 */
async function getOwnedInterpretation(
  interpretationId: string,
  userId: string,
  entities: any
): Promise<CycleInterpretation> {
  const interp = await entities.CycleInterpretation.findUnique({
    where: { id: interpretationId },
    include: { cycle: { select: { userId: true } } },
  });
  if (!interp) throw new HttpError(404, 'Interpretation not found');
  if ((interp as any).cycle.userId !== userId) {
    throw new HttpError(403, 'Not authorized to access this interpretation');
  }
  return interp;
}

// ===== QUERY =====

type GetInterpretationInput = {
  cycleId: string;
  type: 'THERMAL_SHIFT';
};

export const getCycleInterpretation: GetCycleInterpretation<
  GetInterpretationInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  // Verify cycle belongs to user before returning interpretation
  const cycle = await context.entities.Cycle.findUnique({
    where: { id: args.cycleId },
  });
  if (!cycle || cycle.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to access this cycle');
  }

  return context.entities.CycleInterpretation.findUnique({
    where: {
      cycleId_type: { cycleId: args.cycleId, type: args.type },
    },
  });
};

// ===== ENGINE PERSISTENCE =====

type UpsertInput = {
  cycleId: string;
  type: 'THERMAL_SHIFT';
  engineResult: any;
  postShiftMonitoring?: any;
  pendingNudges?: any;
};

/**
 * State-aware engine persistence. Implements the spec's full persistence rules:
 *
 * - `none` + no row         → no-op (return null)
 * - `none` + SUGGESTED      → delete row (return null)
 * - `none` + CONFIRMED/ADJ  → set needsReview, store previousEngineResult
 * - `none` + DISMISSED      → no-op (preserve dismiss memory)
 * - non-none + no row       → create SUGGESTED
 * - non-none + SUGGESTED    → update engineResult
 * - non-none + CONF/ADJ     → if result changed: set needsReview, store previousEngineResult
 * - non-none + DISMISSED    → if different shift day: replace with new SUGGESTED; else no-op
 */
export const upsertCycleInterpretation: UpsertCycleInterpretation<
  UpsertInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  // Verify cycle belongs to user
  const cycle = await context.entities.Cycle.findUnique({
    where: { id: args.cycleId },
  });
  if (!cycle || cycle.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to access this cycle');
  }

  const existing = await context.entities.CycleInterpretation.findUnique({
    where: {
      cycleId_type: { cycleId: args.cycleId, type: args.type },
    },
  });

  const isNone = args.engineResult?.status === 'none';

  // ---- Engine returns none ----
  if (isNone) {
    if (!existing) return null; // No row, nothing to do

    switch (existing.state) {
      case 'SUGGESTED':
        // No user investment — delete the row
        await context.entities.CycleInterpretation.delete({
          where: { id: existing.id },
        });
        return null;

      case 'CONFIRMED':
      case 'ADJUSTED':
        // User had confirmed/adjusted — enter review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            needsReview: true,
            reviewReason:
              'The data no longer supports a thermal shift. The engine cannot detect a valid pattern with the current readings.',
            previousEngineResult: existing.engineResult,
            engineResult: args.engineResult,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });

      case 'DISMISSED':
        // Preserve dismiss memory — no change
        return existing;

      default:
        return existing;
    }
  }

  // ---- Engine returns non-none (confirmed or pending) ----
  if (!existing) {
    // No row → create SUGGESTED
    return context.entities.CycleInterpretation.create({
      data: {
        cycleId: args.cycleId,
        type: args.type,
        state: 'SUGGESTED',
        engineResult: args.engineResult,
        postShiftMonitoring: args.postShiftMonitoring ?? null,
        pendingNudges: args.pendingNudges ?? null,
      },
    });
  }

  // Helper: did the engine result change in any way the user should review?
  const resultChanged =
    JSON.stringify(existing.engineResult) !== JSON.stringify(args.engineResult);

  switch (existing.state) {
    case 'SUGGESTED':
      // Just update — no user investment to protect
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'CONFIRMED':
    case 'ADJUSTED':
      if (!resultChanged) {
        // Same result — just refresh monitoring/nudges, no review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      // Result changed — enter review
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: 'A data edit changed the engine\'s evaluation. Review the new result.',
          previousEngineResult: existing.engineResult,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'DISMISSED': {
      // If materially different shift day → replace with new SUGGESTED
      const oldEngineResult = existing.engineResult as any;
      const dismissedDay = existing.dismissedShiftDay ?? (oldEngineResult?.shiftDay ?? null);
      if (dismissedDay !== null && args.engineResult?.shiftDay !== dismissedDay) {
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            state: 'SUGGESTED',
            engineResult: args.engineResult,
            userOverrides: null,
            dismissedShiftDay: null,
            needsReview: false,
            reviewReason: null,
            previousEngineResult: null,
            postShiftMonitoring: args.postShiftMonitoring ?? null,
            pendingNudges: args.pendingNudges ?? null,
          },
        });
      }
      // Same shift day the user rejected — stay quiet
      return existing;
    }

    default:
      return existing;
  }
};

type DeleteInput = { interpretationId: string };

export const deleteCycleInterpretation: DeleteCycleInterpretation<
  DeleteInput,
  void
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  await context.entities.CycleInterpretation.delete({
    where: { id: args.interpretationId },
  });
};

// ===== USER ACTIONS =====

type IdInput = { interpretationId: string };

export const confirmInterpretation: ConfirmInterpretation<
  IdInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { state: 'CONFIRMED' },
  });
};

type AdjustInput = {
  interpretationId: string;
  userOverrides: { shiftDay?: number; coverlineTemp?: number };
};

export const adjustInterpretation: AdjustInterpretation<
  AdjustInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'ADJUSTED',
      userOverrides: args.userOverrides,
    },
  });
};

export const dismissInterpretation: DismissInterpretation<
  IdInput & { dismissedShiftDay: number },
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'DISMISSED',
      dismissedShiftDay: args.dismissedShiftDay,
      userOverrides: null,
    },
  });
};

type ResolveReviewInput = {
  interpretationId: string;
  action: 'keep_mine' | 'accept_new' | 'reject';
  latestEngineResult: any;
  keptValues?: { shiftDay: number; coverlineTemp: number };
  dismissedShiftDay?: number;
};

export const resolveReview: ResolveReview<
  ResolveReviewInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  switch (args.action) {
    case 'keep_mine': {
      // Promote to ADJUSTED — save kept values into userOverrides
      const userOverrides = args.keptValues ??
        (interp.userOverrides as any) ?? // already ADJUSTED
        null;

      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'ADJUSTED',
          engineResult: args.latestEngineResult,
          userOverrides,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });
    }

    case 'accept_new':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'CONFIRMED',
          engineResult: args.latestEngineResult,
          userOverrides: null,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });

    case 'reject':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'DISMISSED',
          engineResult: args.latestEngineResult,
          dismissedShiftDay: args.dismissedShiftDay,
          userOverrides: null,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: null,
        },
      });

    default:
      throw new HttpError(400, `Unknown action: ${args.action}`);
  }
};

type FalseRiseInput = {
  interpretationId: string;
  action: 'reject_shift' | 'keep_shift';
  dismissedShiftDay?: number;
};

export const resolveFalseRiseWarning: ResolveFalseRiseWarning<
  FalseRiseInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  if (args.action === 'reject_shift') {
    return context.entities.CycleInterpretation.update({
      where: { id: args.interpretationId },
      data: {
        state: 'DISMISSED',
        dismissedShiftDay: args.dismissedShiftDay,
        userOverrides: null,
        postShiftMonitoring: null,
      },
    });
  }

  // keep_shift — set falseRiseWarning to 'dismissed' in postShiftMonitoring
  const monitoring = (interp.postShiftMonitoring as any) ?? {};
  monitoring.falseRiseWarning = 'dismissed';

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { postShiftMonitoring: monitoring },
  });
};

type NudgeInput = {
  interpretationId: string;
  day: number;
  response: 'yes_disturbed' | 'no_correct';
};

export const resolveNudge: ResolveNudge<
  NudgeInput,
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities
  );

  const nudges = ((interp.pendingNudges as any[]) ?? []).map((n: any) => {
    if (n.day === args.day) {
      return { ...n, resolved: true, response: args.response };
    }
    return n;
  });

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: { pendingNudges: nudges },
  });
};
