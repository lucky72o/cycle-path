import {
  type MonthSpan,
  MIN_CELL_WIDTH,
  RIGHT_PLOT_RESERVE,
} from './utils';

export const FOLD_MIN_DAYS = 40;
export const STANDARD_FRAME_DAYS = 40;
export const RIBBON_WIDTH = 24;
export const FOLD_MIN_VIEWPORT_PX = 1024;

/** Contiguous run of open months, as inclusive month indices. */
export type OpenBlock = { from: number; to: number };

const spanDays = (s: MonthSpan) => s.endDayNumber - s.startDayNumber + 1;

export function isFoldingEligible(lastDay: number, spans: MonthSpan[]): boolean {
  return lastDay > FOLD_MIN_DAYS && spans.length > 1;
}

/**
 * Starts at the anchor month (latest when `anchorLatest`, else first) and adds
 * neighbours away from the anchor while fewer than `frame` days are open.
 */
export function defaultOpenBlock(
  spans: MonthSpan[],
  anchorLatest: boolean,
  frame: number = STANDARD_FRAME_DAYS,
): OpenBlock {
  if (spans.length === 0) return { from: 0, to: 0 };
  const anchor = anchorLatest ? spans.length - 1 : 0;
  let from = anchor;
  let to = anchor;
  let total = spanDays(spans[anchor]);
  while (total < frame && (from > 0 || to < spans.length - 1)) {
    if (anchorLatest ? from > 0 : to >= spans.length - 1) {
      from -= 1;
      total += spanDays(spans[from]);
    } else {
      to += 1;
      total += spanDays(spans[to]);
    }
  }
  return { from, to };
}

/**
 * The block to open when returning to the chart focused on `day`: the default
 * block if it already shows that day, else the day's month grown (later months
 * first) until `frame` days are open.
 */
export function focusedOpenBlock(
  spans: MonthSpan[],
  base: OpenBlock,
  day: number,
  frame: number = STANDARD_FRAME_DAYS,
): OpenBlock {
  const i = spans.findIndex(s => day >= s.startDayNumber && day <= s.endDayNumber);
  if (i < 0 || (i >= base.from && i <= base.to)) return base;
  let from = i;
  let to = i;
  let total = spanDays(spans[i]);
  while (total < frame && (from > 0 || to < spans.length - 1)) {
    if (to < spans.length - 1) {
      to += 1;
      total += spanDays(spans[to]);
    } else {
      from -= 1;
      total += spanDays(spans[from]);
    }
  }
  return { from, to };
}

export function canFold(block: OpenBlock, monthIndex: number): boolean {
  return block.from < block.to && (monthIndex === block.from || monthIndex === block.to);
}

export function foldMonth(block: OpenBlock, monthIndex: number): OpenBlock {
  if (!canFold(block, monthIndex)) return block;
  return monthIndex === block.from
    ? { from: block.from + 1, to: block.to }
    : { from: block.from, to: block.to - 1 };
}

export function openMonth(block: OpenBlock, monthIndex: number): OpenBlock {
  return { from: Math.min(block.from, monthIndex), to: Math.max(block.to, monthIndex) };
}

export function allOpenBlock(spans: MonthSpan[]): OpenBlock {
  return { from: 0, to: Math.max(0, spans.length - 1) };
}

export function collapsedBlock(spans: MonthSpan[], anchorLatest: boolean): OpenBlock {
  const anchor = anchorLatest ? Math.max(0, spans.length - 1) : 0;
  return { from: anchor, to: anchor };
}

export function isAllOpen(block: OpenBlock, spans: MonthSpan[]): boolean {
  return block.from <= 0 && block.to >= spans.length - 1;
}

export function visibleDayRange(
  block: OpenBlock,
  spans: MonthSpan[],
): { minDay: number; maxDay: number } {
  return {
    minDay: spans[block.from].startDayNumber,
    maxDay: spans[block.to].endDayNumber,
  };
}

export function isDayInRange(day: number, range: { minDay: number; maxDay: number }): boolean {
  return day >= range.minDay && day <= range.maxDay;
}

