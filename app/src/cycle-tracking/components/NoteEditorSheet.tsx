import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { NOTE_MAX_LENGTH, normalizeNote } from '../notesValidation';

type SaveArgs = {
  cycleId: string;
  dayNumber: number;
  date: string;
  notes: string | null;
};

export type NoteEditorSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  dayNumber: number;
  date: string;
  shortDate: string;
  existingNote: string | null;
  saveNote: (args: SaveArgs) => Promise<void>;
};

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function NoteEditorSheet({
  open,
  onOpenChange,
  cycleId,
  dayNumber,
  date,
  shortDate,
  existingNote,
  saveNote,
}: NoteEditorSheetProps) {
  const isMobile = useIsMobile();

  const [text, setText] = useState(existingNote ?? '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state when the sheet (re)opens for a different day
  useEffect(() => {
    if (open) {
      setText(existingNote ?? '');
      setConfirmDiscard(false);
      setConfirmDelete(false);
      setError(null);
    }
  }, [open, existingNote]);

  const counterColor =
    text.length >= NOTE_MAX_LENGTH ? 'text-red-600'
    : text.length > 130          ? 'text-amber-600'
    : 'text-slate-500';

  const initial = existingNote ?? '';
  const isDirty = text !== initial;

  const doSave = async (notes: string | null) => {
    setSaving(true);
    setError(null);
    try {
      await saveNote({ cycleId, dayNumber, date, notes });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save note. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const normalized = normalizeNote(text);
    void doSave(normalized);
  };

  const handleCancel = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const handleDiscard = () => {
    setConfirmDiscard(false);
    onOpenChange(false);
  };

  // Wraps the parent's onOpenChange so the X button / Escape / overlay
  // click all go through the same dirty-check as the Cancel button.
  // Opens always pass through; close attempts with unsaved changes show
  // the Discard? confirmation instead of dropping the user's text.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    void doSave(null);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'h-[50vh] rounded-t-lg'
            : 'w-[420px] sm:max-w-[420px]'
        }
      >
        <SheetHeader>
          <SheetTitle>Note · Day {dayNumber} ({shortDate})</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          <Textarea
            autoFocus
            rows={5}
            maxLength={NOTE_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={`text-xs text-right ${counterColor}`}>
            {text.length} / {NOTE_MAX_LENGTH}
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {existingNote !== null && existingNote !== '' && (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={handleDeleteClick}
                disabled={saving}
              >
                {confirmDelete ? 'Tap again to delete' : 'Delete'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {confirmDiscard ? (
              <Button variant="ghost" onClick={handleDiscard}>
                Discard changes?
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
