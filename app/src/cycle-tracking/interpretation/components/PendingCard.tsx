// app/src/cycle-tracking/interpretation/components/PendingCard.tsx
import type { ThermalShiftPending, UserOverrides } from '../types';
import { card, header, footer, btn } from './cardStyles';

type Props = {
  result: ThermalShiftPending;
  onKeepWatching: () => void;
  onAdjust: (overrides: UserOverrides) => Promise<void>;
  onReject: () => Promise<void>;
};

export function PendingCard({ result, onKeepWatching, onAdjust, onReject }: Props) {
  return (
    <div className={`${card.base} ${card.suggested}`}>
      <div className={`${header.base} ${header.suggested}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500" />
          <span className="font-semibold text-sm">Potential Thermal Shift Forming</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-2 leading-relaxed">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-500">Possible shift day:</span>
          <span className="font-medium">Day {result.shiftDay}</span>
          <span className="text-gray-500">Coverline:</span>
          <span className="font-medium">{result.coverlineTemp.toFixed(2)}°C</span>
          <span className="text-gray-500">Reference temps:</span>
          <span className="font-medium">Days {result.referenceDays[0]}–{result.referenceDays[result.referenceDays.length - 1]} ({result.referenceDays.length} valid)</span>
          <span className="text-gray-500">Status:</span>
          <span className="font-medium">
            <span className="text-violet-600">{result.confirmingDays.length} of 3</span> confirming temps recorded
          </span>
        </div>
        <div className="mt-3 p-3 bg-gray-50 rounded-md text-xs text-gray-500">
          Awaiting {3 - result.confirmingDays.length} more elevated temperature{3 - result.confirmingDays.length > 1 ? 's' : ''} to confirm. Keep recording.
        </div>
      </div>
      <div className={footer.base}>
        <button onClick={onKeepWatching} className={`${btn.base} ${btn.keepWatching}`}>Keep Watching</button>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject This Pattern</button>
      </div>
    </div>
  );
}
