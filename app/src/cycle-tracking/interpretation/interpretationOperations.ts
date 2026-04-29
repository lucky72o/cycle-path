// app/src/cycle-tracking/interpretation/interpretationOperations.ts
import { HttpError } from 'wasp/server';
import { Prisma } from '@prisma/client';
import type {
  GetCycleInterpretation,
  UpsertCycleInterpretation,
  DeleteCycleInterpretation,
  ConfirmInterpretation,
  AdjustInterpretation,
  RevertInterpretation,
  DismissInterpretation,
  ResolveReview,
  ResolveFalseRiseWarning,
  ResolveNudge,
} from 'wasp/server/operations';
import type { CycleInterpretation } from 'wasp/entities';
import { hasMaterialChange } from './materialChange';
import { decideDismissedAction } from './dismissedDecision';

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
  dataFingerprint: string;  // NEW — required for DISMISSED auto-recovery
};

/**
 * State-aware engine persistence. Implements the spec's full persistence rules
 * (see docs/superpowers/specs/2026-04-20-coverline-recovery-and-cycle-classification.md §11).
 *
 * High-level:
 * - Cycle marked (anovulatory/uninterpretable) → delete any orphan row, return null
 * - `none` + no row         → no-op (return null)
 * - `none` + SUGGESTED      → delete row (return null)
 * - `none` + CONFIRMED/ADJ  → set needsReview, store previousEngineResult
 * - `none` + DISMISSED      → update engineResult only, stay DISMISSED
 * - non-none + no row       → create SUGGESTED
 * - non-none + SUGGESTED    → update engineResult
 * - non-none + CONF/ADJ     → if material change: needsReview; else silent update
 * - non-none + DISMISSED    → fingerprint-aware: different shift day → reset to SUGGESTED;
 *                             same shift day + fingerprint changed → reset to SUGGESTED (auto-recovery);
 *                             otherwise → refresh engineResult, stay DISMISSED
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

  // If the cycle is classified (anovulatory or uninterpretable), the engine
  // result is irrelevant. Defensive cleanup: delete any orphan interpretation row.
  if (cycle.markedAnovulatoryAt || cycle.markedUninterpretableAt) {
    const existing = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: args.type } },
    });
    if (existing) {
      await context.entities.CycleInterpretation.delete({ where: { id: existing.id } });
    }
    return null;
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
            previousEngineResult: existing.engineResult as Prisma.InputJsonValue,
            engineResult: args.engineResult,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });

      case 'DISMISSED':
        // Preserve the dismissal but keep engineResult fresh so the UI
        // (DismissedCard) can make accurate mark-button decisions based on
        // the latest engine finding. Per spec §11, DISMISSED + none always
        // updates engineResult; state stays DISMISSED.
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            engineResult: args.engineResult,
          },
        });

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

  // Did the core interpretation change in a way the user should review?
  // Only shiftDay, coverlineTemp, status, and usedFourthDayException are
  // "material." Metadata changes (referenceDays, confidence, etc.) update
  // the stored result silently without triggering a review notification.
  const materialChange = hasMaterialChange(existing.engineResult, args.engineResult);

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
      if (!materialChange) {
        // Core interpretation unchanged — silently refresh engine result,
        // monitoring, and nudges without triggering a review
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            engineResult: args.engineResult,
            postShiftMonitoring: args.postShiftMonitoring ?? undefined,
            pendingNudges: args.pendingNudges ?? undefined,
          },
        });
      }
      // Material change — enter review
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          needsReview: true,
          reviewReason: 'A data edit changed the engine\'s evaluation. Review the new result.',
          previousEngineResult: existing.engineResult as Prisma.InputJsonValue,
          engineResult: args.engineResult,
          postShiftMonitoring: args.postShiftMonitoring ?? undefined,
          pendingNudges: args.pendingNudges ?? undefined,
        },
      });

    case 'DISMISSED': {
      const action = decideDismissedAction(
        existing.engineResult,
        existing.dismissedShiftDay,
        existing.dismissedDataFingerprint,
        args.engineResult,
        args.dataFingerprint,
      );

      if (action.kind === 'reset_to_suggested') {
        return context.entities.CycleInterpretation.update({
          where: { id: existing.id },
          data: {
            state: 'SUGGESTED',
            engineResult: args.engineResult,
            userOverrides: Prisma.DbNull,
            dismissedShiftDay: null,
            dismissedDataFingerprint: null,
            needsReview: false,
            reviewReason: null,
            previousEngineResult: Prisma.DbNull,
            postShiftMonitoring: args.postShiftMonitoring ?? Prisma.DbNull,
            pendingNudges: args.pendingNudges ?? Prisma.DbNull,
          },
        });
      }

      // refresh_engine_result — respect the dismissal but keep engineResult fresh
      // so Re-evaluate/UI have current data (per spec §11)
      return context.entities.CycleInterpretation.update({
        where: { id: existing.id },
        data: {
          engineResult: args.engineResult,
          // postShiftMonitoring and pendingNudges are not persisted for DISMISSED
        },
      });
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

type RevertInput = { interpretationId: string };

/**
 * Revert an ADJUSTED interpretation to SUGGESTED, clearing userOverrides.
 *
 * Server-side preconditions (P1 — defense in depth, the UI also gates):
 * - The row's state MUST be 'ADJUSTED'. Calling revert on SUGGESTED, CONFIRMED,
 *   or DISMISSED is a 409 Conflict — there is nothing to revert.
 * - userOverrides.shiftDay MUST exist. An ADJUSTED row without a shiftDay
 *   override is malformed; treating it as revertable would silently destroy
 *   data the user did not intend to modify.
 *
 * Defensive (P1.B): if engineResult.status === 'none' at revert time AND
 * preconditions pass, delete the row entirely instead of demoting (mirrors
 * SUGGESTED+'none' deletion in upsertCycleInterpretation). The UI gating
 * prevents AdjustFlow from opening in that state, but the mutation is robust
 * to it (e.g., race conditions with concurrent data edits).
 */
