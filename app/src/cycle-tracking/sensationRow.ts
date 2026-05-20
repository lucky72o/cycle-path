// Sensation row — design & rendering helpers.
// See: docs/superpowers/specs/2026-05-20-sensation-row-design.md

export type SensationValue = 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY';

const LETTER: Record<SensationValue, string> = {
  DRY: 'd',
  DAMP: 'm',   // displayed as "moist" per Sensiplan convention
  WET: 'w',
  SLIPPERY: 'S',
};

export function letterFor(value: SensationValue): string {
  return LETTER[value];
}

export interface ChipStyle {
  letter: string;
  background: string;       // CSS background
  color: string;            // CSS color (letter)
  border: string;           // CSS border shorthand
  ringColor: string | null; // outer peak ring colour; null = no ring
}

const RESTING: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#5b8a84', border: '1px solid #c0ddd8', ringColor: null },
  DAMP:     { letter: 'm', background: '#c4e8e2',     color: '#0f5c54', border: '1px solid #9ccfc7', ringColor: null },
  WET:      { letter: 'w', background: '#62bdb1',     color: '#ffffff', border: '1px solid transparent', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#0f766e' },
};

export function restingChip(value: SensationValue): ChipStyle {
  return RESTING[value];
}

// --- WCAG sRGB contrast helpers ---

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function channelToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function contrastRatio(a: string, b: string): number {
  const La = relativeLuminance(a);
  const Lb = relativeLuminance(b);
  const [light, dark] = La >= Lb ? [La, Lb] : [Lb, La];
  return (light + 0.05) / (dark + 0.05);
}
