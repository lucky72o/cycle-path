// app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx
import type { ThermalShiftConfirmed, ThermalShiftPending, UserOverrides, CycleDayInput } from '../types';
import { card, header, footer, btn } from './cardStyles';
import { collectReferenceDays } from '../sensiplan/excludedDays';

type Props = {
  result: ThermalShiftConfirmed | ThermalShiftPending;
  userOverrides: UserOverrides;
  days: CycleDayInput[];
  onAdjust: () => void;
  onReject: () => Promise<void>;
};

export function UserAdjustedCard({ result, userOverrides, days, onAdjust, onReject }: Props) {
  const activeShiftDay = userOverrides.shiftDay ?? result.shiftDay;
  const ref = collectReferenceDays(days, activeShiftDay);
  const activeCoverline = ref?.coverlineTemp ?? result.coverlineTemp;
  const isPending = result.status === 'pending';

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-600" />
          <span className="font-semibold text-sm">
            Thermal Shift — Adjusted{isPending ? ' (awaiting confirmation)' : ''}
          </span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-2 leading-relaxed">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-500">Shift day:</span>
          <span className="font-medium">
            Day {activeShiftDay}
            {userOverrides.shiftDay && userOverrides.shiftDay !== result.shiftDay && (
              <span className="text-gray-400 text-xs ml-1">(Cycle Path suggested Day {result.shiftDay})</span>
            )}
          </span>
          <span className="text-gray-500">Coverline:</span>
          <span className="font-medium">{activeCoverline.toFixed(2)}°C</span>
        </div>
        <div className="text-xs text-amber-600 italic mt-2">
          ✎ You adjusted this interpretation
          {isPending && <span> — awaiting more temperatures to confirm.</span>}
        </div>
      </div>
      <div className={`${footer.base} bg-amber-50 border-amber-200`}>
        <button onClick={onAdjust} className={`${btn.base} ${btn.adjust}`}>Re-Adjust</button>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
