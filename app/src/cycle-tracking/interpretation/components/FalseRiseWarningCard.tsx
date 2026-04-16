// app/src/cycle-tracking/interpretation/components/FalseRiseWarningCard.tsx
import type { PostShiftMonitoring } from '../types';
import { card, header, footer, btn } from './cardStyles';

type Props = {
  monitoring: PostShiftMonitoring;
  shiftDay: number;
  onRejectShift: () => void;
  onKeepShift: () => void;
};

export function FalseRiseWarningCard({ monitoring, shiftDay, onRejectShift, onKeepShift }: Props) {
  const unexplainedDips = monitoring.dipsBelow.filter((d) => !d.explained);

  return (
    <div className={`${card.base} ${card.falseRise}`}>
      <div className={`${header.base} ${header.needsReview}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span className="font-semibold text-sm text-red-800">Possible False Rise</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <div className="p-3 bg-red-50 rounded-md border border-red-200 text-xs text-gray-700">
          {monitoring.consecutiveUnexplainedDips} consecutive temperatures have dropped below the coverline
          without recorded disturbances since the shift on Day {shiftDay}. This may indicate the initial rise was not a true thermal shift.
        </div>
        {unexplainedDips.length > 0 && (
          <div className="text-xs text-gray-500">
            Unexplained dips on: {unexplainedDips.map((d) => `Day ${d.day}`).join(', ')}
          </div>
        )}
      </div>
      <div className={`${footer.base} bg-red-50 border-red-200`}>
        <button onClick={onRejectShift} className={`${btn.base} ${btn.rejectShift}`}>Reject This Shift</button>
        <button onClick={onKeepShift} className={`${btn.base} ${btn.keepShift}`}>Keep Shift</button>
      </div>
    </div>
  );
}
