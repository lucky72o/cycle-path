import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMonthFolding } from '../useMonthFolding';
import { defaultOpenBlock } from '../monthFolding';
import { buildMonthSpans } from '../utils';

const originalMatchMedia = window.matchMedia;
let changeListener: ((e: { matches: boolean }) => void) | null = null;

function stubMatchMedia(matches: boolean) {
  changeListener = null;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      changeListener = cb;
    },
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const args = {
  cycleId: 'c8' as string | undefined,
  cycleStartDate: new Date('2026-07-07'),
  lastDay: 105,
  anchorLatest: true,
};

describe('useMonthFolding', () => {
  it('is disabled below 1024px and exposes the full range', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMonthFolding(args));
    expect(result.current.enabled).toBe(false);
    expect(result.current.visible).toBeNull();
    expect(result.current.spans.length).toBeGreaterThan(1);
    expect(result.current.canFold(0)).toBe(false);
    expect(result.current.canFold(result.current.spans.length - 1)).toBe(false);
  });

  it('opens the default block and sets scrollIntent to the anchor side', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMonthFolding(args));
    expect(result.current.enabled).toBe(true);
    expect(result.current.block).toEqual({ from: 2, to: 3 });
    expect(result.current.scrollIntent.current).toBe('end');
    expect(result.current.visible).not.toBeNull();
  });

  it('open/fold/showAll/collapseAll update block and scrollIntent', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMonthFolding(args));
    const ref = result.current.scrollIntent;
    act(() => result.current.open(0));
    expect(result.current.block).toEqual({ from: 0, to: 3 });
    expect(ref.current).toBe('start');
    act(() => result.current.collapseAll());
    expect(result.current.block).toEqual({ from: 3, to: 3 });
    expect(ref.current).toBe('end');
    act(() => result.current.fold(3));
    expect(result.current.block).toEqual({ from: 3, to: 3 });
    act(() => result.current.showAll());
    expect(result.current.block).toEqual({ from: 0, to: 3 });
    expect(result.current.allOpen).toBe(true);
    expect(ref.current).toBe('end');
    ref.current = null;
    act(() => result.current.fold(0));
    expect(result.current.block).toEqual({ from: 1, to: 3 });
    expect(ref.current).toBeNull();
    expect(result.current.scrollIntent).toBe(ref);
  });

  it('open(after-month) sets the end-of-range intent', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMonthFolding(args));
    act(() => result.current.fold(3));
    expect(result.current.block).toEqual({ from: 2, to: 2 });
    result.current.scrollIntent.current = null;
    act(() => result.current.open(3));
    expect(result.current.block).toEqual({ from: 2, to: 3 });
    expect(result.current.scrollIntent.current).toBe('end-of-range');
  });

  it('resets to the default block when the cycle id changes', () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook((p) => useMonthFolding(p), { initialProps: args });
    act(() => result.current.collapseAll());
    expect(result.current.block).toEqual({ from: 3, to: 3 });
    result.current.scrollIntent.current = null;
    rerender({ ...args, cycleId: 'c9' });
    expect(result.current.block).toEqual({ from: 2, to: 3 });
    expect(result.current.scrollIntent.current).toBe('end');
  });

  it('returns to the default block after the viewport drops below and above 1024px', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMonthFolding(args));
    act(() => result.current.collapseAll());
    act(() => changeListener!({ matches: false }));
    expect(result.current.enabled).toBe(false);
    act(() => changeListener!({ matches: true }));
    const spans = buildMonthSpans(args.cycleStartDate, 1, args.lastDay);
    expect(result.current.block).toEqual(defaultOpenBlock(spans, true));
    expect(result.current.block).not.toEqual({ from: 3, to: 3 });
  });

  it('re-arms scrollIntent to the anchor side when folding switches back on', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMonthFolding(args));
    act(() => result.current.collapseAll());
    result.current.scrollIntent.current = null;
    act(() => changeListener!({ matches: false }));
    // Folding switching off also discards the block and re-arms the intent.
    expect(result.current.scrollIntent.current).toBe('end');
    result.current.scrollIntent.current = null;
    act(() => changeListener!({ matches: true }));
    expect(result.current.scrollIntent.current).toBe('end');
  });

  it('re-arms scrollIntent to the anchor side when the cycle gains a month', () => {
    stubMatchMedia(true);
    // Day 80 is 24 Sep: Jul, Aug, Sep.
    const { result, rerender } = renderHook((p) => useMonthFolding(p), {
      initialProps: { ...args, lastDay: 80 },
    });
    act(() => result.current.open(0));
    expect(result.current.block).toEqual({ from: 0, to: 2 });
    expect(result.current.scrollIntent.current).toBe('start');
    result.current.scrollIntent.current = null;
    // Day 87 is 1 Oct: October appears, the user block is discarded.
    rerender({ ...args, lastDay: 87 });
    expect(result.current.spans.length).toBe(4);
    expect(result.current.block).toEqual(defaultOpenBlock(result.current.spans, true));
    expect(result.current.scrollIntent.current).toBe('end');
  });

  it('falls back to the default block when the cycle loses a month', () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook((p) => useMonthFolding(p), { initialProps: args });
    act(() => result.current.showAll());
    expect(result.current.block).toEqual({ from: 0, to: 3 });
    // Day 80 is 24 Sep: October disappears; the stale { to: 3 } must not reach visibleDayRange.
    expect(() => rerender({ ...args, lastDay: 80 })).not.toThrow();
    expect(result.current.spans.length).toBe(3);
    expect(result.current.block).toEqual({ from: 1, to: 2 });
    expect(result.current.visible).toEqual({ minDay: 26, maxDay: 80 });
  });
});
