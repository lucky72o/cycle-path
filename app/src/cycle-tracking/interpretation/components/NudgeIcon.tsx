type Props = {
  x: number;
  y: number;
  onClick: () => void;
};

export function NudgeIcon({ x, y, onClick }: Props) {
  return (
    <div
      className="absolute cursor-pointer z-10"
      style={{ left: `${x - 8}px`, top: `${y - 24}px` }}
      onClick={onClick}
    >
      <span className="text-base" title="Data quality note">💬</span>
    </div>
  );
}
