import { dayWord } from '../monthFolding';

const BTN =
  'px-3 py-1 rounded-md border border-[#1e3a8a] text-[#1e3a8a] bg-white text-xs font-semibold hover:bg-[#eff6ff] disabled:opacity-40 disabled:cursor-default';

export function FoldToolbar({
  foldedDays,
  allOpen,
  onShowAll,
  onCollapseAll,
}: {
  foldedDays: number;
  allOpen: boolean;
  onShowAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div>
        {foldedDays > 0 && <span className="text-xs text-slate-600">{dayWord(foldedDays)} folded</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" className={BTN} disabled={allOpen} onClick={onShowAll}>
          Show all
        </button>
        <button type="button" className={BTN} onClick={onCollapseAll}>
          Collapse all
        </button>
      </div>
    </div>
  );
}
