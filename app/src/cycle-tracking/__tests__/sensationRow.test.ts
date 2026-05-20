import { describe, it, expect } from 'vitest';
import { letterFor, restingChip } from '../sensationRow';

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
