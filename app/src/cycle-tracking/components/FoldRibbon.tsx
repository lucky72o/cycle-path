import type { MonthSpan } from '../utils';
import { RIBBON_WIDTH, ribbonLabel, ribbonAriaLabel } from '../monthFolding';
import { SignDot } from './SignDot';

type Palette = { pillBg: string; pillText: string; underline: string };

export function FoldRibbon({
  span,
  x,
  height,
  palette,
  onOpen,
}: {
  span: MonthSpan;
  x: number;
  height: number;
  palette: Palette;
  onOpen: () => void;
}) {
  const label = ribbonAriaLabel(span);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="cursor-pointer hover:brightness-95"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: RIBBON_WIDTH,
        height,
        padding: 0,
        background: palette.pillBg,
        borderLeft: '1px solid #fff',
        borderRight: '1px solid #fff',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: palette.underline,
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 15.5,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
        }}
      >
        <SignDot sign="+" color={palette.pillText} />
      </span>
      <span
        style={{
          position: 'absolute',
          top: 40,
          left: '50%',
          marginLeft: -7,
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 11,
          fontWeight: 600,
          color: palette.pillText,
          whiteSpace: 'nowrap',
        }}
      >
        {ribbonLabel(span)}
      </span>
    </button>
  );
}
