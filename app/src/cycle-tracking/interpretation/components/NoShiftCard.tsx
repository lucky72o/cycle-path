// app/src/cycle-tracking/interpretation/components/NoShiftCard.tsx
import { card, footer, btn } from './cardStyles';

type Props = {
  onMarkAnovulatory: () => void;
  onMarkUninterpretable: () => void;
};

export function NoShiftCard({ onMarkAnovulatory, onMarkUninterpretable }: Props) {
  return (
    <div className={`${card.base} border-gray-200`}>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <h3 className="font-semibold text-gray-800">No thermal shift detected</h3>
        <p className="text-gray-600">
          The engine could not identify a biphasic temperature pattern in the available data.
        </p>
      </div>
      <div className={footer.base}>
        <button onClick={onMarkAnovulatory} className={`${btn.base} ${btn.confirm}`}>
          Mark as Anovulatory
        </button>
        <button onClick={onMarkUninterpretable} className={`${btn.base} ${btn.secondary}`}>
          Mark Data as Unreliable
        </button>
      </div>
    </div>
  );
}
