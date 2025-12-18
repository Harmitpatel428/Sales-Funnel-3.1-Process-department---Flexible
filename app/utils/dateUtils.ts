import { debugLogger, DebugCategory } from './debugLogger';

/**
 * Centralized date utilities for DD-MM-YYYY format handling
 * Provides parsing, formatting, validation, and comparison functions
 * with UTC normalization to eliminate timezone bugs
 */

// Core Parsing & Formatting

/**
 * Parse DD-MM-YYYY format string to Date object with full validation
 * @param dateString - Date string in DD-MM-YYYY format
 * @returns Date object or null if invalid
 */
export function parseDateFromDDMMYYYY(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const validation = validateDateString(dateString);
  if (!validation.valid) {
    debugLogger.warn(DebugCategory.VALIDATION, 'Invalid date string:', { dateString, error: validation.error });
    return null;
  }

  const [day, month, year] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  // Verify the date is valid (handles edge cases like Feb 30)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    debugLogger.warn(DebugCategory.VALIDATION, 'Invalid calendar date:', dateString);
    return null;
  }

  return date;
}

/**
 * Convert Date object or ISO string to DD-MM-YYYY format
 * @param date - Date object, ISO string, or null/undefined
 * @returns DD-MM-YYYY formatted string or empty string if invalid
 */
export function formatDateToDDMMYYYY(date: Date | string | null | undefined): string {
  if (!date) {
    return '';
  }

  // If already in DD-MM-YYYY format, return as-is
  if (typeof date === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(date)) {
    return date;
  }

  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    // Use UTC getters to avoid timezone shifts when parsing ISO strings
    const day = dateObj.getUTCDate().toString().padStart(2, '0');
    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getUTCFullYear().toString();
    return `${day}-${month}-${year}`;
  } else {
    dateObj = date;
    // For Date objects, use local date components to match typical Date construction behavior
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear().toString();
    return `${day}-${month}-${year}`;
  }
}

/**
 * Get current date in DD-MM-YYYY format
 * @returns Current date as DD-MM-YYYY string
 */
export function getTodayDDMMYYYY(): string {
  return formatDateToDDMMYYYY(new Date());
}

// Date Validation

/**
 * Check if string matches DD-MM-YYYY format and represents a valid calendar date
 * @param dateString - Date string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDDMMYYYY(dateString: string): boolean {
  return validateDateString(dateString).valid;
}

/**
 * Comprehensive date validation with user-friendly error messages
 * @param dateString - Date string to validate
 * @returns Validation result with error message if invalid
 */
export function validateDateString(dateString: string): { valid: boolean; error?: string } {
  if (!dateString || typeof dateString !== 'string') {
    return { valid: false, error: 'Date is required' };
  }

  // Check format: DD-MM-YYYY
  const formatRegex = /^\d{2}-\d{2}-\d{4}$/;
  if (!formatRegex.test(dateString)) {
    return { valid: false, error: 'Invalid format. Please use DD-MM-YYYY (e.g., 01-01-2024)' };
  }

  const parts = dateString.split('-');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  // Validate year range
  if (year < 1900 || year > 2100) {
    return { valid: false, error: `Invalid year: ${year}. Year must be between 1900 and 2100` };
  }

  // Validate month range
  if (month < 1 || month > 12) {
    return { valid: false, error: `Invalid month: ${month}. Month must be between 01 and 12` };
  }

  // Validate day against actual month length
  const daysInMonth = getDaysInMonth(month, year);

  if (day < 1) {
    return { valid: false, error: `Invalid day: ${day}. Day must be between 01 and 31` };
  }

  if (day > daysInMonth) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return { 
      valid: false, 
      error: `Invalid date: ${monthNames[month - 1]} ${day} does not exist. ${monthNames[month - 1]} has ${daysInMonth} days` 
    };
  }

  return { valid: true };
}

/**
 * Check if year is a leap year
 * @param year - Year to check
 * @returns true if leap year, false otherwise
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Get number of days in a month for a given year
 * @param month - Month (1-12)
 * @param year - Year
 * @returns Number of days in the month
 */
export function getDaysInMonth(month: number, year: number): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  
  return daysInMonth[month - 1];
}

// UTC Normalization

/**
 * Set hours/minutes/seconds/milliseconds to 0 in UTC timezone
 * @param date - Date to normalize
 * @returns Date normalized to UTC midnight
 */
export function normalizeToUTCMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Parse DD-MM-YYYY and normalize to UTC midnight in one step
 * @param dateString - Date string in DD-MM-YYYY format
 * @returns Date normalized to UTC midnight or null if invalid
 */
export function parseAndNormalizeDate(dateString: string): Date | null {
  if (!validateDateString(dateString).valid) {
    return null;
  }

  const [day, month, year] = dateString.split('-').map(Number);
  // Create a Date at UTC midnight for the given date string
  return new Date(Date.UTC(year, month - 1, day));
}

// Date Comparison Utilities

