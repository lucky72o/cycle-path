import { useEffect, useState, type RefObject } from 'react';
import type { MonthSpan } from '../utils';
import { paletteFor } from '../utils';
import { RIBBON_WIDTH, ribbonGroupX } from '../monthFolding';
import { FoldRibbon } from './FoldRibbon';

/**
 * Folded-month ribbons, pinned to the visible edges of the chart's scroll
 * container. Owns the scroll-position state so that scrolling re-renders only
 * this layer, not the whole chart page; the page mounts it only when there is
 * at least one ribbon, so short cycles and phones attach no scroll listener.
 */
export function FoldRibbonLayer({
  scrollContainerRef,
  foldedBefore,
  foldedAfter,
  naturalLeft,
  naturalRight,
  height,
  onOpen,
}: {
  scrollContainerRef: RefObject<HTMLElement>;
  foldedBefore: MonthSpan[];
  foldedAfter: MonthSpan[];
  /** Natural x of the before-group (chart coordinates). */
  naturalLeft: number;
  /** Natural x of the after-group (chart coordinates). */
  naturalRight: number;
  height: number;
  onOpen: (monthIndex: number) => void;
}) {
  const [viewport, setViewport] = useState({ scrollLeft: 0, clientWidth: 0 });

  useEffect(() => {
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

  const beforeX = ribbonGroupX({
    side: 'before',
    naturalX: naturalLeft,
    groupWidth: foldedBefore.length * RIBBON_WIDTH,
    scrollLeft: viewport.scrollLeft,
    clientWidth: viewport.clientWidth,
  });
  const afterX = ribbonGroupX({
    side: 'after',
    naturalX: naturalRight,
    groupWidth: foldedAfter.length * RIBBON_WIDTH,
    scrollLeft: viewport.scrollLeft,
    clientWidth: viewport.clientWidth,
  });

  return (
    <div className="absolute top-0 left-0" style={{ width: 0, height: 0, zIndex: 6 }}>
      {foldedBefore.map((s, i) => (
        <FoldRibbon
          key={s.monthIndex}
          span={s}
          x={beforeX + i * RIBBON_WIDTH}
          height={height}
          palette={paletteFor(s.monthIndex)}
          onOpen={() => onOpen(s.monthIndex)}
        />
      ))}
      {foldedAfter.map((s, i) => (
        <FoldRibbon
          key={s.monthIndex}
          span={s}
          x={afterX + i * RIBBON_WIDTH}
          height={height}
          palette={paletteFor(s.monthIndex)}
          onOpen={() => onOpen(s.monthIndex)}
        />
      ))}
    </div>
  );
}
