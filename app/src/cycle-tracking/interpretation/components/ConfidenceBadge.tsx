// app/src/cycle-tracking/interpretation/components/ConfidenceBadge.tsx
import { badge } from './cardStyles';

type Props = { confidence: 'high' | 'low' };

export function ConfidenceBadge({ confidence }: Props) {
  return (
    <span className={badge[confidence]}>
      {confidence === 'high' ? 'High confidence' : 'Low confidence'}
    </span>
  );
}
