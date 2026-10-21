import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';
import { FoldRibbonLayer } from '../components/FoldRibbonLayer';
import { ribbonGroupX } from '../monthFolding';

const jul = { monthIndex: 0, monthLabel: 'July', startDayNumber: 1, endDayNumber: 25 };
const aug = { monthIndex: 1, monthLabel: 'August', startDayNumber: 26, endDayNumber: 56 };
const nov = { monthIndex: 4, monthLabel: 'November', startDayNumber: 118, endDayNumber: 130 };

let rafQueue: FrameRequestCallback[] = [];
beforeEach(() => {
  rafQueue = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function flushRaf() {
  const q = rafQueue;
  rafQueue = [];
  act(() => q.forEach((cb) => cb(0)));
}

function fakeScrollContainer(scrollLeft: number, clientWidth: number) {
  const el = document.createElement('div');
  let sl = scrollLeft;
  Object.defineProperty(el, 'scrollLeft', { get: () => sl, set: (v) => { sl = v; }, configurable: true });
  Object.defineProperty(el, 'clientWidth', { get: () => clientWidth, configurable: true });
  return { el };
}

const left = (name: string) => screen.getByRole('button', { name }).style.left;

describe('FoldRibbonLayer', () => {
  it('positions ribbon groups with ribbonGroupX and follows scroll events', () => {
    const { el } = fakeScrollContainer(0, 1000);
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement | null }).current = el;
    const onOpen = vi.fn();
    const naturalLeft = 82;
    const naturalRight = 1800;
    render(
      <FoldRibbonLayer
        scrollContainerRef={ref}
        foldedBefore={[jul, aug]}
        foldedAfter={[nov]}
        naturalLeft={naturalLeft}
        naturalRight={naturalRight}
        height={900}
        onOpen={onOpen}
      />,
    );
    const expectAt = (scrollLeft: number) => {
      const b = ribbonGroupX({ side: 'before', naturalX: naturalLeft, groupWidth: 48, scrollLeft, clientWidth: 1000 });
      const a = ribbonGroupX({ side: 'after', naturalX: naturalRight, groupWidth: 24, scrollLeft, clientWidth: 1000 });
      expect(left('Show July, 25 days')).toBe(`${b}px`);
      expect(left('Show August, 31 days')).toBe(`${b + 24}px`);
      expect(left('Show November, 13 days')).toBe(`${a}px`);
    };

    // Scrolled to the start: before-group at its natural slot, after-group pinned right.
    expectAt(0);
    expect(left('Show July, 25 days')).toBe('82px');
    expect(left('Show November, 13 days')).toBe('976px');

    // Scroll right: before-group sticks to the left edge, after-group follows the right edge.
    el.scrollLeft = 500;
    fireEvent.scroll(el);
    expect(left('Show July, 25 days')).toBe('82px'); // not until the frame
    flushRaf();
    expectAt(500);
    expect(left('Show July, 25 days')).toBe('500px');

    // Scrolled to the end: after-group rests at its natural slot.
    el.scrollLeft = 900;
    fireEvent.scroll(el);
    flushRaf();
    expectAt(900);
    expect(left('Show November, 13 days')).toBe('1800px');

    fireEvent.click(screen.getByRole('button', { name: 'Show August, 31 days' }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('removes its scroll listener on unmount', () => {
    const { el } = fakeScrollContainer(0, 1000);
    const remove = vi.spyOn(el, 'removeEventListener');
    const ref = { current: el };
    const { unmount } = render(
      <FoldRibbonLayer
        scrollContainerRef={ref}
        foldedBefore={[jul]}
        foldedAfter={[]}
        naturalLeft={82}
        naturalRight={1800}
        height={900}
        onOpen={vi.fn()}
      />,
    );
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
