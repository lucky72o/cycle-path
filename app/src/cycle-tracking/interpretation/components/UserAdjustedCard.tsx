// app/src/cycle-tracking/interpretation/components/UserAdjustedCard.tsx
import type { ThermalShiftConfirmed, ThermalShiftPending, UserOverrides } from '../types';
import { card, header, footer, btn } from './cardStyles';

type Props = {
  result: ThermalShiftConfirmed | ThermalShiftPending;
  userOverrides: UserOverrides;
  onAdjust: (overrides: UserOverrides) => Promise<void>;
  onReject: () => Promise<void>;
};

export function UserAdjustedCard({ result, userOverrides, onAdjust, onReject }: Props) {
  const activeShiftDay = userOverrides.shiftDay ?? result.shiftDay;
  const activeCoverline = userOverrides.coverlineTemp ?? result.coverlineTemp;

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-600" />
          <span className="font-semibold text-sm">Thermal Shift — Adjusted</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-2 leading-relaxed">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span className="text-gray-500">Shift day:</span>
          <span className="font-medium">
            Day {activeShiftDay}
            {userOverrides.shiftDay && userOverrides.shiftDay !== result.shiftDay && (
              <span className="text-gray-400 text-xs ml-1">(engine suggested Day {result.shiftDay})</span>
            )}
          </span>
          <span className="text-gray-500">Coverline:</span>
          <span className="font-medium">
            {activeCoverline.toFixed(2)}°C
            {userOverrides.coverlineTemp && userOverrides.coverlineTemp !== result.coverlineTemp && (
              <span className="text-gray-400 text-xs ml-1">(engine suggested {result.coverlineTemp.toFixed(2)}°C)</span>
            )}
          </span>
        </div>
        <div className="text-xs text-amber-600 italic mt-2">✎ You adjusted this interpretation</div>
      </div>
      <div className={`${footer.base} bg-amber-50 border-amber-200`}>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
