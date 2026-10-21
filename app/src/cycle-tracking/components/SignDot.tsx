/** `gap` is the space after the dot (before a following label); 0 when the dot stands alone. */
export function SignDot({ sign, color, gap = 4 }: { sign: '+' | '−'; color: string; gap?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: '#fff',
        color,
        textAlign: 'center',
        lineHeight: '11px',
        fontWeight: 700,
        fontSize: '11px',
        marginRight: gap,
      }}
    >
      {sign}
    </span>
  );
}
