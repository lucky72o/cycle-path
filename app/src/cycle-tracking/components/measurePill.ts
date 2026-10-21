import { stripItemLabel, type StripItem } from '../monthFolding';

/** Must mirror the pill styles in MonthPillStrip.tsx exactly. */
const FONT_SIZE = 11;
const LETTER_SPACING = 0.02 * FONT_SIZE; // 0.02em, added after every glyph
const PAD_WITH_SIGN = 5 + 8;
const PAD_NO_SIGN = 9 + 9;
const BORDER = 1 + 1;
const DOT = 12; // SignDot width
const SIGN_GAP = 4; // SignDot marginRight / "+" marginRight
const SLACK = 2; // per-pill safety margin against sub-pixel rounding
const FALLBACK_GLYPH = 6.5;

let ctx: CanvasRenderingContext2D | null | undefined;
let font: string | undefined;

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = document.createElement('canvas').getContext('2d') ?? null;
  } catch {
    ctx = null;
  }
  return ctx;
}

function fontString(): string {
  if (font === undefined) {
    let family = '';
    try {
      family = getComputedStyle(document.body).fontFamily;
    } catch {
      family = '';
    }
    font = `600 ${FONT_SIZE}px ${family || 'sans-serif'}`;
  }
  return font;
}

/** Text width including letter-spacing (applied arithmetically; the canvas never gets letterSpacing set). */
function textWidth(c: CanvasRenderingContext2D | null, text: string): number {
  const glyphs = c ? c.measureText(text).width : text.length * FALLBACK_GLYPH;
  return glyphs + text.length * LETTER_SPACING;
}

/**
 * Rendered pill width in px, matching MonthPillStrip:
 * - open foldable: 5/8 padding + 12 px "−" dot + 4 px gap + label
 * - folded:        5/8 padding + "+" glyph (with letter-spacing) + 4 px margin + label
 * - open inert:    9/9 padding + label
 * plus the 1 px border on each side and a 2 px safety slack. Falls back to
 * 6.5 px per glyph when canvas 2D is unavailable.
 */
export function measurePillWidth(item: StripItem, compact: boolean): number {
  const c = context();
  if (c) c.font = fontString();
  const label = textWidth(c, stripItemLabel(item, compact));
  let chrome: number;
  if (item.kind === 'folded') chrome = PAD_WITH_SIGN + textWidth(c, '+') + SIGN_GAP;
  else if (item.foldable) chrome = PAD_WITH_SIGN + DOT + SIGN_GAP;
  else chrome = PAD_NO_SIGN;
  return Math.ceil(label + chrome + BORDER + SLACK);
}
