import { useState } from 'react';
import { Link } from 'react-router-dom';

type PreviousCycleSummary = {
  id: string;
  cycleNumber: number;
  isMarked: boolean;
  hasConfirmedShift: boolean;
};

type Props = {
  previousCycle: PreviousCycleSummary | null;
};

const bannerKey = (id: string) => `anovulatory-banner-${id}`;

export function CrossCycleAnovulatoryBanner({ previousCycle }: Props) {
  // `dismissVersion` bumps on dismiss to force a re-render after we update
  // sessionStorage. Reading sessionStorage directly below each render keeps
  // the check current with previousCycle.id (no stale initial state).
  const [, setDismissVersion] = useState(0);

  if (!previousCycle) return null;
  if (previousCycle.isMarked) return null;
  if (previousCycle.hasConfirmedShift) return null;

  // Fresh read per render — never stale for the current previousCycle.id
  const isDismissed = sessionStorage.getItem(bannerKey(previousCycle.id)) === 'true';
  if (isDismissed) return null;

  const onDismiss = () => {
    sessionStorage.setItem(bannerKey(previousCycle.id), 'true');
    setDismissVersion((v) => v + 1);
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mb-4">
      <p className="text-sm text-amber-900 mb-2">
        Your previous cycle (Cycle {previousCycle.cycleNumber}) ended without a confirmed
        thermal shift. If ovulation didn&apos;t occur, consider marking it as anovulatory.
      </p>
      <div className="flex gap-2">
        <Link
          to={`/cycles/${previousCycle.id}/chart`}
          className="text-sm text-amber-900 underline"
        >
          Review Cycle {previousCycle.cycleNumber}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm text-amber-900 underline"
        >
          Dismiss for Now
        </button>
      </div>
    </div>
  );
}
