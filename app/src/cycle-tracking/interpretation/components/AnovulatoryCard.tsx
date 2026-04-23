// app/src/cycle-tracking/interpretation/components/AnovulatoryCard.tsx
import { card, footer, btn } from './cardStyles';

type Props = {
  onRemoveMark: () => void;
};

export function AnovulatoryCard({ onRemoveMark }: Props) {
  return (
    <div className={`${card.base} border-gray-200`}>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <h3 className="font-semibold text-gray-800">Cycle marked as anovulatory</h3>
        <p className="text-gray-600">
          You marked this cycle as anovulatory. No ovulation occurred — the temperature pattern
          remained monophasic throughout.
        </p>
      </div>
      <div className={footer.base}>
        <button onClick={onRemoveMark} className={`${btn.base} ${btn.secondary}`}>
          Remove Mark
        </button>
      </div>
    </div>
  );
}
