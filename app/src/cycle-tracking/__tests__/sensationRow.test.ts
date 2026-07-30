import { describe, it, expect } from 'vitest';
import { letterFor, restingChip, contrastRatio, relativeLuminance, chipStyleFor, modeCResting } from '../sensationRow';

describe('letterFor', () => {
  it('maps each enum value to its single-letter chart glyph', () => {
    expect(letterFor('DRY')).toBe('d');
    expect(letterFor('DAMP')).toBe('m');     // displayed term: "moist"
    expect(letterFor('WET')).toBe('w');
    expect(letterFor('SLIPPERY')).toBe('S'); // highest category — uppercase to stand out
  });
});

describe('restingChip', () => {
  it('Dry: transparent fill, muted teal-grey letter, matching border, "d" glyph', () => {
    expect(restingChip('DRY')).toEqual({
      letter: 'd',
      background: 'transparent',
      color: '#596b68',
      border: '1px solid #596b68',
      ringColor: null,
    });
  });

  it('Damp/moist: pale teal fill, dark-teal letter, hairline border, "m"', () => {
    expect(restingChip('DAMP')).toEqual({
      letter: 'm',
      background: '#c4e8e2',
      color: '#0f5c54',
      border: '1px solid #9ccfc7',
      ringColor: null,
    });
  });

  it('Wet: Moist-style pale fill + dark letter, deep 1.5px frame, "w"', () => {
    expect(restingChip('WET')).toEqual({
      letter: 'w',
      background: '#c4e8e2',
      color: '#0f5c54',
      border: '1.5px solid #1e7d72',
      ringColor: null,
    });
  });

  it('Slippery (highest category): deep-teal fill, white letter, no border, teal ring', () => {
    expect(restingChip('SLIPPERY')).toEqual({
      letter: 'S',
      background: '#0f766e',
      color: '#ffffff',
      border: '1px solid transparent',
      ringColor: '#0f766e',
    });
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });
});

describe('contrastRatio (verified WCAG ratios for chip-letter audit)', () => {
  // Use ±0.05 tolerance — sRGB conversion + rounding within audit precision.
  function near(actual: number, expected: number) {
    expect(Math.abs(actual - expected)).toBeLessThan(0.05);
  }

  it('white vs deep teal #0f766e ≈ 5.48', () => near(contrastRatio('#ffffff', '#0f766e'), 5.48));
  it('Wet resting letter #0f5c54 on fill #c4e8e2 ≈ 5.97', () => near(contrastRatio('#0f5c54', '#c4e8e2'), 5.97));
  it('Wet resting frame #1e7d72 on fill #c4e8e2 ≈ 3.78 (clears 3:1 non-text)', () => near(contrastRatio('#1e7d72', '#c4e8e2'), 3.78));
  it('Wet hover letter #0f5c54 on fill #9bd3c9 ≈ 4.69', () => near(contrastRatio('#0f5c54', '#9bd3c9'), 4.69));
  it('Wet hover frame #135e55 on fill #9bd3c9 ≈ 4.55 (clears 3:1 non-text)', () => near(contrastRatio('#135e55', '#9bd3c9'), 4.55));
  it('inky teal #062a26 on #62bdb1 ≈ 6.89', () => near(contrastRatio('#062a26', '#62bdb1'), 6.89));
  // Slippery ring is a meaningful graphic → WCAG SC 1.4.11 non-text bar of 3:1.
  it('Slippery resting ring #33857a on tile #d8f3f0 ≈ 3.77 (clears 3:1)', () => {
    const r = contrastRatio('#33857a', '#d8f3f0');
    near(r, 3.77);
    expect(r).toBeGreaterThanOrEqual(3);
  });
  it('old ring #62bdb1 on tile #d8f3f0 ≈ 1.91 — why it was replaced', () => {
    expect(contrastRatio('#62bdb1', '#d8f3f0')).toBeLessThan(3);
  });
  it('Dry resting #596b68 on tile #d8f3f0 ≈ 4.83 (clears 4.5)', () => near(contrastRatio('#596b68', '#d8f3f0'), 4.83));
  it('Dry hover #4d5f5c on hover tile #aee5df ≈ 4.85 (clears 4.5)', () => near(contrastRatio('#4d5f5c', '#aee5df'), 4.85));
  it('symmetric (order independent)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});

describe('Mode C — resting (override only Slippery)', () => {
  it('Dry/Damp/Wet match the locked resting design', () => {
    expect(modeCResting('DRY')).toEqual(restingChip('DRY'));
    expect(modeCResting('DAMP')).toEqual(restingChip('DAMP'));
    expect(modeCResting('WET')).toEqual(restingChip('WET'));
  });

  it('Slippery uses #62bdb1 chip + deeper #33857a ring + inky #062a26 letter', () => {
    expect(modeCResting('SLIPPERY')).toEqual({
      letter: 'S',
      background: '#62bdb1',
      color: '#062a26',
      border: '1px solid transparent',
      ringColor: '#33857a',
    });
  });
});

describe('chipStyleFor — Mode C hover', () => {
  it('Dry: muted teal-grey deepens #596b68 → #4d5f5c (letter + matching border)', () => {
    const s = chipStyleFor('DRY', true);
    expect(s.background).toBe('transparent');
    expect(s.color).toBe('#4d5f5c');
    expect(s.border).toBe('1px solid #4d5f5c');
  });

  it('Damp: fill #9bd3c9, border #4a8f82', () => {
    const s = chipStyleFor('DAMP', true);
    expect(s.background).toBe('#9bd3c9');
    expect(s.color).toBe('#0f5c54');
    expect(s.border).toBe('1px solid #4a8f82');
  });

  it('Wet: fill deepens to #9bd3c9, frame deepens to #135e55', () => {
    const s = chipStyleFor('WET', true);
    expect(s.background).toBe('#9bd3c9');
    expect(s.color).toBe('#0f5c54');
    expect(s.border).toBe('1.5px solid #135e55');
  });

  it('Slippery: chip #0f766e, ring #054a44, letter white', () => {
    const s = chipStyleFor('SLIPPERY', true);
    expect(s.background).toBe('#0f766e');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1px solid transparent');
    expect(s.ringColor).toBe('#054a44');
  });
});

describe('chipStyleFor — Mode C resting via main dispatcher', () => {
  it('returns the Mode C resting chip (Slippery overridden)', () => {
    expect(chipStyleFor('SLIPPERY', false))
      .toEqual(modeCResting('SLIPPERY'));
  });
});
