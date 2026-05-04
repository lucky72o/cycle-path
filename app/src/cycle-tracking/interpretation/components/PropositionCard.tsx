// app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
import { useState } from 'react';
import type { InterpretationResult, PostShiftMonitoring, UserOverrides, CycleDayInput } from '../types';
import { PendingCard } from './PendingCard';
import { ConfirmedCard } from './ConfirmedCard';
import { UserConfirmedCard } from './UserConfirmedCard';
import { UserAdjustedCard } from './UserAdjustedCard';
import { KeptShiftCard } from './KeptShiftCard';
import { NeedsReviewCard } from './NeedsReviewCard';
import { FalseRiseWarningCard } from './FalseRiseWarningCard';
import { FailedAttemptsSection } from './FailedAttemptsSection';
import { ChangeNotice } from './ChangeNotice';
import { AdjustFlow } from './AdjustFlow';
import { DismissedCard } from './DismissedCard';
import { NoShiftCard } from './NoShiftCard';
import { InfoCard } from './InfoCard';

type PropositionCardProps = {
  engineResult: InterpretationResult;
  interpretation: any; // CycleInterpretation entity or null
  postShiftMonitoring: PostShiftMonitoring | null;
  changeNotice: string | null;
  keepWatchingDismissed: boolean;
  onKeepWatching: () => void;
  actions: {
    confirm: () => Promise<void>;
    adjust: (overrides: UserOverrides) => Promise<void>;
    revert: () => Promise<void>;
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
  };
  cycleIsActive: boolean;
  maxDayNumber: number;
  onReEvaluate: () => void;
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
  days: CycleDayInput[];
  cycleStartDate: Date;
};

export function PropositionCard({
  engineResult, interpretation, postShiftMonitoring,
  changeNotice, keepWatchingDismissed, onKeepWatching, actions,
  cycleIsActive, maxDayNumber,
  onReEvaluate, onMarkAnovulatory, onMarkUninterpretable,
  days, cycleStartDate,
}: PropositionCardProps) {
  const { thermalShift } = engineResult;
  const state = interpretation?.state;
  const needsReview = interpretation?.needsReview;
  const userOverrides = interpretation?.userOverrides as UserOverrides | null;
  const [adjustFlowOpen, setAdjustFlowOpen] = useState(false);

  // Priority 1: DISMISSED state → render DismissedCard (no longer a silent no-op).
  // Both mark buttons gated by DismissedCard on engine's current result per §5.3.4.
  if (state === 'DISMISSED') {
    return (
      <DismissedCard
        engineResult={thermalShift}
        cycleIsActive={cycleIsActive}
        onReEvaluate={onReEvaluate}
        onMarkAnovulatory={onMarkAnovulatory}
        onMarkUninterpretable={onMarkUninterpretable}
      />
    );
  }

  // Priority 2: no-shift-detected + no interpretation row
  const engineNoShift =
    thermalShift.status === 'none' &&
    (thermalShift as { reason?: string }).reason === 'no_shift_detected';

  if (!interpretation && engineNoShift) {
    if (!cycleIsActive) {
      return (
        <NoShiftCard
          onMarkAnovulatory={onMarkAnovulatory}
          onMarkUninterpretable={onMarkUninterpretable}
        />
      );
    }
    // Active cycle + engine says no shift: silent until day 7, InfoCard thereafter
    if (maxDayNumber >= 7) {
      return <InfoCard onMarkUninterpretable={onMarkUninterpretable} />;
    }
    return null;
  }

  // Preserve existing "no proposition" silent case for other none-with-no-row edge cases
  if (thermalShift.status === 'none' && !interpretation) return null;

  return (
    <div className="space-y-3 mt-4">
      {changeNotice && <ChangeNotice message={changeNotice} />}

      {/* Adjust flow */}
      {adjustFlowOpen && (
        <AdjustFlow
          currentResult={thermalShift}
          days={days}
          cycleStartDate={cycleStartDate}
          existingOverrides={userOverrides ?? undefined}
          onSave={async (overrides) => {
            await actions.adjust(overrides);
            setAdjustFlowOpen(false);
          }}
          onRevert={async () => {
            await actions.revert();
            setAdjustFlowOpen(false);
          }}
          onCancel={() => setAdjustFlowOpen(false)}
        />
      )}

      {needsReview && (
        <NeedsReviewCard
          previous={interpretation.previousEngineResult}
          current={thermalShift}
          reason={interpretation.reviewReason ?? ''}
          isNoneResult={thermalShift.status === 'none'}
          onKeepMine={() => actions.resolveReview('keep_mine')}
          onAcceptNew={thermalShift.status !== 'none' ? () => actions.resolveReview('accept_new') : undefined}
          onAdjust={thermalShift.status !== 'none' ? () => setAdjustFlowOpen(true) : undefined}
          onReject={thermalShift.status === 'none' ? () => actions.resolveReview('reject') : undefined}
        />
      )}

      {!needsReview && thermalShift.status === 'pending' && state === 'SUGGESTED' && !keepWatchingDismissed && (
        <PendingCard
          result={thermalShift}
          onKeepWatching={onKeepWatching}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && thermalShift.status === 'confirmed' && state === 'SUGGESTED' && (
        <ConfirmedCard
          result={thermalShift}
          onConfirm={actions.confirm}
          onAdjust={() => setAdjustFlowOpen(true)}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'CONFIRMED' && (
        <UserConfirmedCard
          result={thermalShift}
          onAdjust={() => setAdjustFlowOpen(true)}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'ADJUSTED' && thermalShift.status !== 'none' && (
        <UserAdjustedCard
          result={thermalShift as any}
          userOverrides={userOverrides!}
          days={days}
          onAdjust={() => setAdjustFlowOpen(true)}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'ADJUSTED' && thermalShift.status === 'none' && userOverrides && (
        <KeptShiftCard
          userOverrides={userOverrides}
          days={days}
          onReject={actions.dismiss}
        />
      )}

      {thermalShift.status !== 'none' && thermalShift.failedAttempts.length > 0 && (
        <FailedAttemptsSection attempts={thermalShift.failedAttempts} />
      )}

      {postShiftMonitoring?.falseRiseWarning === 'active' && (
        <FalseRiseWarningCard
          monitoring={postShiftMonitoring}
          shiftDay={userOverrides?.shiftDay ?? (thermalShift.status !== 'none' ? thermalShift.shiftDay : 0)}
          onRejectShift={() => actions.resolveFalseRise('reject_shift')}
          onKeepShift={() => actions.resolveFalseRise('keep_shift')}
        />
      )}
    </div>
  );
}
