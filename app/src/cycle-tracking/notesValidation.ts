export const NOTE_MAX_LENGTH = 150;

/**
 * Normalize a note value for storage:
 *   - undefined  -> null
 *   - null       -> null
 *   - ''         -> null
 *   - whitespace -> null
 *   - 'x  y'     -> 'x  y' (trimmed at edges, internal whitespace preserved)
 */
export function normalizeNote(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isNoteTooLong(input: string | null | undefined): boolean {
  if (input === null || input === undefined) return false;
  return input.length > NOTE_MAX_LENGTH;
}
