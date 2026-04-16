// app/src/cycle-tracking/interpretation/components/UserConfirmedCard.tsx
import type { ThermalShiftResult, UserOverrides } from '../types';
import { card, header, footer, btn } from './cardStyles';
import { ConfidenceBadge } from './ConfidenceBadge';

type Props = {
  result: ThermalShiftResult;
  onAdjust: (overrides: UserOverrides) => Promise<void>;
  onReject: () => Promise<void>;
};

export function UserConfirmedCard({ result, onAdjust, onReject }: Props) {
  const shift = result.status !== 'none' ? result : null;

  return (
    <div className={`${card.base} ${card.confirmed}`}>
      <div className={`${header.base} ${header.confirmed}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-600" />
          <span className="font-semibold text-sm">Thermal Shift — Confirmed</span>
          {shift && <ConfidenceBadge confidence={shift.confidence} />}
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-2 leading-relaxed">
        {shift && (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <span className="text-gray-500">Shift day:</span>
            <span className="font-medium">Day {shift.shiftDay}</span>
            <span className="text-gray-500">Coverline:</span>
            <span className="font-medium">{shift.coverlineTemp.toFixed(2)}°C</span>
            <span className="text-gray-500">Reference temps:</span>
            <span className="font-medium">Days {shift.referenceDays[0]}–{shift.referenceDays[shift.referenceDays.length - 1]} ({shift.referenceDays.length} valid{shift.skippedDays.length > 0 ? `, ${shift.skippedDays.length} skipped` : ', none skipped'})</span>
          </div>
        )}
        <div className="text-xs text-emerald-600 italic mt-2">✓ You confirmed this interpretation</div>
      </div>
      <div className={`${footer.base} bg-green-50 border-green-200`}>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