/**
 * Compare two dates at UTC midnight
 * @param date1 - First date (Date object or DD-MM-YYYY string)
 * @param date2 - Second date (Date object or DD-MM-YYYY string)
 * @returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDatesUTC(date1: Date | string, date2: Date | string): number {
  // Treat null/undefined inputs as incomparable
  if (date1 == null || date2 == null) {
    return 0;
  }

  const d1 = typeof date1 === 'string' ? parseAndNormalizeDate(date1) : normalizeToUTCMidnight(date1 as Date);
  const d2 = typeof date2 === 'string' ? parseAndNormalizeDate(date2) : normalizeToUTCMidnight(date2 as Date);
  
  if (!d1 || !d2) {
    return 0;
  }
  
  const diff = d1.getTime() - d2.getTime();
  return diff;
}

/**
 * Check if two dates are the same day (UTC)
 * @param date1 - First date (Date object or DD-MM-YYYY string)
 * @param date2 - Second date (Date object or DD-MM-YYYY string)
 * @returns true if same day, false otherwise
 */
export function isDateEqual(date1: Date | string, date2: Date | string): boolean {
  return compareDatesUTC(date1, date2) === 0;
}

/**
 * Check if date1 is before date2 (UTC)
 * @param date1 - First date (Date object or DD-MM-YYYY string)
 * @param date2 - Second date (Date object or DD-MM-YYYY string)
 * @returns true if date1 < date2, false otherwise
 */
export function isDateBefore(date1: Date | string, date2: Date | string): boolean {
  return compareDatesUTC(date1, date2) < 0;
}

/**
 * Check if date1 is after date2 (UTC)
 * @param date1 - First date (Date object or DD-MM-YYYY string)
 * @param date2 - Second date (Date object or DD-MM-YYYY string)
 * @returns true if date1 > date2, false otherwise
 */
export function isDateAfter(date1: Date | string, date2: Date | string): boolean {
  return compareDatesUTC(date1, date2) > 0;
}

/**
 * Check if date is within range (both boundaries inclusive)
 * @param date - Date to check (Date object or DD-MM-YYYY string)
 * @param start - Start date (Date object or DD-MM-YYYY string)
 * @param end - End date (Date object or DD-MM-YYYY string)
 * @returns true if date is within range, false otherwise
 */
export function isDateBetweenInclusive(date: Date | string, start: Date | string, end: Date | string): boolean {
  const dateTime = typeof date === 'string' ? parseAndNormalizeDate(date) : normalizeToUTCMidnight(date);
  const startTime = typeof start === 'string' ? parseAndNormalizeDate(start) : normalizeToUTCMidnight(start);
  const endTime = typeof end === 'string' ? parseAndNormalizeDate(end) : normalizeToUTCMidnight(end);
  
  if (!dateTime || !startTime || !endTime) {
    return false;
  }
  
  return dateTime.getTime() >= startTime.getTime() && dateTime.getTime() <= endTime.getTime();
}

// Date Range Utilities

/**
 * Parse and validate a date range with inclusive boundaries
 * @param start - Start date string in DD-MM-YYYY format
 * @param end - End date string in DD-MM-YYYY format
 * @returns Parsed dates and validation result
 */
export function getDateRangeInclusive(start: string, end: string): { 
  startDate: Date | null; 
  endDate: Date | null; 
  valid: boolean; 
  error?: string 
} {
  const startDate = parseAndNormalizeDate(start);
  const endDate = parseAndNormalizeDate(end);
  
  if (!startDate) {
    return { startDate: null, endDate: null, valid: false, error: `Invalid start date: ${start}` };
  }
  
  if (!endDate) {
    return { startDate: null, endDate: null, valid: false, error: `Invalid end date: ${end}` };
  }
  
  if (startDate.getTime() > endDate.getTime()) {
    return { startDate: null, endDate: null, valid: false, error: 'Start date cannot be after end date' };
  }
  
  return { startDate, endDate, valid: true };
}

/**
 * Check if date is within N days from today
 * @param dateString - Date string in DD-MM-YYYY format
 * @param days - Number of days
 * @returns true if within range, false otherwise
 */
export function isWithinDaysFromNow(dateString: string, days: number): boolean {
  const date = parseAndNormalizeDate(dateString);
  if (!date) {
    return false;
  }
  
  const today = normalizeToUTCMidnight(new Date());
  const futureDate = new Date(today);
  futureDate.setUTCDate(futureDate.getUTCDate() + days);
  
  return date.getTime() >= today.getTime() && date.getTime() <= futureDate.getTime();
}

/**
 * Get number of days until a date (negative if past)
 * @param dateString - Date string in DD-MM-YYYY format
 * @returns Number of days until date
 */
export function getDaysUntil(dateString: string): number {
  const date = parseAndNormalizeDate(dateString);
  if (!date) {
    return 0;
  }
  
  const today = normalizeToUTCMidnight(new Date());
  const diffTime = date.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

