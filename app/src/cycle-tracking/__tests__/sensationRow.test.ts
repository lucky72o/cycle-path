import { describe, it, expect } from 'vitest';
import { letterFor } from '../sensationRow';

describe('letterFor', () => {
  it('maps each enum value to its single-letter chart glyph', () => {
    expect(letterFor('DRY')).toBe('d');
    expect(letterFor('DAMP')).toBe('m');     // displayed term: "moist"
    expect(letterFor('WET')).toBe('w');
    expect(letterFor('SLIPPERY')).toBe('S'); // peak — uppercase to stand out
  });
});
