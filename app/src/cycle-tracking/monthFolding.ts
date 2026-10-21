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
 * neighbours away from the anchor while fewer than STANDARD_FRAME_DAYS are open.
 */
export function defaultOpenBlock(spans: MonthSpan[], anchorLatest: boolean): OpenBlock {
  if (spans.length === 0) return { from: 0, to: 0 };
  const anchor = anchorLatest ? spans.length - 1 : 0;
  let from = anchor;
  let to = anchor;
  let total = spanDays(spans[anchor]);
  while (total < STANDARD_FRAME_DAYS && (from > 0 || to < spans.length - 1)) {
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
