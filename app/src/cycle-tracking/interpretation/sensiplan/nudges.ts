import type { CycleDayInput, ThermalShiftResult, Nudge, TimeWindowResult } from '../types';
import { isWithinWindow } from './measurementTime';

const SPIKE_THRESHOLD_C = 0.2;
const NEIGHBOR_RANGE = 2; // up to 2 temps on each side

/**
 * Generate data quality nudges for a cycle.
 *
 * [CyclePath Enhancement]
 * - Pre-shift: suspicious outliers (≥ 0.2°C above neighbors)
 * - Post-shift: temps below coverline without disturbance factors
 */
export function generateNudges(
  days: CycleDayInput[],
  shiftResult: ThermalShiftResult,
  timeWindow: TimeWindowResult,
): Nudge[] {
  const nudges: Nudge[] = [];
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const shiftDay = shiftResult.status !== 'none' ? shiftResult.shiftDay : null;

  // Pre-shift outlier detection
  for (const d of sorted) {
    if (d.bbt === null || d.excludeFromInterpretation) continue;
    // Only pre-shift days (before shift day, or all days if no shift)
    if (shiftDay !== null && d.dayNumber >= shiftDay) continue;

    const tempC = d.bbt;
    const neighbors = getValidNeighborTemps(sorted, d.dayNumber, NEIGHBOR_RANGE);
    if (neighbors.length === 0) continue;

    const avgNeighbor = neighbors.reduce((sum, t) => sum + t, 0) / neighbors.length;
    const spike = tempC - avgNeighbor;

    if (spike >= SPIKE_THRESHOLD_C) {
      let message = `Day ${d.dayNumber} temperature appears unusually high compared to neighboring days.`;

      // Check if outside time window
      if (timeWindow.hasWindow && d.bbtTime) {
        const segment = timeWindow.segments.find(
          (s) => d.dayNumber >= s.fromDay && d.dayNumber <= s.toDay
        );
        if (segment && !isWithinWindow(d.bbtTime, segment.window)) {
          message += ` It was also taken outside your usual measurement time window.`;
        }
      }

      message += ` Was this temperature affected by a disturbance?`;

      nudges.push({
        day: d.dayNumber,
        type: 'pre_shift_outlier',
        message,
        resolved: false,
      });
    }
  }

  // Post-shift dip detection
  if (shiftResult.status === 'confirmed') {
    const coverline = shiftResult.coverlineTemp;
    const lastConfirmDay = Math.max(...shiftResult.confirmingDays);

    for (const d of sorted) {
      if (d.bbt === null || d.excludeFromInterpretation) continue;
      if (d.dayNumber <= lastConfirmDay) continue;

      const tempC = d.bbt;
      if (tempC < coverline && d.disturbanceFactors.length === 0) {
        nudges.push({
          day: d.dayNumber,
          type: 'post_shift_dip',
          message:
            `Day ${d.dayNumber} temperature dropped below your coverline with no disturbance recorded. ` +
            `Was it affected by a disturbance?`,
          resolved: false,
        });
      }
    }
  }

  return nudges;
}

/**
 * Get valid (non-excluded, non-null) neighbor temps in °C,
 * up to `range` on each side, skipping excluded days.
 */
function getValidNeighborTemps(
  sorted: CycleDayInput[],
  dayNumber: number,
  range: number,
): number[] {
  const temps: number[] = [];

  // Scan backward
  let found = 0;
  for (let i = sorted.findIndex((d) => d.dayNumber === dayNumber) - 1; i >= 0 && found < range; i--) {
    const d = sorted[i];
    if (d.bbt !== null && !d.excludeFromInterpretation) {
      temps.push(d.bbt);
      found++;
    }
  }

  // Scan forward
  found = 0;
  for (let i = sorted.findIndex((d) => d.dayNumber === dayNumber) + 1; i < sorted.length && found < range; i++) {
    const d = sorted[i];
    if (d.bbt !== null && !d.excludeFromInterpretation) {
      temps.push(d.bbt);
      found++;
    }
  }

  return temps;
}
