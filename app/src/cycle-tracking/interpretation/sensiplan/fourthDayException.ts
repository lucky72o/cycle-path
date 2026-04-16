/**
 * Sensiplan 4th-day exception rule.
 *
 * Called when the 3rd higher temp is above the coverline but did NOT
 * clear coverline + 0.2°C. If a 4th consecutive valid temp exists
 * and is strictly above the coverline, the shift is confirmed.
 *
 * The 4th temp does NOT need to clear +0.2°C.
 *
 * @param fourthTempC - The 4th consecutive higher temp in °C
 * @param coverlineC  - The coverline in °C
 * @returns true if the 4th-day exception confirms the shift
 */
export function checkFourthDayException(
  fourthTempC: number,
  coverlineC: number,
): boolean {
  return fourthTempC > coverlineC;
}
