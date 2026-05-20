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
