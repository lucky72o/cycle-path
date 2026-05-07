// TemperatureUnit type - matches Prisma enum
// Will be available from '@prisma/client' after running migration
export type TemperatureUnit = 'FAHRENHEIT' | 'CELSIUS';

/**
 * Round a number to 1 decimal place using standard half-up rounding.
 * Uses exponential notation to avoid floating-point multiplication errors.
 */
export function roundTo1Decimal(value: number): number {
  return +(Math.round(+(value + 'e1')) + 'e-1');
}

/**
 * Derive the compact label shown inside a BBT temperature node.
 *
 * Takes the already-converted display temperature (in the active unit).
 * - If the value rounded to 1 decimal ends in .0, returns the integer part (e.g. 98.0 -> "98").
 * - Otherwise returns only the tenths digit (e.g. 98.3 -> "3").
 * - Returns null for null / undefined / NaN (no label rendered).
 */
export function getTempNodeLabel(displayTemp: number | null | undefined): string | null {
  if (displayTemp == null || isNaN(displayTemp)) return null;
  const rounded = roundTo1Decimal(displayTemp);
  const tenths = rounded % 1;
  if (Math.abs(tenths) < 0.01) {
    return Math.round(rounded).toString();
  }
  return Math.round(Math.abs(tenths) * 10).toString();
}

/**
 * Convert Fahrenheit to Celsius
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9 / 5) + 32;
}

/**
 * Format temperature with proper decimal places and unit
 */
export function formatTemperature(tempInFahrenheit: number, unit: TemperatureUnit): string {
  if (unit === 'CELSIUS') {
    const celsius = fahrenheitToCelsius(tempInFahrenheit);
    return `${celsius.toFixed(2)}°C`;
  }
  return `${tempInFahrenheit.toFixed(2)}°F`;
}

/**
 * Convert temperature to Fahrenheit for storage (if user entered in Celsius)
 */
export function convertToFahrenheitForStorage(temp: number, inputUnit: TemperatureUnit): number {
  if (inputUnit === 'CELSIUS') {
    return celsiusToFahrenheit(temp);
  }
  return temp;
}

/**
 * Convert a stored canonical-Celsius temperature to the user's preferred display unit.
 * Returns a raw number (no rounding) suitable for plotting, interpolation, and
 * positioning math. For human-readable strings with unit suffix, use formatTemperature.
 */
export function toDisplayTemperature(
  celsiusValue: number,
  unit: TemperatureUnit
): number;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null;
export function toDisplayTemperature(
  celsiusValue: number | null | undefined,
  unit: TemperatureUnit
): number | null {
  if (celsiusValue == null) return null;
  return unit === 'CELSIUS' ? celsiusValue : celsiusToFahrenheit(celsiusValue);
}

/**
 * Get day of week name from date
 */
export function getDayOfWeek(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Format a Date as `YYYY-MM-DD` using its **local-calendar** fields (not UTC).
 *
 * Use this when the date will be sent to a server that expects an ISO date
 * string but the value originated from local-time arithmetic (e.g. `setDate`,
 * `getDate`). `Date.prototype.toISOString` converts to UTC and can drift to
 * the previous/next day for any local timestamp not at UTC midnight — most
 * dangerous across DST boundaries where the offset changes mid-cycle.
 */
export function formatLocalIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolve the ISO `YYYY-MM-DD` date to send to `createOrUpdateCycleDay` when
 * editing a chart cell — handles two distinct cases:
 *
 *   1. The cell already has a `CycleDay` record. We must preserve the stored
 *      UTC date verbatim. Going through local-time formatting would shift the
 *      date by one in any TZ west of UTC, and the server's update path
 *      rewrites `date`/`dayOfWeek` even on a note-only save, corrupting the
 *      row's calendar position.
 *
 *   2. The cell is a padded chart day with no stored record. We compute the
 *      date from `cycleStart` via local-calendar arithmetic and format it
 *      with local fields, matching the user's intended calendar day in the
 *      chart they're looking at.
 */
export function resolveCycleDayIsoDate(
  cycleStart: Date,
  dayNumber: number,
  existingDate: Date | string | null | undefined,
): string {
  if (existingDate) {
    return new Date(existingDate).toISOString().split('T')[0];
  }
  const d = new Date(cycleStart);
  d.setDate(cycleStart.getDate() + (dayNumber - 1));
  return formatLocalIsoDate(d);
}

/**
 * Format date for display as DD MMM YYYY (e.g., "24 Oct 2025")
 */
export function formatDateDDMMMYYYY(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format date for display (e.g., "Oct 24 2025")
 */
export function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

/**
 * Format date for display with full month name (e.g., "October 24, 2025")
 */
export function formatDateLong(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date from input field (YYYY-MM-DD)
 */
export function parseDateFromInput(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}

/**
 * Returns the day count for a cycle.
 * Active cycles: count of recorded entries (grows with each new recording).
 * Past cycles: max day number (total span of the cycle).
 */
export function getCycleDayCount(cycle: { days: { dayNumber: number }[]; isActive: boolean }): number {
  if (cycle.days.length === 0) return 0;
  if (cycle.isActive) return cycle.days.length;
  return cycle.days[cycle.days.length - 1].dayNumber;
}

/**
 * Convert full day name to abbreviation (M, T, W, Th, F, Sat, Sun)
 */
export function getDayOfWeekAbbreviation(dayName: string): string {
  const abbreviations: Record<string, string> = {
    'Monday': 'M',
    'Tuesday': 'T',
    'Wednesday': 'W',
    'Thursday': 'Th',
    'Friday': 'F',
    'Saturday': 'Sat',
    'Sunday': 'Sun'
  };
  return abbreviations[dayName] || dayName;
}

