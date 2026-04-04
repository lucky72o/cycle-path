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
 * Get day of week name from date
 */
export function getDayOfWeek(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
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

