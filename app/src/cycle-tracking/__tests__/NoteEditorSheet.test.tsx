import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoteEditorSheet } from '../components/NoteEditorSheet';

const baseProps = {
  cycleId: 'cycle-1',
  dayNumber: 5,
  date: '2026-05-04',
  shortDate: 'Mon, May 4',
};

describe('NoteEditorSheet', () => {
  let saveNote: ReturnType<typeof vi.fn> & ((args: any) => Promise<void>);
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveNote = vi.fn().mockResolvedValue(undefined);
    onOpenChange = vi.fn();
  });

  it('renders the day and date in the header when open', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote={null}
        saveNote={saveNote}
      />
    );
    expect(screen.getByText(/Day 5/)).toBeInTheDocument();
    expect(screen.getByText(/Mon, May 4/)).toBeInTheDocument();
  });

  it('pre-fills the textarea with an existing note', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="Bad cramps"
        saveNote={saveNote}
      />
    );
    expect(screen.getByRole('textbox')).toHaveValue('Bad cramps');
  });

  it('shows a live character counter', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote=""
        saveNote={saveNote}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(screen.getByText(/5 \/ 150/)).toBeInTheDocument();
  });

  it('disables Save until text has changed', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } });
    expect(save).not.toBeDisabled();
  });

  it('saves the trimmed note and closes', async () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote=""
        saveNote={saveNote}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith({
        cycleId: 'cycle-1',
        dayNumber: 5,
        date: '2026-05-04',
        notes: 'hello',
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('save with empty text deletes the note (notes: null)', async () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
    });
  });

  it('Cancel with no changes closes without prompting', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pressing Escape with unsaved changes shows the Discard? confirm (does not close)', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('Cancel with unsaved changes shows a Discard? confirm before closing', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Delete uses an inline tap-again confirm', async () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote="hello"
        saveNote={saveNote}
      />
    );
    const del = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(del);
    expect(screen.getByRole('button', { name: /tap again to delete/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tap again to delete/i }));
    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not show Delete when there is no existing note', () => {
    render(
      <NoteEditorSheet
        {...baseProps}
        open
        onOpenChange={onOpenChange}
        existingNote={null}
        saveNote={saveNote}
      />
    );
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
