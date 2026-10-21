import { stripItemLabel, type StripItem } from '../monthFolding';

let ctx: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  ctx = null;
  // jsdom logs "not implemented" for getContext; skip canvas there entirely.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return ctx;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Pill width in px: measured label (600 11px body font) + horizontal padding
 * (13 with sign + 12 px dot + 4 gap, 18 without) + 2 border. Falls back to
 * 6.5 px per character when canvas 2D is unavailable.
 */
export function measurePillWidth(item: StripItem, compact: boolean): number {
  const label = stripItemLabel(item, compact);
  const c = context();
  let text = label.length * 6.5;
  if (c) {
    const family = (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) || 'sans-serif';
    c.font = `600 11px ${family}`;
    text = c.measureText(label).width;
  }
  const hasSign = item.kind === 'folded' || item.foldable;
  // Folded "+" is plain text (one glyph + gap); open "−" is a 12 px dot + 4 gap.
  const sign = item.kind === 'open' ? 12 + 4 : c ? c.measureText('+ ').width : 2 * 6.5;
  return Math.ceil(text + (hasSign ? 13 + sign : 18) + 2);
}
