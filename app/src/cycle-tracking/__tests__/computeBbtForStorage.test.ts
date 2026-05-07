import { describe, it, expect } from 'vitest';
import { computeBbtForStorage } from '../computeBbtForStorage';

describe('computeBbtForStorage', () => {
  it('preserves raw bbt on a no-op edit (Celsius user)', () => {
    // existingDay.bbt = 36.6996; user opens edit, prefill shows "36.70",
    // user changes only the cervical observation (bbt input unchanged).
    // Expect: persist the raw 36.6996, not the truncated 36.7.
    const result = computeBbtForStorage({
      bbt: '36.70',
      prefilledBbt: '36.70',
      existingDayBbt: 36.6996,
      hasExistingDay: true,
      inputUnit: 'CELSIUS',
    });
    expect(result).toBe(36.6996);
  });

  it('preserves raw bbt on a no-op edit (Fahrenheit user)', () => {
    // existingDay.bbt = 36.65555 °C; °F display shows "97.98"; user saves
    // without touching the BBT input. Expect: raw 36.65555 persists.
    const result = computeBbtForStorage({
      bbt: '97.98',
      prefilledBbt: '97.98',
      existingDayBbt: 36.65555,
      hasExistingDay: true,
      inputUnit: 'FAHRENHEIT',
    });
    expect(result).toBe(36.65555);
  });

  it('reparses and stores a new value when the user actually edits BBT', () => {
    // Existing day stored 36.6996; prefill "36.70"; user changes to "36.85".
    // Expect: freshly converted 36.85 (Celsius user, so direct).
    const result = computeBbtForStorage({
      bbt: '36.85',
      prefilledBbt: '36.70',
      existingDayBbt: 36.6996,
      hasExistingDay: true,
      inputUnit: 'CELSIUS',
    });
    expect(result).toBe(36.85);
  });

  it('returns null when the user clears BBT on an existing day', () => {
    // existingDay.bbt = 36.50; prefill "36.50"; user clears to "". Expect null.
    const result = computeBbtForStorage({
      bbt: '',
      prefilledBbt: '36.50',
      existingDayBbt: 36.50,
      hasExistingDay: true,
      inputUnit: 'CELSIUS',
    });
    expect(result).toBeNull();
  });

  it('returns undefined for a new day with no BBT input', () => {
    const result = computeBbtForStorage({
      bbt: '',
      prefilledBbt: '',
      existingDayBbt: null,
      hasExistingDay: false,
      inputUnit: 'CELSIUS',
    });
    expect(result).toBeUndefined();
  });
});
