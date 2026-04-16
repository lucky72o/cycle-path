// app/src/cycle-tracking/interpretation/components/PropositionCard.tsx
import type { InterpretationResult, PostShiftMonitoring, UserOverrides } from '../types';
import { PendingCard } from './PendingCard';
import { ConfirmedCard } from './ConfirmedCard';
import { UserConfirmedCard } from './UserConfirmedCard';
import { UserAdjustedCard } from './UserAdjustedCard';
import { KeptShiftCard } from './KeptShiftCard';
import { NeedsReviewCard } from './NeedsReviewCard';
import { FalseRiseWarningCard } from './FalseRiseWarningCard';
import { FailedAttemptsSection } from './FailedAttemptsSection';
import { ChangeNotice } from './ChangeNotice';

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
    dismiss: () => Promise<void>;
    resolveReview: (action: 'keep_mine' | 'accept_new' | 'reject') => Promise<void>;
    resolveFalseRise: (action: 'reject_shift' | 'keep_shift') => Promise<void>;
  };
};

export function PropositionCard({
  engineResult, interpretation, postShiftMonitoring,
  changeNotice, keepWatchingDismissed, onKeepWatching, actions,
}: PropositionCardProps) {
  const { thermalShift } = engineResult;
  const state = interpretation?.state;
  const needsReview = interpretation?.needsReview;
  const userOverrides = interpretation?.userOverrides as UserOverrides | null;

  // No proposition
  if (thermalShift.status === 'none' && !interpretation) return null;
  if (state === 'DISMISSED') return null;

  return (
    <div className="space-y-3 mt-4">
      {changeNotice && <ChangeNotice message={changeNotice} />}

      {needsReview && (
        <NeedsReviewCard
          previous={interpretation.previousEngineResult}
          current={thermalShift}
          reason={interpretation.reviewReason ?? ''}
          isNoneResult={thermalShift.status === 'none'}
          onKeepMine={() => actions.resolveReview('keep_mine')}
          onAcceptNew={thermalShift.status !== 'none' ? () => actions.resolveReview('accept_new') : undefined}
          onAdjust={thermalShift.status !== 'none' ? () => {/* open adjust flow */} : undefined}
          onReject={thermalShift.status === 'none' ? () => actions.resolveReview('reject') : undefined}
        />
      )}

      {!needsReview && thermalShift.status === 'pending' && state === 'SUGGESTED' && !keepWatchingDismissed && (
        <PendingCard
          result={thermalShift}
          onKeepWatching={onKeepWatching}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && thermalShift.status === 'confirmed' && state === 'SUGGESTED' && (
        <ConfirmedCard
          result={thermalShift}
          onConfirm={actions.confirm}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'CONFIRMED' && (
        <UserConfirmedCard
          result={thermalShift}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'ADJUSTED' && thermalShift.status !== 'none' && (
        <UserAdjustedCard
          result={thermalShift as any}
          userOverrides={userOverrides!}
          onAdjust={actions.adjust}
          onReject={actions.dismiss}
        />
      )}

      {!needsReview && state === 'ADJUSTED' && thermalShift.status === 'none' && userOverrides && (
        <KeptShiftCard
          userOverrides={userOverrides}
          onAdjust={actions.adjust}
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
