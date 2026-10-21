import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { StripItem } from '../monthFolding';
import { stripItemLabel } from '../monthFolding';

const july = { monthIndex: 0, monthLabel: 'July', startDayNumber: 1, endDayNumber: 25 };
const aug = { monthIndex: 1, monthLabel: 'August', startDayNumber: 26, endDayNumber: 56 };

const folded: StripItem = { kind: 'folded', side: 'before', months: [july] };
const openFoldable: StripItem = { kind: 'open', months: [aug], foldable: true };
const openInert: StripItem = { kind: 'open', months: [aug], foldable: false };

// Fake 2D context: every glyph is 6 px wide.
function fakeContext() {
  return {
    font: '',
    measureText: (t: string) => ({ width: 6 * t.length }),
  } as unknown as CanvasRenderingContext2D;
}

async function load() {
  vi.resetModules();
  return (await import('../components/measurePill')).measurePillWidth;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('measurePillWidth', () => {
  it('open pill without a sign: label + letter-spacing + 9/9 padding + 2 border + 2 slack', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext() as never);
    const measure = await load();
    const label = stripItemLabel(openInert, false);
    expect(measure(openInert, false)).toBe(Math.ceil(6 * label.length + 0.22 * label.length + 18 + 2 + 2));
  });

  it('open foldable pill counts the 12 px "−" dot + 4 px gap and 5/8 padding', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext() as never);
    const measure = await load();
    const label = stripItemLabel(openFoldable, false);
    expect(measure(openFoldable, false)).toBe(Math.ceil(6 * label.length + 0.22 * label.length + 13 + 12 + 4 + 2 + 2));
  });

  it('folded pill counts measureText("+") + its letter-spacing + 4 px margin', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext() as never);
    const measure = await load();
    const label = stripItemLabel(folded, true);
    expect(measure(folded, true)).toBe(Math.ceil(6 * label.length + 0.22 * label.length + 13 + (6 + 0.22 + 4) + 2 + 2));
  });

  it('falls back to 6.5 px per glyph when getContext returns null', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const measure = await load();
    const label = stripItemLabel(folded, false);
    expect(measure(folded, false)).toBe(
      Math.ceil(6.5 * label.length + 0.22 * label.length + 13 + (6.5 + 0.22 + 4) + 2 + 2),
    );
  });

  it('falls back when getContext throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no canvas');
    });
    const measure = await load();
    const label = stripItemLabel(openInert, false);
    expect(measure(openInert, false)).toBe(Math.ceil(6.5 * label.length + 0.22 * label.length + 18 + 2 + 2));
  });
});
