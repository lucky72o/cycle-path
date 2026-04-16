// app/src/cycle-tracking/interpretation/components/ConfirmedCard.tsx
import type { ThermalShiftConfirmed, UserOverrides } from '../types';
import { card, header, footer, btn } from './cardStyles';
import { ConfidenceBadge } from './ConfidenceBadge';

type Props = {
  result: ThermalShiftConfirmed;
  onConfirm: () => Promise<void>;
  onAdjust: (overrides: UserOverrides) => Promise<void>;
  onReject: () => Promise<void>;
};

export function ConfirmedCard({ result, onConfirm, onAdjust, onReject }: Props) {
  return (
    <div className={`${card.base} ${card.suggested}`}>
      <div className={`${header.base} ${header.suggested}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500" />
          <span className="font-semibold text-sm">Thermal Shift Detected</span>
          <ConfidenceBadge confidence={result.confidence} />
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-500">Shift day:</span>
          <span className="font-medium">Day {result.shiftDay} <span className="text-gray-400 text-xs">(first higher temp)</span></span>
          <span className="text-gray-500">Coverline:</span>
          <span className="font-medium">{result.coverlineTemp.toFixed(2)}°C</span>
          <span className="text-gray-500">Reference temps:</span>
          <span className="font-medium">Days {result.referenceDays[0]}–{result.referenceDays[result.referenceDays.length - 1]} ({result.referenceDays.length} valid{result.skippedDays.length > 0 ? `, ${result.skippedDays.length} skipped` : ', none skipped'})</span>
        </div>
        <div className="p-3 bg-violet-50 rounded-md border border-violet-200">
          <div className="text-xs font-semibold text-violet-700 mb-2">Confirming temperatures:</div>
          {result.confirmingDays.map((dayNum, i) => (
            <div key={dayNum} className="flex justify-between text-xs leading-relaxed">
              <span>Day {dayNum}</span>
              {i === result.confirmingDays.length - 1 && !result.usedFourthDayException && (
                <span className="text-emerald-600 font-semibold">clears +0.2°C ✓</span>
              )}
              {i === result.confirmingDays.length - 1 && result.usedFourthDayException && (
                <span className="text-emerald-600 font-semibold">4th-day confirms ✓</span>
              )}
            </div>
          ))}
        </div>
        {result.usedFourthDayException && (
          <div className="p-2 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-800">
            ℹ️ The 3rd temp didn't reach +0.2°C. A 4th consecutive elevated temp confirms the shift (standard Sensiplan rule).
          </div>
        )}
        <div className="text-xs text-gray-400 italic">
          Confidence reflects data quality (CyclePath enhancement), not whether Sensiplan rules were met — they were.
        </div>
      </div>
      <div className={footer.base}>
        <button onClick={onConfirm} className={`${btn.base} ${btn.confirm}`}>Confirm</button>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
