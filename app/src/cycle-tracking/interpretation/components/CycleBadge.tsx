type Props = {
  markedAnovulatoryAt: Date | null;
  markedUninterpretableAt: Date | null;
};

export function CycleBadge({ markedAnovulatoryAt, markedUninterpretableAt }: Props) {
  if (markedAnovulatoryAt) {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
        Anovulatory
      </span>
    );
  }
  if (markedUninterpretableAt) {
    return (
      <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
        Unreliable data
      </span>
    );
  }
  return null;
}