export const revertInterpretation: RevertInterpretation<
  RevertInput,
  CycleInterpretation | null
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  const interp = await getOwnedInterpretation(
    args.interpretationId, context.user.id, context.entities,
  );

  // Precondition 1: state must be ADJUSTED
  if (interp.state !== 'ADJUSTED') {
    throw new HttpError(
      409,
      `Cannot revert: interpretation is in state '${interp.state}', not 'ADJUSTED'. There is no saved adjustment to revert.`,
    );
  }

  // Precondition 2: userOverrides.shiftDay must exist
  const overrides = interp.userOverrides as { shiftDay?: number } | null;
  if (overrides?.shiftDay == null) {
    throw new HttpError(
      409,
      'Cannot revert: ADJUSTED interpretation has no saved shiftDay override.',
    );
  }

  const engineResult = interp.engineResult as { status?: string } | null;
  if (engineResult?.status === 'none') {
    await context.entities.CycleInterpretation.delete({
      where: { id: args.interpretationId },
    });
    return null;
  }

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'SUGGESTED',
      userOverrides: Prisma.DbNull,
      needsReview: false,
      reviewReason: null,
      previousEngineResult: Prisma.DbNull,
    },
  });
};

export const dismissInterpretation: DismissInterpretation<
  IdInput & { dismissedShiftDay: number; dataFingerprint: string },
  CycleInterpretation
> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authorized');

  await getOwnedInterpretation(args.interpretationId, context.user.id, context.entities);

  return context.entities.CycleInterpretation.update({
    where: { id: args.interpretationId },
    data: {
      state: 'DISMISSED',
      dismissedShiftDay: args.dismissedShiftDay,
      dismissedDataFingerprint: args.dataFingerprint,
      userOverrides: Prisma.DbNull,
    },
  });
};

type ResolveReviewInput = {
  interpretationId: string;
  action: 'keep_mine' | 'accept_new' | 'reject';
  latestEngineResult: any;
  keptValues?: { shiftDay: number; coverlineTemp: number };
  dismissedShiftDay?: number;
  dataFingerprint: string;  // NEW
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
          previousEngineResult: Prisma.DbNull,
        },
      });
    }

    case 'accept_new':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'CONFIRMED',
          engineResult: args.latestEngineResult,
          userOverrides: Prisma.DbNull,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: Prisma.DbNull,
        },
      });

    case 'reject':
      return context.entities.CycleInterpretation.update({
        where: { id: args.interpretationId },
        data: {
          state: 'DISMISSED',
          engineResult: args.latestEngineResult,
          dismissedShiftDay: args.dismissedShiftDay,
          dismissedDataFingerprint: args.dataFingerprint,
          userOverrides: Prisma.DbNull,
          needsReview: false,
          reviewReason: null,
          previousEngineResult: Prisma.DbNull,
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
        userOverrides: Prisma.DbNull,
        postShiftMonitoring: Prisma.DbNull,
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
