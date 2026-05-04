import { runInterpretation } from './interpretation/sensiplan';
import type { CycleDayInput } from './interpretation/types';

type InterpretationSummary = { id: string; state: 'SUGGESTED' | 'CONFIRMED' | 'ADJUSTED' | 'DISMISSED' };

type MarkAnovulatoryInput = {
  cycleIsActive: boolean;
  existingInterpretation: InterpretationSummary | null;
  days: CycleDayInput[];
  now: Date;
};

type MarkUninterpretableInput = {
  existingInterpretation: InterpretationSummary | null;
  days: CycleDayInput[];
  now: Date;
};

export type MarkDecision =
  | {
      kind: 'reject';
      status: 400 | 409;
      detail: string;
    }
  | {
      kind: 'proceed';
      cycleUpdate: {
        markedAnovulatoryAt: Date | null;
        markedUninterpretableAt: Date | null;
      };
      deleteInterpretationId: string | null;
    };

const ENGINE_GATE_DETAIL =
  'Cycle cannot be classified: the engine has not concluded no_shift_detected. ' +
  'Re-evaluate after adjusting exclusions, or Reject the current suggestion first.';

const ACTIVE_CYCLE_DETAIL =
  'Cannot mark an active cycle as anovulatory. Anovulation can only be determined ' +
  'retrospectively after the cycle ends.';

const CONFIRMED_ADJUSTED_DETAIL =
  'Cycle has a confirmed or adjusted interpretation. Reject it first before classifying.';

function engineSaysNoShiftDetected(days: CycleDayInput[]): boolean {
  const result = runInterpretation(days);
  const ts = result.thermalShift;
  return ts.status === 'none' && ts.reason === 'no_shift_detected';
}

function isConfirmedOrAdjusted(i: InterpretationSummary | null): boolean {
  return !!i && (i.state === 'CONFIRMED' || i.state === 'ADJUSTED');
}

export function decideMarkAnovulatory(input: MarkAnovulatoryInput): MarkDecision {
  if (input.cycleIsActive) {
    return { kind: 'reject', status: 400, detail: ACTIVE_CYCLE_DETAIL };
  }
  if (isConfirmedOrAdjusted(input.existingInterpretation)) {
    return { kind: 'reject', status: 409, detail: CONFIRMED_ADJUSTED_DETAIL };
  }
  if (!engineSaysNoShiftDetected(input.days)) {
    return { kind: 'reject', status: 409, detail: ENGINE_GATE_DETAIL };
  }
  return {
    kind: 'proceed',
    cycleUpdate: {
      markedAnovulatoryAt: input.now,
      markedUninterpretableAt: null, // mutual exclusivity: clear the other mark
    },
    deleteInterpretationId: input.existingInterpretation?.id ?? null,
  };
}

export function decideMarkUninterpretable(input: MarkUninterpretableInput): MarkDecision {
  if (isConfirmedOrAdjusted(input.existingInterpretation)) {
    return { kind: 'reject', status: 409, detail: CONFIRMED_ADJUSTED_DETAIL };
  }
  if (!engineSaysNoShiftDetected(input.days)) {
    return { kind: 'reject', status: 409, detail: ENGINE_GATE_DETAIL };
  }
  return {
    kind: 'proceed',
    cycleUpdate: {
      markedUninterpretableAt: input.now,
      markedAnovulatoryAt: null, // mutual exclusivity
    },
    deleteInterpretationId: input.existingInterpretation?.id ?? null,
  };
}
