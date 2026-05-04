// app/src/cycle-tracking/interpretation/components/UninterpretableCard.tsx
import { card, footer, btn } from './cardStyles';

type Props = {
  onRemoveMark: () => void;
};

export function UninterpretableCard({ onRemoveMark }: Props) {
  return (
    <div className={`${card.base} border-gray-200`}>
      <div className="px-4 py-3 text-sm space-y-3 leading-relaxed">
        <h3 className="font-semibold text-gray-800">Data marked as unreliable</h3>
        <p className="text-gray-600">
          You marked this cycle&apos;s data as unreliable for interpretation. Too many disturbances
          or exclusions prevent a reliable thermal shift assessment.
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
