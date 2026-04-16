import type { CycleDayInput, PostShiftMonitoring, DipBelow, Nudge } from '../types';
import { fahrenheitToCelsius } from '../../utils';

const FALSE_RISE_THRESHOLD = 3;

/**
 * Post-shift monitoring — false rise detection.
 *
 * [CyclePath Enhancement]
 * Runs against the ACTIVE interpretation values (coverline from engine
 * if CONFIRMED, from userOverrides if ADJUSTED).
 *
 * @param days           All cycle days
 * @param shiftDay       The active shift day (engine or user-adjusted)
 * @param coverlineC     The active coverline in °C
 * @param lastConfirmDay The last confirming temp day number
 * @param resolvedNudges Previously resolved nudges (to check explained dips)
 * @param previousWarning Previous falseRiseWarning state (to preserve 'dismissed')
 */
export function monitorPostShift(
  days: CycleDayInput[],
  shiftDay: number,
  coverlineC: number,
  lastConfirmDay: number,
  resolvedNudges: Nudge[],
  previousWarning?: 'active' | 'dismissed' | null,
): PostShiftMonitoring {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const postShiftDays = sorted.filter(
    (d) => d.dayNumber > lastConfirmDay && d.bbt !== null
  );

  const resolvedMap = new Map(
    resolvedNudges
      .filter((n) => n.type === 'post_shift_dip' && n.resolved)
      .map((n) => [n.day, n.response])
  );

  const dipsBelow: DipBelow[] = [];
  let consecutiveUnexplained = 0;
  let maxConsecutiveUnexplained = 0;

  for (const d of postShiftDays) {
    const tempC = fahrenheitToCelsius(d.bbt!);

    if (tempC >= coverlineC) {
      // Above coverline — reset consecutive count
      consecutiveUnexplained = 0;
      continue;
    }

    // Below coverline — check if explained
    const hasDisturbance = d.disturbanceFactors.length > 0;
    const nudgeResponse = resolvedMap.get(d.dayNumber);
    const explained = hasDisturbance || nudgeResponse === 'yes_disturbed';

    dipsBelow.push({
      day: d.dayNumber,
      temp: tempC,
      explained,
      factors: d.disturbanceFactors,
    });

    if (explained) {
      // Explained dip breaks the consecutive chain
      consecutiveUnexplained = 0;
    } else {
      consecutiveUnexplained++;
      maxConsecutiveUnexplained = Math.max(maxConsecutiveUnexplained, consecutiveUnexplained);
    }
  }

  // Determine false rise warning state
  let falseRiseWarning: 'active' | 'dismissed' | null = null;

  if (previousWarning === 'dismissed') {
    falseRiseWarning = 'dismissed';
  } else if (maxConsecutiveUnexplained >= FALSE_RISE_THRESHOLD) {
    falseRiseWarning = 'active';
  }

  return {
    isActive: true,
    falseRiseWarning,
    daysMonitored: postShiftDays.length,
    dipsBelow,
    consecutiveUnexplainedDips: consecutiveUnexplained,
  };
}
