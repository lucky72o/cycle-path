import type { CycleDayInput, InterpretationResult } from '../types';
import { detectThermalShift } from './thermalShift';
import { calculateTimeWindow } from './measurementTime';
import { generateNudges } from './nudges';

/**
 * Run the full Sensiplan interpretation engine over cycle day data.
 *
 * This is a pure function — no side effects, no persistence.
 * The caller (useInterpretation hook) handles persistence and state.
 */
export function runInterpretation(days: CycleDayInput[]): InterpretationResult {
  // Step 1: Calculate measurement time window
  const timeWindow = calculateTimeWindow(days);

  // Step 2: Detect thermal shift
  const thermalShift = detectThermalShift(days);

  // Step 3: Generate nudges
  const nudges = generateNudges(days, thermalShift, timeWindow);

  return { thermalShift, nudges, timeWindow };
}
