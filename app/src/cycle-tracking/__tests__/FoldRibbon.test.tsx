import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FoldRibbon } from '../components/FoldRibbon';
import { paletteFor } from '../utils';

const sep = { monthIndex: 2, monthLabel: 'September', startDayNumber: 1, endDayNumber: 30 };

afterEach(cleanup);

describe('FoldRibbon', () => {
  it('renders an accessible button with the month label and calls onOpen on click', () => {
    const onOpen = vi.fn();
    render(<FoldRibbon span={sep} x={82} height={900} palette={paletteFor(2)} onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: 'Show September, 30 days' });
    expect(btn).toHaveTextContent('Sep · 30 days');
    expect(btn).toHaveAttribute('title', 'Show September, 30 days');
    expect(btn).toHaveStyle({ left: '82px', top: '0px', width: '24px', height: '900px' });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stops click, pointerdown and touchstart propagation', () => {
    const parent = vi.fn();
    render(
      <div onClick={parent} onPointerDown={parent} onTouchStart={parent}>
        <FoldRibbon span={sep} x={0} height={100} palette={paletteFor(0)} onOpen={vi.fn()} />
      </div>,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    fireEvent.pointerDown(btn);
    fireEvent.touchStart(btn);
    expect(parent).not.toHaveBeenCalled();
  });
});
