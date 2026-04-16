// app/src/cycle-tracking/interpretation/components/NeedsReviewCard.tsx
import { card, header, footer, btn } from './cardStyles';

type Props = {
  previous: any;
  current: any;
  reason: string;
  isNoneResult: boolean;
  onKeepMine: () => void;
  /** Only for different-shift reviews (not none) */
  onAcceptNew?: () => void;
  onAdjust?: () => void;
  /** Only for none reviews */
  onReject?: () => void;
};

export function NeedsReviewCard({
  previous, current, reason, isNoneResult,
  onKeepMine, onAcceptNew, onAdjust, onReject,
}: Props) {
  return (
    <div className={`${card.base} ${card.needsReview}`}>
      <div className={`${header.base} ${header.needsReview}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span className="font-semibold text-sm text-red-800">Interpretation Needs Review</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <div className="p-3 bg-red-50 rounded-md border border-red-200 text-xs">
          <strong className="text-red-800">Reason:</strong>{' '}
          <span className="text-gray-700">{reason}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 mb-1">Your confirmed</div>
            {previous && previous.status !== 'none' ? (
              <div className="text-xs text-gray-600 leading-relaxed">
                Shift: Day {previous.shiftDay}<br />
                Coverline: {previous.coverlineTemp?.toFixed(2)}°C
              </div>
            ) : (
              <div className="text-xs text-gray-400">No previous shift</div>
            )}
          </div>
          <div className="p-3 bg-violet-50 rounded-md border border-violet-200">
            <div className="text-xs font-semibold text-violet-600 mb-1">Engine now suggests</div>
            {current && current.status !== 'none' ? (
              <div className="text-xs text-gray-600 leading-relaxed">
                Shift: Day {current.shiftDay}<br />
                Coverline: {current.coverlineTemp?.toFixed(2)}°C
              </div>
            ) : (
              <div className="text-xs text-gray-500">No shift detected</div>
            )}
          </div>
        </div>
      </div>
      <div className={`${footer.base} bg-red-50 border-red-200`}>
        <button onClick={onKeepMine} className={`${btn.base} ${btn.keepMine}`}>Keep Mine</button>
        {onAcceptNew && <button onClick={onAcceptNew} className={`${btn.base} ${btn.acceptNew}`}>Accept New</button>}
        {onAdjust && <button onClick={onAdjust} className={`${btn.base} ${btn.adjust}`}>Adjust</button>}
        {onReject && <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>}
      </div>
    </div>
  );
}
