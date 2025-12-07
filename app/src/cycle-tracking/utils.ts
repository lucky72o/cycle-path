// TemperatureUnit type - matches Prisma enum
// Will be available from '@prisma/client' after running migration
export type TemperatureUnit = 'FAHRENHEIT' | 'CELSIUS';

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