/** Number of days hidden inside ribbons (outside the open block). */
export function foldedDayCount(block: OpenBlock, spans: MonthSpan[]): number {
  const { minDay, maxDay } = visibleDayRange(block, spans);
  const total = spans[spans.length - 1].endDayNumber - spans[0].startDayNumber + 1;
  return total - (maxDay - minDay + 1);
}

/** Cell width of a standard 40-day frame in the scroll viewport, floored at MIN_CELL_WIDTH. */
export function standardCellWidth(scrollClientWidth: number, leftReserve: number): number {
  const plot = scrollClientWidth - leftReserve - RIGHT_PLOT_RESERVE;
  return Math.max(MIN_CELL_WIDTH, plot / STANDARD_FRAME_DAYS);
}

export function foldedContainerWidth(args: {
  leftReserve: number;
  ribbonsLeft: number;
  ribbonsRight: number;
  openDays: number;
  cellWidth: number;
}): number {
  const { leftReserve, ribbonsLeft, ribbonsRight, openDays, cellWidth } = args;
  return leftReserve + ribbonsLeft + ribbonsRight + RIGHT_PLOT_RESERVE + openDays * cellWidth;
}

/** Sticky x-position of a ribbon group: pinned to the viewport edge until its natural slot is in view. */
export function ribbonGroupX(args: {
  side: 'before' | 'after';
  naturalX: number;
  groupWidth: number;
  scrollLeft: number;
  clientWidth: number;
}): number {
  const { side, naturalX, groupWidth, scrollLeft, clientWidth } = args;
  return side === 'before'
    ? Math.max(naturalX, scrollLeft)
    : Math.min(naturalX, scrollLeft + clientWidth - groupWidth);
}

/** `1 day`, `2 days`. */
export const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * How a month pill in the chart's month row should render for the room it has.
 * `pillMaxWidthPx` is the span width minus the 4 px insets on each side.
 *
 * - 'full'  — full month name ("September").
 * - 'short' — 3-letter name ("Sep"). Threshold 68 px = padding (16) + ~52 px of
 *             text for the longest English month name; a foldable pill also
 *             carries a 12 px "−" dot + 4 px gap (and 5 px less left padding),
 *             so it needs 11 px more.
 * - 'dot'   — too narrow for any label (e.g. a one-day edge month at 22 px
 *             columns) but the month is foldable: render a "−"-only control so
 *             the spec's first/last-month fold interaction is never unreachable.
 * - 'none'  — too narrow for a label and not foldable: render nothing.
 */
export type MonthPillMode = 'full' | 'short' | 'dot' | 'none';
export function monthPillMode(pillMaxWidthPx: number, foldable: boolean): MonthPillMode {
  if (pillMaxWidthPx < 22) return foldable ? 'dot' : 'none';
  return pillMaxWidthPx < (foldable ? 79 : 68) ? 'short' : 'full';
}

export function ribbonLabel(span: MonthSpan): string {
  return `${span.monthLabel.slice(0, 3)} · ${dayWord(spanDays(span))}`;
}

export function ribbonAriaLabel(span: MonthSpan): string {
  return `Show ${span.monthLabel}, ${dayWord(spanDays(span))}`;
}

export function monthPaletteIndex(monthIndex: number): 0 | 1 | 2 {
  return (monthIndex % 3) as 0 | 1 | 2;
}

export const PILLS_FRAME_DAYS = 14;

export type FoldMode = 'ribbons' | 'pills' | 'off';

export function foldMode(wide: boolean, eligible: boolean): FoldMode {
  if (!eligible) return 'off';
  return wide ? 'ribbons' : 'pills';
}

export function frameDays(mode: FoldMode): number {
  return mode === 'pills' ? PILLS_FRAME_DAYS : STANDARD_FRAME_DAYS;
}

export type HeaderGeometry = {
  gutter: number;
  header: number;
  dateTop: number;
  weekDayTop: number;
  cycleDayTop: number;
  hairlineTop: number;
};

export function headerGeometry(mode: FoldMode): HeaderGeometry {
  const gutter = mode === 'pills' ? 30 : 22;
  return {
    gutter,
    header: gutter + 108,
    dateTop: gutter,
    weekDayTop: gutter + 36,
    cycleDayTop: gutter + 72,
    hairlineTop: gutter - 1,
  };
}

