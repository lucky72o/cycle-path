export function SignDot({ sign, color }: { sign: '+' | '−'; color: string }) {
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
        marginRight: 4,
      }}
    >
      {sign}
    </span>
  );
}
