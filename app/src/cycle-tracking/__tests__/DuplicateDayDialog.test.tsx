import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DuplicateDayDialog } from '../components/DuplicateDayDialog';

const conflicts = [
  { label: 'Bleeding', saved: 'Light', next: 'Heavy' },
  { label: 'Temperature', saved: '36.5', next: '36.8' },
];
const kept = [
  { label: 'Cervical Fluid · Appearance', saved: 'Sticky' },
  { label: 'Notes', saved: 'note' },
];

function setup(overrides: Partial<React.ComponentProps<typeof DuplicateDayDialog>> = {}) {
  const handlers = { onReplace: vi.fn(), onKeepExisting: vi.fn(), onCancel: vi.fn() };
  render(
    <DuplicateDayDialog open dateLabel='14/05' conflicts={conflicts} kept={kept} {...handlers} {...overrides} />
  );
  return handlers;
}

describe('DuplicateDayDialog', () => {
  afterEach(cleanup);

  it('renders the title and body copy', () => {
    setup();
    expect(screen.getByText('Overwrite existing data for 14/05?')).toBeInTheDocument();
    expect(
      screen.getByText('This day already has an entry. Saving will replace these fields:')
    ).toBeInTheDocument();
    for (const h of ['Field', 'Saved', 'New']) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it('renders a row per conflict with the saved value struck through', () => {
    setup();
    expect(screen.getByText('Bleeding')).toBeInTheDocument();
    expect(screen.getByText('Light')).toHaveClass('line-through');
    expect(screen.getByText('Heavy')).toBeInTheDocument();
    expect(screen.getByText('36.5')).toHaveClass('line-through');
    expect(screen.getByText('36.8')).toBeInTheDocument();
  });

  it('renders the kept line when kept is non-empty', () => {
    setup();
    expect(
      screen.getByText('✓ Kept as is: Cervical Fluid · Appearance (Sticky), Notes (note)')
    ).toBeInTheDocument();
  });

  it('omits the kept line when kept is empty', () => {
    setup({ kept: [] });
    expect(screen.queryByText(/Kept as is/)).not.toBeInTheDocument();
  });

  it('calls the matching handler once per button', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(h.onReplace).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep existing' }));
    expect(h.onKeepExisting).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(h.onReplace).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape', () => {
    const h = setup();
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables all buttons when busy', () => {
    setup({ busy: true });
    for (const name of ['Replace', 'Keep existing', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByText(/Overwrite existing data/)).not.toBeInTheDocument();
  });
});