export type StripItem =
  | { kind: 'open'; months: [MonthSpan]; foldable: boolean }
  | { kind: 'folded'; side: 'before' | 'after'; months: MonthSpan[] }; // 1-3 consecutive months, calendar order

/** One item per month, calendar order, nothing merged. */
export function stripItems(spans: MonthSpan[], block: OpenBlock): StripItem[] {
  return spans.map((span, i): StripItem =>
    i >= block.from && i <= block.to
      ? { kind: 'open', months: [span], foldable: canFold(block, i) }
      : { kind: 'folded', side: i < block.from ? 'before' : 'after', months: [span] },
  );
}

const sumDays = (months: MonthSpan[]) => months.reduce((n, m) => n + spanDays(m), 0);
const short = (m: MonthSpan) => m.monthLabel.slice(0, 3);

export function stripItemLabel(item: StripItem, compact: boolean): string {
  const { months } = item;
  const name = months.length > 1 ? `${short(months[0])}\u2013${short(months[months.length - 1])}` : short(months[0]);
  return compact ? name : `${name} ${sumDays(months)}`;
}

export function stripItemAriaLabel(item: StripItem): string {
  if (item.kind === 'open') {
    const name = item.months[0].monthLabel;
    return item.foldable ? `Fold ${name}` : `${name} is open`;
  }
  const target = stripItemTarget(item);
  const t = item.months.find((m) => m.monthIndex === target) ?? item.months[0];
  const base = `Show ${t.monthLabel}, ${dayWord(spanDays(t))}`;
  if (item.months.length === 1) return base;
  const first = item.months[0].monthLabel;
  const last = item.months[item.months.length - 1].monthLabel;
  return `${base} (${first}\u2013${last} folded, ${dayWord(sumDays(item.months))})`;
}

/** monthIndex to open (folded) or fold (open); a merged pill targets the month nearest the open block. */
export function stripItemTarget(item: StripItem): number {
  const idx = item.months.map((m) => m.monthIndex);
  if (item.kind === 'folded' && item.side === 'before') return idx[idx.length - 1];
  return idx[0];
}

export function fitStrip(
  spans: MonthSpan[],
  block: OpenBlock,
  pillWidth: (item: StripItem, compact: boolean) => number,
  available: number,
  gap: number = 4,
): { items: StripItem[]; compact: boolean; scroll: boolean } {
  // Candidate merge chunks (>= 2 months): before-group from month 0, after-group from the last month.
  const chunks: [number, number][] = [];
  for (let a = 0; a < block.from; a += 3) {
    const b = Math.min(a + 2, block.from - 1);
    if (b > a) chunks.push([a, b]);
  }
  for (let b = spans.length - 1; b > block.to; b -= 3) {
    const a = Math.max(b - 2, block.to + 1);
    if (b > a) chunks.push([a, b]);
  }

  const base = stripItems(spans, block);
  const build = (merged: number): StripItem[] => {
    const out: StripItem[] = [];
    for (let i = 0; i < base.length; i++) {
      const chunk = chunks.slice(0, merged).find(([a]) => a === i);
      if (chunk) {
        const first = base[chunk[0]] as Extract<StripItem, { kind: 'folded' }>;
        out.push({ kind: 'folded', side: first.side, months: spans.slice(chunk[0], chunk[1] + 1) });
        i = chunk[1];
      } else {
        out.push(base[i]);
      }
    }
    return out;
  };
  const width = (items: StripItem[], c: boolean) =>
    items.reduce((n, it) => n + pillWidth(it, c), 0) + gap * Math.max(0, items.length - 1);

  let merged = 0;
  let items = build(0);
  while (width(items, false) > available && merged < chunks.length) {
    merged += 1;
    items = build(merged);
  }
  const compact = width(items, false) > available;
  return { items, compact, scroll: width(items, compact) > available };
}

/** The page's existing guard: a pin survives only when the first displayed day is unchanged and the day is still in range. */
export function keepsPin(
  day: number,
  prev: { minDay: number; maxDay: number },
  next: { minDay: number; maxDay: number },
): boolean {
  return prev.minDay === next.minDay && isDayInRange(day, next);
}
