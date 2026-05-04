// app/src/cycle-tracking/interpretation/components/InfoCard.tsx
import { card, footer, btn } from './cardStyles';

type Props = {
  onMarkUninterpretable: () => void;
};

export function InfoCard({ onMarkUninterpretable }: Props) {
  return (
    <div className={`${card.base} border-gray-300`}>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <h3 className="font-semibold text-gray-700">No thermal shift detected yet</h3>
        <p className="text-gray-500">Continue recording daily temperatures.</p>
      </div>
      <div className={`${footer.base} bg-gray-50 border-gray-200`}>
        <button onClick={onMarkUninterpretable} className={`${btn.base} ${btn.secondary}`}>
          Mark Data as Unreliable
        </button>
      </div>
    </div>
  );
}
