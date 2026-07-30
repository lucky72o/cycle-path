// Sensation row — design & rendering helpers.
// See: docs/superpowers/specs/2026-05-20-sensation-row-design.md
//
// Post-trial state: Mode C ("deepen teal") is the locked hover mode.
// Modes A and B were dropped after the in-app trial; the accent preset
// table and `autoDarkenFor45` helper went with them.

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
  // Outer ring colour; null = no ring. Marks the highest sensation category
  // (Slippery) per-observation. NOT a Sensiplan mucus Peak Day marker — the peak
  // is the *last* best-quality day and is only identifiable retrospectively.
  ringColor: string | null;
}

const RESTING: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#596b68', border: '1px solid #596b68', ringColor: null },
  DAMP:     { letter: 'm', background: '#c4e8e2',     color: '#0f5c54', border: '1px solid #9ccfc7', ringColor: null },
  WET:      { letter: 'w', background: '#c4e8e2',     color: '#0f5c54', border: '1.5px solid #1e7d72', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#0f766e' },
};

export function restingChip(value: SensationValue): ChipStyle {
  return RESTING[value];
}

// --- WCAG sRGB contrast helpers ---
// Retained because the dev switcher's per-state contrast panel uses them.

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

// --- Chip style dispatcher ---
// The design trialled three hover modes (A: accent fill, B: accent outline,
// C: "deepen teal"). Mode C won and the others were removed, so what remains
// is simply "resting or hover" — no mode or accent parameter is meaningful.

const MODE_C_RESTING_SLIPPERY: ChipStyle = {
  letter: 'S',
  background: '#62bdb1',
  color: '#062a26',
  border: '1px solid transparent',
  // Deeper than the chip so the ring clears the 3:1 non-text bar (SC 1.4.11)
  // against the resting tile #d8f3f0 — ≈3.77:1. It was previously #62bdb1
  // (matching the chip) at ≈1.91:1, which faded into the tile.
  ringColor: '#33857a',
};

export function modeCResting(value: SensationValue): ChipStyle {
  if (value === 'SLIPPERY') return MODE_C_RESTING_SLIPPERY;
  return restingChip(value);
}

const MODE_C_HOVER: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#4d5f5c', border: '1px solid #4d5f5c', ringColor: null },
  DAMP:     { letter: 'm', background: '#9bd3c9',     color: '#0f5c54', border: '1px solid #4a8f82', ringColor: null },
  WET:      { letter: 'w', background: '#9bd3c9',     color: '#0f5c54', border: '1.5px solid #135e55', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#054a44' },
};

export function chipStyleFor(value: SensationValue, hover: boolean): ChipStyle {
  return hover ? MODE_C_HOVER[value] : modeCResting(value);
}
