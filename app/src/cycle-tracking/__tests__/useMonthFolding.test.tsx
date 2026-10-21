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
});
