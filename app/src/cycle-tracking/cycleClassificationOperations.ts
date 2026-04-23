import { HttpError } from 'wasp/server';
import type {
  MarkCycleAnovulatory,
  MarkCycleUninterpretable,
  UnmarkCycleClassification,
  ReEvaluateCycleInterpretation,
} from 'wasp/server/operations';
import type { Cycle } from 'wasp/entities';
import type { CycleDayInput } from './interpretation/types';
import { decideMarkAnovulatory, decideMarkUninterpretable } from './classificationDecisions';

type MarkInput = { cycleId: string };

async function getOwnedCycle(cycleId: string, userId: string, entities: any) {
  const cycle = await entities.Cycle.findUnique({
    where: { id: cycleId },
    include: { days: true },
  });
  if (!cycle) throw new HttpError(404, 'Cycle not found');
  if (cycle.userId !== userId) throw new HttpError(403, 'Not authorized');
  return cycle;
}

function daysToInput(rawDays: any[]): CycleDayInput[] {
  return rawDays.map((d) => ({
    dayNumber: d.dayNumber,
    bbt: d.bbt,
    bbtTime: d.bbtTime,
    excludeFromInterpretation: d.excludeFromInterpretation,
    disturbanceFactors: d.disturbanceFactors ?? [],
    travelTimeDiff: d.travelTimeDiff,
  }));
}

export const markCycleAnovulatory: MarkCycleAnovulatory<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await getOwnedCycle(args.cycleId, context.user.id, context.entities);
    const existingInterpretation = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: 'THERMAL_SHIFT' } },
    });

    const decision = decideMarkAnovulatory({
      cycleIsActive: cycle.isActive,
      existingInterpretation: existingInterpretation
        ? { id: existingInterpretation.id, state: existingInterpretation.state }
        : null,
      days: daysToInput(cycle.days),
      now: new Date(),
    });

    if (decision.kind === 'reject') {
      throw new HttpError(decision.status, decision.detail);
    }

    if (decision.deleteInterpretationId) {
      await context.entities.CycleInterpretation.delete({
        where: { id: decision.deleteInterpretationId },
      });
    }

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: decision.cycleUpdate,
    });
  };

export const markCycleUninterpretable: MarkCycleUninterpretable<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await getOwnedCycle(args.cycleId, context.user.id, context.entities);
    const existingInterpretation = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: 'THERMAL_SHIFT' } },
    });

    const decision = decideMarkUninterpretable({
      existingInterpretation: existingInterpretation
        ? { id: existingInterpretation.id, state: existingInterpretation.state }
        : null,
      days: daysToInput(cycle.days),
      now: new Date(),
    });

    if (decision.kind === 'reject') {
      throw new HttpError(decision.status, decision.detail);
    }

    if (decision.deleteInterpretationId) {
      await context.entities.CycleInterpretation.delete({
        where: { id: decision.deleteInterpretationId },
      });
    }

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: decision.cycleUpdate,
    });
  };

export const unmarkCycleClassification: UnmarkCycleClassification<MarkInput, Cycle> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    await getOwnedCycle(args.cycleId, context.user.id, context.entities);

    return context.entities.Cycle.update({
      where: { id: args.cycleId },
      data: {
        markedAnovulatoryAt: null,
        markedUninterpretableAt: null,
      },
    });
  };

type ReEvalInput = { cycleId: string; type: 'THERMAL_SHIFT' };

export const reEvaluateCycleInterpretation: ReEvaluateCycleInterpretation<ReEvalInput, void> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, 'Not authorized');
    const cycle = await context.entities.Cycle.findUnique({
      where: { id: args.cycleId },
    });
    if (!cycle) throw new HttpError(404, 'Cycle not found');
    if (cycle.userId !== context.user.id) throw new HttpError(403, 'Not authorized');

    const existing = await context.entities.CycleInterpretation.findUnique({
      where: { cycleId_type: { cycleId: args.cycleId, type: args.type } },
    });
    if (existing) {
      await context.entities.CycleInterpretation.delete({ where: { id: existing.id } });
    }
  };
