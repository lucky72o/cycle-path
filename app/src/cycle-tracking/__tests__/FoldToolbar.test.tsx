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
    expect(screen.queryAllByText(/days folded/)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Show all' })[1]).toBeDisabled();
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
});
