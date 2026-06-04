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

// --- Mode C dispatcher ---
// Modes A and B were stripped after the in-app trial; only Mode C ships.
// The `HoverMode` type / `mode` arg remain to keep `ChipStyleArgs`'s shape
// stable for the switcher and any future re-introduction of additional modes.

export type HoverMode = 'C';

export interface ChipStyleArgs {
  mode: HoverMode;
  accent: string | null;   // unused in Mode C; retained for switcher compatibility
  hover: boolean;
}

const MODE_C_RESTING_SLIPPERY: ChipStyle = {
  letter: 'S',
  background: '#62bdb1',
  color: '#062a26',
  border: '1px solid transparent',
  ringColor: '#62bdb1',
};

export function modeCResting(value: SensationValue): ChipStyle {
  if (value === 'SLIPPERY') return MODE_C_RESTING_SLIPPERY;
  return restingChip(value);
}

const MODE_C_HOVER: Record<SensationValue, ChipStyle> = {
  DRY:      { letter: 'd', background: 'transparent', color: '#5b8a84', border: '1px solid #5d9c93', ringColor: null },
  DAMP:     { letter: 'm', background: '#9bd3c9',     color: '#0f5c54', border: '1px solid #4a8f82', ringColor: null },
  WET:      { letter: 'w', background: '#3f9d90',     color: '#ffffff', border: '1.5px solid #1e7d72', ringColor: null },
  SLIPPERY: { letter: 'S', background: '#0f766e',     color: '#ffffff', border: '1px solid transparent', ringColor: '#054a44' },
};

function modeCChip(value: SensationValue, hover: boolean): ChipStyle {
  return hover ? MODE_C_HOVER[value] : modeCResting(value);
}

export function chipStyleFor(value: SensationValue, args: ChipStyleArgs): ChipStyle {
  // Only Mode C ships. The dispatcher keeps its 3-arg shape so the dev
  // switcher's `letterRatio` call site doesn't need to change during iteration.
  return modeCChip(value, args.hover);
}
