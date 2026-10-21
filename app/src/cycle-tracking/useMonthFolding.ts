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
  foldedDayCount,
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

export type MonthFolding = {
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
  scrollIntent: React.MutableRefObject<'start' | 'end' | null>;
};

export function useMonthFolding(args: {
  cycleId: string | undefined;
  cycleStartDate: Date | null;
  lastDay: number;
  anchorLatest: boolean;
}): MonthFolding {
  const { cycleId, cycleStartDate, lastDay, anchorLatest } = args;
  const wide = useIsWideViewport();
  const startMs = cycleStartDate ? cycleStartDate.getTime() : null;

  const spans = useMemo(
    () => (startMs === null ? [] : buildMonthSpans(new Date(startMs), 1, lastDay)),
    [startMs, lastDay],
  );
  const enabled = wide && isFoldingEligible(lastDay, spans);
  const anchorSide: 'start' | 'end' = anchorLatest ? 'end' : 'start';

  // The user's block is only valid for the key it was set under; any change of
  // cycle, anchor, enabled state or month count implicitly falls back to the
  // default (the month count guards against a stale block indexing past the
  // end of a cycle that lost a month).
  const cycleAnchorKey = `${cycleId ?? ''}|${anchorLatest}`;
  const key = `${cycleAnchorKey}|${enabled}|${spans.length}`;
  const [user, setUser] = useState<{ key: string; block: OpenBlock } | null>(null);
  const scrollIntent = useRef<'start' | 'end' | null>(anchorSide);
  const [seen, setSeen] = useState({ key, cycleAnchorKey, enabled });
  if (seen.key !== key) {
    // Render-time reset (React-supported): drop the stale block immediately,
    // so a later return to a previous key cannot resurrect it. A new cycle or
    // anchor, or folding switching back on, re-arms the scroll to the anchor
    // side in the same render, so callers need no effect-ordering contract.
    if (seen.cycleAnchorKey !== cycleAnchorKey || (enabled && !seen.enabled)) {
      scrollIntent.current = anchorSide;
    }
    setSeen({ key, cycleAnchorKey, enabled });
    setUser(null);
  }
  const userBlock = user && user.key === key ? user.block : null;

  const defaultBlock = useMemo(() => defaultOpenBlock(spans, anchorLatest), [spans, anchorLatest]);
  const block = userBlock ?? defaultBlock;

  const setBlock = useCallback((b: OpenBlock) => setUser({ key, block: b }), [key]);

  const fold = useCallback(
    (i: number) => setBlock(foldMonth(block, i)),
    [block, setBlock],
  );
  const open = useCallback(
    (i: number) => {
      if (i < block.from) scrollIntent.current = 'start';
      else if (i > block.to) scrollIntent.current = 'end';
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
  const canFold = useCallback((i: number) => canFoldBlock(block, i), [block]);

  return {
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
