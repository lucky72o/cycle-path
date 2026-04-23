// app/src/cycle-tracking/interpretation/components/DismissedCard.tsx
import type { ThermalShiftResult } from '../types';
import { card, footer, btn } from './cardStyles';

type Props = {
  engineResult: ThermalShiftResult;
  cycleIsActive: boolean;
  onReEvaluate: () => void;
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
};

export function DismissedCard({
  engineResult,
  cycleIsActive,
  onReEvaluate,
  onMarkAnovulatory,
  onMarkUninterpretable,
}: Props) {
  const engineIsNoShiftDetected =
    engineResult.status === 'none' && engineResult.reason === 'no_shift_detected';
  const showMarkAnovulatory = !cycleIsActive && engineIsNoShiftDetected;
  const showMarkUninterpretable = engineIsNoShiftDetected;

  return (
    <div className={`${card.base} border-gray-200`}>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <p className="text-gray-600">Thermal shift suggestion was dismissed.</p>
      </div>
      <div className={footer.base}>
        <button onClick={onReEvaluate} className={`${btn.base} ${btn.acceptNew}`}>
          Re-evaluate
        </button>
        {showMarkUninterpretable && (
          <button onClick={onMarkUninterpretable} className={`${btn.base} ${btn.secondary}`}>
            Mark Data as Unreliable
          </button>
        )}
        {showMarkAnovulatory && (
          <button onClick={onMarkAnovulatory} className={`${btn.base} ${btn.secondary}`}>
            Mark as Anovulatory
          </button>
        )}
      </div>
    </div>
  );
}
