import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * After a day is added or edited, the user returns to the page they started
 * from (chart or View Days) with `?focus=YYYY-MM-DD`, which that page scrolls
 * into view and briefly highlights.
 */
export const FOCUS_PARAM = 'focus';

/** Duration of the highlight fade; matches `.focus-flash` in Main.css. */
export const FOCUS_FLASH_MS = 1500;

/** Cycle day number of `isoDate` (the start date is day 1). */
export function dayNumberForDate(cycleStartDate: Date | string, isoDate: string): number {
  return Math.floor((new Date(isoDate).getTime() - new Date(cycleStartDate).getTime()) / 86400000) + 1;
}

/** Where the day form returns to: the chart when opened from it, else View Days. */
export function buildReturnPath(cycleId: string, returnTo: string | null, focusDate?: string): string {
  const page = returnTo === 'chart' ? 'chart' : 'days';
  return `/cycles/${cycleId}/${page}${focusDate ? `?${FOCUS_PARAM}=${focusDate}` : ''}`;
}

/**
 * Reads `?focus=` once and strips it from the address (so a refresh does not
 * replay the highlight), keeping the date for as long as the page shows the
 * same cycle.
 */
export function useReturnFocus(cycleId: string | undefined): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get(FOCUS_PARAM);
  const [focus, setFocus] = useState<{ cycleId: string | undefined; date: string } | null>(
    param ? { cycleId, date: param } : null,
  );
  useEffect(() => {
    if (!param) return;
    setFocus({ cycleId, date: param });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(FOCUS_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [param, cycleId, setSearchParams]);
  return focus && focus.cycleId === cycleId ? focus.date : null;
}
