import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FoldToolbar } from '../components/FoldToolbar';

afterEach(cleanup);

describe('FoldToolbar', () => {
  it('shows the folded count and disables Show all when everything is open', () => {
    render(<FoldToolbar foldedDays={56} allOpen={false} onShowAll={vi.fn()} onCollapseAll={vi.fn()} />);
    expect(screen.getByText('56 days folded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeEnabled();
    render(<FoldToolbar foldedDays={0} allOpen onShowAll={vi.fn()} onCollapseAll={vi.fn()} />);
    expect(screen.queryAllByText(/folded/)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Show all' })[1]).toBeDisabled();
  });

  it('uses the singular for one folded day', () => {
    render(<FoldToolbar foldedDays={1} allOpen={false} onShowAll={vi.fn()} onCollapseAll={vi.fn()} />);
    expect(screen.getByText('1 day folded')).toBeInTheDocument();
  });

  it('fires the callbacks', () => {
    const onShowAll = vi.fn();
    const onCollapseAll = vi.fn();
    render(<FoldToolbar foldedDays={3} allOpen={false} onShowAll={onShowAll} onCollapseAll={onCollapseAll} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
  });

  function renderWrapped(isolate: boolean) {
    const spies = { onClick: vi.fn(), onPointerDown: vi.fn(), onTouchStart: vi.fn() };
    const onShowAll = vi.fn();
    const onCollapseAll = vi.fn();
    render(
      <div {...spies}>
        <FoldToolbar
          foldedDays={3}
          allOpen={false}
          onShowAll={onShowAll}
          onCollapseAll={onCollapseAll}
          {...(isolate ? { isolateEvents: true } : {})}
        />
      </div>,
    );
    for (const name of ['Show all', 'Collapse all']) {
      const btn = screen.getByRole('button', { name });
      fireEvent.pointerDown(btn);
      fireEvent.touchStart(btn);
      fireEvent.click(btn);
    }
    return { spies, onShowAll, onCollapseAll };
  }

  it('with isolateEvents, pointerdown/touchstart/click never reach ancestors and actions still fire', () => {
    const { spies, onShowAll, onCollapseAll } = renderWrapped(true);
    expect(spies.onClick).not.toHaveBeenCalled();
    expect(spies.onPointerDown).not.toHaveBeenCalled();
    expect(spies.onTouchStart).not.toHaveBeenCalled();
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
  });

  it('without isolateEvents, events still propagate (desktop unchanged)', () => {
    const { spies } = renderWrapped(false);
    expect(spies.onClick).toHaveBeenCalledTimes(2);
    expect(spies.onPointerDown).toHaveBeenCalledTimes(2);
    expect(spies.onTouchStart).toHaveBeenCalledTimes(2);
  });
});
