import { describe, it, expect } from 'vitest';
import { NOTE_MAX_LENGTH, normalizeNote, isNoteTooLong } from '../notesValidation';

describe('NOTE_MAX_LENGTH', () => {
  it('is 150', () => {
    expect(NOTE_MAX_LENGTH).toBe(150);
  });
});

describe('normalizeNote', () => {
  it('returns null for undefined input', () => {
    expect(normalizeNote(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeNote('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeNote('   \n\t  ')).toBeNull();
  });

  it('trims surrounding whitespace from a real note', () => {
    expect(normalizeNote('  hello  ')).toBe('hello');
  });

  it('preserves internal whitespace', () => {
    expect(normalizeNote('  hello   world  ')).toBe('hello   world');
  });

  it('passes through a note within length limits', () => {
    expect(normalizeNote('Bad cramps morning, took ibuprofen')).toBe('Bad cramps morning, took ibuprofen');
  });

  it('passes through null explicitly (delete)', () => {
    expect(normalizeNote(null)).toBeNull();
  });
});

describe('isNoteTooLong', () => {
  it('false for null', () => {
    expect(isNoteTooLong(null)).toBe(false);
  });

  it('false for undefined', () => {
    expect(isNoteTooLong(undefined)).toBe(false);
  });

  it('false for short note', () => {
    expect(isNoteTooLong('hi')).toBe(false);
  });

  it('false for exactly 150 chars', () => {
    expect(isNoteTooLong('a'.repeat(150))).toBe(false);
  });

  it('true for 151 chars', () => {
    expect(isNoteTooLong('a'.repeat(151))).toBe(true);
  });
});
