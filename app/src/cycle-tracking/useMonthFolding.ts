import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMonthSpans, type MonthSpan } from './utils';
import {
  FOLD_MIN_VIEWPORT_PX,
  type OpenBlock,
  allOpenBlock,
  canFold as canFoldBlock,
  collapsedBlock,
  defaultOpenBlock,
  foldMonth,
  focusedOpenBlock,
  foldedDayCount,
  foldMode,
  frameDays,
  type FoldMode,
  isAllOpen,
  isFoldingEligible,
  openMonth,
  visibleDayRange,
} from './monthFolding';

const WIDE_QUERY = `(min-width: ${FOLD_MIN_VIEWPORT_PX}px)`;

export function useIsWideViewport(): boolean {
  const [wide, setWide] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(WIDE_QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = (e: { matches: boolean }) => setWide(e.matches);
    setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * Pending programmatic scroll. 'end' = the latest recorded day at the right
 * edge (padded future days of an active cycle stay off-screen); 'end-of-range'
 * = the very end of the scroll range (after opening a folded-after month);
 * 'start' = day 1 of the displayed range; { day } = that day centred (return
 * from saving a day).
 */
export type ScrollIntent = 'start' | 'end' | 'end-of-range' | { day: number };

export type MonthFolding = {
  mode: FoldMode;
  enabled: boolean;
  spans: MonthSpan[];
  block: OpenBlock;
  visible: { minDay: number; maxDay: number } | null;
  foldedBefore: MonthSpan[];
  foldedAfter: MonthSpan[];
  foldedDays: number;
  allOpen: boolean;
  canFold(monthIndex: number): boolean;
  fold(monthIndex: number): void;
  open(monthIndex: number): void;
  showAll(): void;
  collapseAll(): void;
  scrollIntent: React.MutableRefObject<ScrollIntent | null>;
};

export function useMonthFolding(args: {
  cycleId: string | undefined;
  cycleStartDate: Date | null;
  lastDay: number;
  anchorLatest: boolean;
  /** Day just added or edited: the default view opens on it instead of the anchor. */
  focusDay?: number | null;
}): MonthFolding {
  const { cycleId, cycleStartDate, lastDay, anchorLatest, focusDay = null } = args;
  const wide = useIsWideViewport();
  const startMs = cycleStartDate ? cycleStartDate.getTime() : null;

  const spans = useMemo(
    () => (startMs === null ? [] : buildMonthSpans(new Date(startMs), 1, lastDay)),
    [startMs, lastDay],
  );
  const mode = foldMode(wide, isFoldingEligible(lastDay, spans));
  const enabled = mode !== 'off';
  const anchorSide: 'start' | 'end' = anchorLatest ? 'end' : 'start';
  const homeIntent: ScrollIntent = focusDay !== null ? { day: focusDay } : anchorSide;

  // The user's block is only valid for the key it was set under; any change of
  // cycle, anchor, fold mode or month count implicitly falls back to the
  // default (the month count guards against a stale block indexing past the
  // end of a cycle that lost a month).
  // The focus day's presence is part of the key: right after a save the page
  // can render from the pre-save cache (no saved day yet), so the refetch that
  // adds it must re-arm the focus scroll even when the month count is unchanged.
  const focusInSpans =
    focusDay !== null && spans.some(s => focusDay >= s.startDayNumber && focusDay <= s.endDayNumber);
  const key = `${cycleId ?? ''}|${anchorLatest}|${mode}|${spans.length}|${focusDay ?? ''}|${focusInSpans}`;
  const [user, setUser] = useState<{ key: string; block: OpenBlock } | null>(null);
  const scrollIntent = useRef<ScrollIntent | null>(homeIntent);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    // Render-time reset (React-supported): drop the stale block immediately,
    // so a later return to a previous key cannot resurrect it. Any key change
    // (cycle, anchor, fold mode, a gained or lost month) falls back to the
    // default view, so it also re-arms the scroll to the anchor side (or the
    // focus day) in the same render; callers need no effect-ordering contract.
    scrollIntent.current = homeIntent;
    setSeenKey(key);
    setUser(null);
  }
  const userBlock = user && user.key === key ? user.block : null;

  const defaultBlock = useMemo(() => {
    const base = defaultOpenBlock(spans, anchorLatest, frameDays(mode));
    return focusDay !== null ? focusedOpenBlock(spans, base, focusDay, frameDays(mode)) : base;
  }, [spans, anchorLatest, mode, focusDay]);
  const block = userBlock ?? defaultBlock;

  const setBlock = useCallback((b: OpenBlock) => setUser({ key, block: b }), [key]);

  const fold = useCallback(
    (i: number) => setBlock(foldMonth(block, i)),
    [block, setBlock],
  );
  const open = useCallback(
    (i: number) => {
      if (i < block.from) scrollIntent.current = 'start';
      else if (i > block.to) scrollIntent.current = 'end-of-range';
      setBlock(openMonth(block, i));
    },
    [block, setBlock],
  );
  const showAll = useCallback(() => {
    scrollIntent.current = anchorSide;
    setBlock(allOpenBlock(spans));
  }, [anchorSide, spans, setBlock]);
  const collapseAll = useCallback(() => {
    scrollIntent.current = anchorSide;
    setBlock(collapsedBlock(spans, anchorLatest));
  }, [anchorSide, anchorLatest, spans, setBlock]);
  const canFold = useCallback((i: number) => enabled && canFoldBlock(block, i), [enabled, block]);

  return {
    mode,
    enabled,
    spans,
    block,
    visible: enabled ? visibleDayRange(block, spans) : null,
    foldedBefore: enabled ? spans.slice(0, block.from) : [],
    foldedAfter: enabled ? spans.slice(block.to + 1) : [],
    foldedDays: enabled ? foldedDayCount(block, spans) : 0,
    allOpen: isAllOpen(block, spans),
    canFold,
    fold,
    open,
    showAll,
    collapseAll,
    scrollIntent,
  };
}
