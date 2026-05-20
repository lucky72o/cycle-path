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
