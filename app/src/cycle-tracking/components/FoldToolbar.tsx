import { dayWord } from "../monthFolding";

const BTN =
  "px-3 py-1 rounded-md border border-[#1e3a8a] text-[#1e3a8a] bg-white text-xs font-semibold hover:bg-[#eff6ff] disabled:opacity-40 disabled:cursor-default";

export function FoldToolbar({
  foldedDays,
  allOpen,
  onShowAll,
  onCollapseAll,
  isolateEvents = false,
}: {
  foldedDays: number;
  allOpen: boolean;
  onShowAll: () => void;
  onCollapseAll: () => void;
  /** Stop click/pointerdown/touchstart from reaching the page's outside-tap handlers (pills mode). */
  isolateEvents?: boolean;
}) {
  const stop = (e: { stopPropagation: () => void }) => {
    if (isolateEvents) e.stopPropagation();
  };
  const isolation = { onPointerDown: stop, onTouchStart: stop };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div>
        {foldedDays > 0 && (
          <span className="text-xs text-slate-600">
            {dayWord(foldedDays)} folded
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={BTN}
          disabled={allOpen}
          {...isolation}
          onClick={(e) => {
            stop(e);
            onShowAll();
          }}
        >
          Show all
        </button>
        <button
          type="button"
          className={BTN}
          {...isolation}
          onClick={(e) => {
            stop(e);
            onCollapseAll();
          }}
        >
          Collapse all
        </button>
      </div>
    </div>
  );
}
