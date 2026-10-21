import { useLayoutEffect, useMemo, useState, type RefObject, type SyntheticEvent } from 'react';
import type { MonthSpan } from '../utils';
import { paletteFor } from '../utils';
import {
  fitStrip,
  stripItemAriaLabel,
  stripItemLabel,
  stripItemTarget,
  type OpenBlock,
  type StripItem,
} from '../monthFolding';
import { SignDot } from './SignDot';
import { measurePillWidth } from './measurePill';

const GUTTER = 30;
const STUB_W = 4;
const stop = (e: SyntheticEvent) => e.stopPropagation();

function Stub({
  testId,
  spans,
  x,
  height,
}: {
  testId: string;
  spans: MonthSpan[];
  x: number;
  height: number;
}) {
  if (spans.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: GUTTER,
        left: x,
        width: STUB_W,
        height: Math.max(0, height - GUTTER),
        display: 'flex',
        flexDirection: 'column',
        opacity: 0.9,
        pointerEvents: 'none',
      }}
    >
      {spans.map((s) => (
        <div key={s.monthIndex} data-testid={testId} style={{ flex: 1, background: paletteFor(s.monthIndex).underline }} />
      ))}
    </div>
  );
}

/**
 * Month pills floating at the left edge of the chart's scroll container, plus
 * 4 px edge stubs marking hidden months. Owns the scroll position so scrolling
 * re-renders only this component.
 */
export function MonthPillStrip({
  scrollContainerRef,
  spans,
  block,
  chartWidth,
  height,
  onOpen,
  onFold,
  measure = measurePillWidth,
}: {
  scrollContainerRef: RefObject<HTMLElement>;
  spans: MonthSpan[];
  block: OpenBlock;
  chartWidth: number;
  height: number;
  onOpen: (monthIndex: number) => void;
  onFold: (monthIndex: number) => void;
  measure?: (item: StripItem, compact: boolean) => number;
}) {
  const [viewport, setViewport] = useState({ scrollLeft: 0, clientWidth: 0 });

  // Layout effect: read the viewport before first paint so fitStrip never runs with width 0 on screen.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const read = () => {
      const next = { scrollLeft: el.scrollLeft, clientWidth: el.clientWidth };
      setViewport((prev) =>
        prev.scrollLeft === next.scrollLeft && prev.clientWidth === next.clientWidth ? prev : next,
      );
    };
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [scrollContainerRef]);

  const { scrollLeft, clientWidth } = viewport;
  const stripWidth = Math.max(0, clientWidth - 8);
  const { items, compact, scroll } = useMemo(
    () => fitStrip(spans, block, measure, stripWidth),
    [spans, block, stripWidth, measure],
  );

  const before = spans.slice(0, block.from);
  const after = spans.slice(block.to + 1);

  return (
    <div className="absolute top-0 left-0" style={{ width: 0, height: 0, zIndex: 6 }}>
      <div
        data-testid="pill-strip"
        className="no-scrollbar"
        style={{
          position: 'absolute',
          top: 0,
          left: scrollLeft + 4,
          width: stripWidth,
          height: GUTTER,
          display: 'flex',
          gap: 4,
          // The 30 px row already contains the 22 px pill + its 2 px outline, so
          // nothing needs clipping vertically; only scroll mode clips/scrolls.
          overflow: scroll ? 'auto' : 'visible',
          scrollbarWidth: 'none',
        }}
      >
        {items.map((item) => {
          const palette = paletteFor(item.months[0].monthIndex);
          const open = item.kind === 'open';
          const foldable = open && item.foldable;
          const inert = open && !item.foldable;
          const target = stripItemTarget(item);
          const label = stripItemLabel(item, compact);
          const ariaLabel = stripItemAriaLabel(item);
          return (
            <button
              key={item.months[0].monthIndex}
              type="button"
              aria-label={ariaLabel}
              title={ariaLabel}
              aria-disabled={inert ? 'true' : undefined}
              onClick={(e) => {
                stop(e);
                if (inert) return;
                if (open) onFold(target);
                else onOpen(target);
              }}
              onPointerDown={stop}
              onTouchStart={stop}
              style={{
                flex: '0 0 auto',
                height: GUTTER,
                display: 'flex',
                alignItems: 'center',
                padding: 0,
                background: 'transparent',
                border: 0,
                cursor: inert ? 'default' : 'pointer',
              }}
            >
              <span
                data-testid="pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 22,
                  boxSizing: 'border-box',
                  borderRadius: 11,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  padding: foldable || !open ? '0 8px 0 5px' : '0 9px',
                  boxShadow: '0 0 0 2px #fff',
                  background: open ? palette.pillBg : '#fff',
                  border: `1px solid ${open ? palette.pillBg : palette.underline}`,
                  color: palette.pillText,
                }}
              >
                {foldable && <SignDot sign="−" color={palette.pillText} gap={4} />}
                {!open && <span aria-hidden="true" style={{ marginRight: 4 }}>+</span>}
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <Stub testId="stub-before" spans={before} x={scrollLeft} height={height} />
      <Stub
        testId="stub-after"
        spans={after}
        x={Math.min(chartWidth - STUB_W, scrollLeft + clientWidth - STUB_W)}
        height={height}
      />
    </div>
  );
}
