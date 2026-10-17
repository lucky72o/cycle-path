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
                  <td className='py-1.5 pr-2 text-slate-600 line-through dark:text-slate-400'>{row.saved}</td>
                  <td className='py-1.5 font-semibold text-[#1e3a8a] dark:text-blue-300'>{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {kept.length > 0 && (
            <p className='mt-3 text-xs text-emerald-700 dark:text-emerald-400'>
              {`✓ Kept as is: ${kept.map((k) => `${k.label} (${k.saved})`).join(', ')}`}
            </p>
          )}

          <div className='mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end'>
            <button
              type='button'
              disabled={busy}
              onClick={onKeepExisting}
              className='rounded-md border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-100 disabled:pointer-events-none disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900'
            >
              Keep existing
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={onReplace}
              className='rounded-md border border-red-600 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-50 dark:border-red-500 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900'
            >
              Replace
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={onCancel}
              className='rounded-md border border-[#1e3a8a] bg-transparent px-4 py-2 text-sm font-medium text-[#1e3a8a] hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-50 dark:border-blue-300 dark:text-blue-300 dark:hover:bg-blue-950'
            >
              Back to form
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
