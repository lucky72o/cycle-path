// app/src/cycle-tracking/interpretation/components/KeptShiftCard.tsx
import type { UserOverrides } from '../types';
import { card, header, footer, btn } from './cardStyles';

type Props = {
  userOverrides: UserOverrides;
  onAdjust: (overrides: UserOverrides) => Promise<void>;
  onReject: () => Promise<void>;
};

export function KeptShiftCard({ userOverrides, onAdjust, onReject }: Props) {
  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-600" />
          <span className="font-semibold text-sm">Thermal Shift — Your Interpretation</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-800">
          ℹ️ The engine no longer detects a thermal shift with the current data. Your interpretation is preserved.
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {userOverrides.shiftDay && (
            <>
              <span className="text-gray-500">Shift day:</span>
              <span className="font-medium">Day {userOverrides.shiftDay}</span>
            </>
          )}
          {userOverrides.coverlineTemp && (
            <>
              <span className="text-gray-500">Coverline:</span>
              <span className="font-medium">{userOverrides.coverlineTemp.toFixed(2)}°C</span>
            </>
          )}
        </div>
        <div className="text-xs text-amber-600 italic">✎ You adjusted this interpretation</div>
      </div>
      <div className={`${footer.base} bg-amber-50 border-amber-200`}>
        <button onClick={onReject} className={`${btn.base} ${btn.reject}`}>Reject</button>
      </div>
    </div>
  );
}
