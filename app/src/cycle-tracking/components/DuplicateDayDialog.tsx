import * as Dialog from '@radix-ui/react-dialog';

import type { DuplicateComparison, FieldRow } from '../duplicateDay';

interface DuplicateDayDialogProps {
  open: boolean;
  dateLabel: string;
  conflicts: FieldRow[];
  kept: DuplicateComparison['kept'];
  busy?: boolean;
  onReplace: () => void;
  onKeepExisting: () => void;
  onCancel: () => void; // also fired on Esc / overlay click
}

export function DuplicateDayDialog({
  open,
  dateLabel,
  conflicts,
  kept,
  busy = false,
  onReplace,
  onKeepExisting,
  onCancel,
}: DuplicateDayDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-50 bg-black/60' />
        <Dialog.Content className='fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-background p-5 shadow-lg'>
          <Dialog.Title className='text-lg font-semibold text-foreground'>
            Overwrite existing data for {dateLabel}?
          </Dialog.Title>
          <Dialog.Description className='mt-2 text-sm text-muted-foreground'>
            This day already has an entry. Saving will replace these fields:
          </Dialog.Description>

          <table className='mt-3 w-full text-sm'>
            <thead>
              <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
                <th className='py-1 pr-2 font-medium'>Field</th>
                <th className='py-1 pr-2 font-medium'>Saved</th>
                <th className='py-1 font-medium'>New</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((row) => (
                <tr key={row.label} className='border-b last:border-b-0'>
                  <td className='py-1.5 pr-2 font-medium text-foreground'>{row.label}</td>
                  <td className='py-1.5 pr-2 text-muted-foreground line-through'>{row.saved}</td>
                  <td className='py-1.5 font-medium text-amber-700 dark:text-amber-400'>{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {kept.length > 0 && (
            <p className='mt-3 text-xs text-muted-foreground'>
              {`✓ Kept as is: ${kept.map((k) => `${k.label} (${k.saved})`).join(', ')}`}
            </p>
          )}

          <div className='mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <button
              type='button'
              disabled={busy}
              onClick={onCancel}
              className='rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50'
            >
              Cancel
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={onKeepExisting}
              className='rounded-md border border-amber-600 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-950'
            >
              Keep existing
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={onReplace}
              className='rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:pointer-events-none disabled:opacity-50 dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400'
            >
              Replace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
