import { describe, it, expect } from 'vitest';
import { letterFor, restingChip, contrastRatio, relativeLuminance, autoDarkenFor45 } from '../sensationRow';

describe('letterFor', () => {
  it('maps each enum value to its single-letter chart glyph', () => {
    expect(letterFor('DRY')).toBe('d');
    expect(letterFor('DAMP')).toBe('m');     // displayed term: "moist"
    expect(letterFor('WET')).toBe('w');
    expect(letterFor('SLIPPERY')).toBe('S'); // peak — uppercase to stand out
  });
});

describe('restingChip', () => {
  it('Dry: transparent fill, soft teal letter, faint border, "d" glyph', () => {
    expect(restingChip('DRY')).toEqual({
      letter: 'd',
      background: 'transparent',
      color: '#5b8a84',
      border: '1px solid #c0ddd8',
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

  it('Wet: mid-teal fill, white letter, no border, "w"', () => {
    expect(restingChip('WET')).toEqual({
      letter: 'w',
      background: '#62bdb1',
      color: '#ffffff',
      border: '1px solid transparent',
      ringColor: null,
    });
  });

  it('Slippery (peak): deep-teal fill, white letter, no border, teal ring', () => {
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
  it('white vs Wet #62bdb1 ≈ 2.23', () => near(contrastRatio('#ffffff', '#62bdb1'), 2.23));
  it('white vs lighter teal #1f9485 ≈ 3.74', () => near(contrastRatio('#ffffff', '#1f9485'), 3.74));
  it('white vs Mode C Wet-hover #3f9d90 ≈ 3.26', () => near(contrastRatio('#ffffff', '#3f9d90'), 3.26));
  it('white vs Rose bold #bd4a6e ≈ 4.81', () => near(contrastRatio('#ffffff', '#bd4a6e'), 4.81));
  it('white vs Rose more-contrast #c75f80 ≈ 3.91', () => near(contrastRatio('#ffffff', '#c75f80'), 3.91));
  it('inky teal #062a26 on #62bdb1 ≈ 6.89', () => near(contrastRatio('#062a26', '#62bdb1'), 6.89));
  it('soft teal #5b8a84 on tile #d8f3f0 ≈ 3.32', () => near(contrastRatio('#5b8a84', '#d8f3f0'), 3.32));
  it('symmetric (order independent)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});

describe('autoDarkenFor45', () => {
  it('returns the input unchanged when it already passes 4.5:1 with white text', () => {
    // Rose bold passes (≈4.81), so darken should return it as-is.
    expect(autoDarkenFor45('#bd4a6e')).toBe('#bd4a6e');
  });

  it('darkens Wet #62bdb1 (2.23:1) to a value that crosses 4.5:1', () => {
    const out = autoDarkenFor45('#62bdb1');
    expect(out).not.toBe('#62bdb1');
    expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens Golden Yellow #f2b705 to cross 4.5:1', () => {
    const out = autoDarkenFor45('#f2b705');
    expect(out).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
  });

  it('returns the smallest darken — output is just above 4.5:1, not far above', () => {
    const out = autoDarkenFor45('#62bdb1');
    const ratio = contrastRatio('#ffffff', out);
    // "smallest darken that passes" — should land close to 4.5:1, not e.g. 8:1.
    expect(ratio).toBeLessThan(5.5);
  });

  it('respects a custom text colour', () => {
    // Dark text on a light fill — should not darken since contrast is already high.
    expect(autoDarkenFor45('#ffe9d6', '#002142')).toBe('#ffe9d6');
  });
});
