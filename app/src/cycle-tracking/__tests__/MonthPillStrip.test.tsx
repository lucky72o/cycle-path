import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { createRef } from 'react';
import { MonthPillStrip } from '../components/MonthPillStrip';
import { stripItemLabel } from '../monthFolding';
import type { StripItem } from '../monthFolding';
import { paletteFor } from '../utils';

const spans = [
  { monthIndex: 0, monthLabel: 'July', startDayNumber: 1, endDayNumber: 25 },
  { monthIndex: 1, monthLabel: 'August', startDayNumber: 26, endDayNumber: 56 },
  { monthIndex: 2, monthLabel: 'September', startDayNumber: 57, endDayNumber: 86 },
  { monthIndex: 3, monthLabel: 'October', startDayNumber: 87, endDayNumber: 105 },
];

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

const measure = (i: StripItem, c: boolean) => 10 * stripItemLabel(i, c).length + 20;

function base(clientWidth: number, scrollLeft = 0) {
  const { el } = fakeScrollContainer(scrollLeft, clientWidth);
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement | null }).current = el;
  return {
    el,
    scrollContainerRef: ref,
    spans,
    chartWidth: 2000,
    height: 860,
    onOpen: vi.fn(),
    onFold: vi.fn(),
    measure,
  };
}

function normalise(colour: string): string {
  const hex = colour.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return colour.trim();
}

const props = (clientWidth: number, scrollLeft = 0) => {
  const { el: _el, ...rest } = base(clientWidth, scrollLeft);
  return rest;
};

describe('MonthPillStrip', () => {
  it('renders one pill per month in calendar order with the spec labels', () => {
    render(<MonthPillStrip {...props(1000)} block={{ from: 3, to: 3 }} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Show July, 25 days', 'Show August, 31 days', 'Show September, 30 days', 'October is open',
    ]);
    expect(screen.getByRole('button', { name: 'Show July, 25 days' })).toHaveTextContent(/\+\s*Jul 25/);
  });

  it('open pills show "−" only when foldable and call onFold', () => {
    const onFold = vi.fn();
    render(<MonthPillStrip {...props(1000)} block={{ from: 2, to: 3 }} onFold={onFold} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fold September' }));
    expect(onFold).toHaveBeenCalledWith(2);
  });

  it('lone open pills are inert', () => {
    const p = props(1000);
    render(<MonthPillStrip {...p} block={{ from: 3, to: 3 }} />);
    const b = screen.getByRole('button', { name: 'October is open' });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(b);
    expect(p.onFold).not.toHaveBeenCalled();
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it('folded pills call onOpen; a merged pill opens the month nearest the block', () => {
    const onOpen = vi.fn();
    render(<MonthPillStrip {...props(300)} block={{ from: 3, to: 3 }} onOpen={onOpen} />);
    const merged = screen.getByRole('button', { name: 'Show September, 30 days (July–September folded, 86 days)' });
    expect(merged).toHaveTextContent('Jul–Sep 86');
    fireEvent.click(merged);
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('merged pill takes its first month colour; folded pills are outlined', () => {
    render(<MonthPillStrip {...props(300)} block={{ from: 3, to: 3 }} />);
    const pill = within(screen.getByRole('button', { name: /July–September/ })).getByTestId('pill');
    expect(normalise(pill.style.borderColor)).toBe(normalise(paletteFor(0).underline));
    expect(pill.style.background).toContain('rgb(255, 255, 255)');
  });

  it('floats at scrollLeft + 4 and follows scroll', () => {
    const p = base(1000);
    const { el, ...rest } = p;
    render(<MonthPillStrip {...rest} block={{ from: 3, to: 3 }} />);
    const strip = screen.getByTestId('pill-strip');
    expect(strip.style.left).toBe('4px');
    expect(strip.style.width).toBe('992px');
    el.scrollLeft = 500;
    fireEvent.scroll(el);
    flushRaf();
    expect(strip.style.left).toBe('504px');
    expect(strip.style.width).toBe('992px');
  });

  it('stops propagation so taps never pin a tooltip', () => {
    const outer = vi.fn();
    render(
      <div onClick={outer} onPointerDown={outer} onTouchStart={outer}>
        <MonthPillStrip {...props(1000)} block={{ from: 3, to: 3 }} />
      </div>,
    );
    const b = screen.getByRole('button', { name: 'Show July, 25 days' });
    fireEvent.pointerDown(b);
    fireEvent.touchStart(b);
    fireEvent.click(b);
    expect(outer).not.toHaveBeenCalled();
  });

  it('draws a before-stub with one segment per hidden month and no after-stub', () => {
    render(<MonthPillStrip {...props(1000)} block={{ from: 3, to: 3 }} />);
    const segs = screen.getAllByTestId('stub-before');
    expect(segs.map((s) => normalise(s.style.background))).toEqual(
      [0, 1, 2].map((i) => normalise(paletteFor(i).underline)),
    );
    expect(screen.queryByTestId('stub-after')).toBeNull();
  });

  it('clamps the after-stub to the chart edge when the chart is narrower than the viewport', () => {
    render(<MonthPillStrip {...props(900)} chartWidth={400} block={{ from: 0, to: 0 }} />);
    const after = screen.getAllByTestId('stub-after');
    expect(after).toHaveLength(3);
    const wrapper = after[0].parentElement as HTMLElement;
    expect(wrapper.style.left).toBe('396px');
    expect(screen.queryByTestId('stub-before')).toBeNull();
  });

  it('lets the strip scroll when even compact pills do not fit', () => {
    render(<MonthPillStrip {...props(80)} block={{ from: 0, to: 3 }} />);
    expect(screen.getByTestId('pill-strip').style.overflowX).toBe('auto');
  });
});
