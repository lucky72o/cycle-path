import { describe, it, expect } from 'vitest';
import { letterFor, restingChip, contrastRatio, relativeLuminance, autoDarkenFor45, ACCENT_PRESETS, PRESET_KEYS, chipStyleFor, HoverMode, modeCResting } from '../sensationRow';

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

describe('ACCENT_PRESETS table', () => {
  it('lists exactly the 10 accent presets from the spec, in spec order', () => {
    expect(PRESET_KEYS).toEqual([
      'rose-medium',
      'rose-contrast',
      'rose-bold',
      'sky',
      'amber',
      'amber-gold',
      'gold',
      'indigo',
      'bbt-blue',
      'lh-green',
    ]);
  });

  it('every preset has the correct accent hex', () => {
    const byKey = Object.fromEntries(ACCENT_PRESETS.map((p) => [p.key, p.fill]));
    expect(byKey['rose-medium']).toBe('#cf7591');
    expect(byKey['rose-contrast']).toBe('#c75f80');
    expect(byKey['rose-bold']).toBe('#bd4a6e');
    expect(byKey['sky']).toBe('#60a5fa');
    expect(byKey['amber']).toBe('#f59e0b');
    expect(byKey['amber-gold']).toBe('#f3aa08');
    expect(byKey['gold']).toBe('#f2b705');
    expect(byKey['indigo']).toBe('#7c83e8');
    expect(byKey['bbt-blue']).toBe('#3b82f6');
    expect(byKey['lh-green']).toBe('#16a34a');
  });
});

describe('chipStyleFor — Mode A', () => {
  const A: HoverMode = 'A';
  const accent = '#bd4a6e'; // Rose bold — passes 4.5:1, so used unchanged

  it('resting returns the locked resting chip regardless of preset/mode', () => {
    expect(chipStyleFor('WET', { mode: A, accent, hover: false })).toEqual(restingChip('WET'));
  });

  it('hover Dry: accent fill, white letter, accent border', () => {
    const s = chipStyleFor('DRY', { mode: A, accent, hover: true });
    expect(s.letter).toBe('d');
    expect(s.background).toBe(accent);
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1px solid ' + accent);
    expect(s.ringColor).toBeNull();
  });

  it('hover Slippery: accent fill + darker-shade ring for peak', () => {
    const s = chipStyleFor('SLIPPERY', { mode: A, accent, hover: true });
    expect(s.background).toBe(accent);
    expect(s.color).toBe('#ffffff');
    expect(s.ringColor).toBeTruthy();
    // ring is a darker shade of the accent
    expect(relativeLuminance(s.ringColor!)).toBeLessThan(relativeLuminance(accent));
  });

  it('a pale accent is auto-darkened before being applied (Mode A only)', () => {
    // Golden Yellow fails 4.5:1 with white text; Mode A must darken before painting.
    const s = chipStyleFor('WET', { mode: A, accent: '#f2b705', hover: true });
    expect(s.background).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', s.background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('chipStyleFor — Mode B', () => {
  const accent = '#bd4a6e';

  it('hover Dry: resting fill+letter, accent 1.5px outline', () => {
    const s = chipStyleFor('DRY', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('transparent');      // unchanged
    expect(s.color).toBe('#5b8a84');               // unchanged
    expect(s.border).toBe('1.5px solid ' + accent);
    expect(s.ringColor).toBeNull();
  });

  it('hover Damp: resting fill kept, only border switches to accent', () => {
    const s = chipStyleFor('DAMP', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('#c4e8e2');          // unchanged
    expect(s.color).toBe('#0f5c54');               // unchanged
    expect(s.border).toBe('1.5px solid ' + accent);
  });

  it('hover Wet: resting fill kept, accent border replaces transparent', () => {
    const s = chipStyleFor('WET', { mode: 'B', accent, hover: true });
    expect(s.background).toBe('#62bdb1');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1.5px solid ' + accent);
  });

  it('hover Slippery (peak): identical to Mode A', () => {
    const a = chipStyleFor('SLIPPERY', { mode: 'A', accent, hover: true });
    const b = chipStyleFor('SLIPPERY', { mode: 'B', accent, hover: true });
    expect(b).toEqual(a);
  });

  it('pale accent is auto-darkened (used in the outline)', () => {
    const s = chipStyleFor('WET', { mode: 'B', accent: '#f2b705', hover: true });
    const used = s.border.replace('1.5px solid ', '');
    expect(used).not.toBe('#f2b705');
    expect(contrastRatio('#ffffff', used)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Mode C — resting (override only Slippery)', () => {
  it('Dry/Damp/Wet match the locked resting design', () => {
    expect(modeCResting('DRY')).toEqual(restingChip('DRY'));
    expect(modeCResting('DAMP')).toEqual(restingChip('DAMP'));
    expect(modeCResting('WET')).toEqual(restingChip('WET'));
  });

  it('Slippery uses #62bdb1 chip + #62bdb1 ring + inky #062a26 letter', () => {
    expect(modeCResting('SLIPPERY')).toEqual({
      letter: 'S',
      background: '#62bdb1',
      color: '#062a26',
      border: '1px solid transparent',
      ringColor: '#62bdb1',
    });
  });
});

describe('chipStyleFor — Mode C hover', () => {
  it('Dry: border #c0ddd8 → #5d9c93', () => {
    const s = chipStyleFor('DRY', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('transparent');
    expect(s.color).toBe('#5b8a84');
    expect(s.border).toBe('1px solid #5d9c93');
  });

  it('Damp: fill #9bd3c9, border #4a8f82', () => {
    const s = chipStyleFor('DAMP', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#9bd3c9');
    expect(s.color).toBe('#0f5c54');
    expect(s.border).toBe('1px solid #4a8f82');
  });

  it('Wet: fill #3f9d90, 1.5px border #1e7d72', () => {
    const s = chipStyleFor('WET', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#3f9d90');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1.5px solid #1e7d72');
  });

  it('Slippery: chip #0f766e, ring #054a44, letter white', () => {
    const s = chipStyleFor('SLIPPERY', { mode: 'C', accent: null, hover: true });
    expect(s.background).toBe('#0f766e');
    expect(s.color).toBe('#ffffff');
    expect(s.border).toBe('1px solid transparent');
    expect(s.ringColor).toBe('#054a44');
  });

  it('Mode C ignores the accent argument', () => {
    const a = chipStyleFor('DAMP', { mode: 'C', accent: null, hover: true });
    const b = chipStyleFor('DAMP', { mode: 'C', accent: '#bd4a6e', hover: true });
    expect(a).toEqual(b);
  });
});

describe('chipStyleFor — Mode C resting via main dispatcher', () => {
  it('returns the Mode C resting chip (Slippery overridden)', () => {
    expect(chipStyleFor('SLIPPERY', { mode: 'C', accent: null, hover: false }))
      .toEqual(modeCResting('SLIPPERY'));
  });
});
