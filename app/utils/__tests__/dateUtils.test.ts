import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseDateFromDDMMYYYY,
  formatDateToDDMMYYYY,
  getTodayDDMMYYYY,
  isValidDDMMYYYY,
  validateDateString,
  isLeapYear,
  getDaysInMonth,
  normalizeToUTCMidnight,
  parseAndNormalizeDate,
  compareDatesUTC,
  isDateEqual,
  isDateBefore,
  isDateAfter,
  isDateBetweenInclusive,
  getDateRangeInclusive,
  isWithinDaysFromNow,
  getDaysUntil
} from '../dateUtils';

describe('dateUtils', () => {
  beforeEach(() => {
    // Mock Date.now() to return a consistent date for testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseDateFromDDMMYYYY', () => {
    it('should parse valid DD-MM-YYYY dates', () => {
      expect(parseDateFromDDMMYYYY('01-01-2024')).toEqual(new Date(2024, 0, 1));
      expect(parseDateFromDDMMYYYY('31-12-2023')).toEqual(new Date(2023, 11, 31));
      expect(parseDateFromDDMMYYYY('29-02-2024')).toEqual(new Date(2024, 1, 29)); // Leap year
    });

    it('should return null for invalid formats', () => {
      expect(parseDateFromDDMMYYYY('2024-01-01')).toBeNull();
      expect(parseDateFromDDMMYYYY('1-1-2024')).toBeNull();
      expect(parseDateFromDDMMYYYY('01/01/2024')).toBeNull();
      expect(parseDateFromDDMMYYYY('')).toBeNull();
      expect(parseDateFromDDMMYYYY('invalid')).toBeNull();
    });

    it('should return null for invalid dates', () => {
      expect(parseDateFromDDMMYYYY('32-01-2024')).toBeNull();
      expect(parseDateFromDDMMYYYY('01-13-2024')).toBeNull();
      expect(parseDateFromDDMMYYYY('30-02-2024')).toBeNull();
      expect(parseDateFromDDMMYYYY('29-02-2023')).toBeNull(); // Non-leap year
      expect(parseDateFromDDMMYYYY('00-00-0000')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(parseDateFromDDMMYYYY(null as any)).toBeNull();
      expect(parseDateFromDDMMYYYY(undefined as any)).toBeNull();
      expect(parseDateFromDDMMYYYY('')).toBeNull();
    });
  });

  describe('formatDateToDDMMYYYY', () => {
    it('should format Date objects to DD-MM-YYYY', () => {
      expect(formatDateToDDMMYYYY(new Date(2024, 0, 1))).toBe('01-01-2024');
      expect(formatDateToDDMMYYYY(new Date(2023, 11, 31))).toBe('31-12-2023');
      expect(formatDateToDDMMYYYY(new Date(2024, 1, 29))).toBe('29-02-2024');
    });

    it('should format ISO strings to DD-MM-YYYY', () => {
      expect(formatDateToDDMMYYYY('2024-01-01T00:00:00.000Z')).toBe('01-01-2024');
      expect(formatDateToDDMMYYYY('2023-12-31T23:59:59.999Z')).toBe('31-12-2023');
    });

    it('should handle invalid inputs gracefully', () => {
      expect(formatDateToDDMMYYYY(null)).toBe('');
      expect(formatDateToDDMMYYYY(undefined)).toBe('');
      expect(formatDateToDDMMYYYY('')).toBe('');
      expect(formatDateToDDMMYYYY('invalid')).toBe('');
    });

    it('should return already formatted strings as-is', () => {
      expect(formatDateToDDMMYYYY('01-01-2024')).toBe('01-01-2024');
    });
  });

  describe('getTodayDDMMYYYY', () => {
    it('should return current date in DD-MM-YYYY format', () => {
      const result = getTodayDDMMYYYY();
      expect(result).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      expect(result).toBe('15-01-2024'); // Based on mocked date
    });
  });

  describe('isValidDDMMYYYY', () => {
    it('should return true for valid dates', () => {
      expect(isValidDDMMYYYY('01-01-2024')).toBe(true);
      expect(isValidDDMMYYYY('29-02-2024')).toBe(true); // Leap year
      expect(isValidDDMMYYYY('31-12-2023')).toBe(true);
    });

    it('should return false for invalid dates', () => {
      expect(isValidDDMMYYYY('32-01-2024')).toBe(false);
      expect(isValidDDMMYYYY('01-13-2024')).toBe(false);
      expect(isValidDDMMYYYY('30-02-2024')).toBe(false);
      expect(isValidDDMMYYYY('29-02-2023')).toBe(false); // Non-leap year
      expect(isValidDDMMYYYY('2024-01-01')).toBe(false);
      expect(isValidDDMMYYYY('')).toBe(false);
    });
  });

  describe('validateDateString', () => {
    it('should return valid for correct dates', () => {
      expect(validateDateString('01-01-2024')).toEqual({ valid: true });
      expect(validateDateString('29-02-2024')).toEqual({ valid: true });
    });

    it('should return detailed error messages for invalid dates', () => {
      expect(validateDateString('32-01-2024')).toEqual({
        valid: false,
        error: 'Invalid date: January 32 does not exist. January has 31 days'
      });
      expect(validateDateString('01-13-2024')).toEqual({
        valid: false,
        error: 'Invalid month: 13. Month must be between 01 and 12'
      });
      expect(validateDateString('30-02-2024')).toEqual({
        valid: false,
        error: 'Invalid date: February 30 does not exist. February has 29 days'
      });
      expect(validateDateString('29-02-2023')).toEqual({
        valid: false,
        error: 'Invalid date: February 29 does not exist. February has 28 days'
      });
    });

    it('should validate year range', () => {
      expect(validateDateString('01-01-1899')).toEqual({
        valid: false,
        error: 'Invalid year: 1899. Year must be between 1900 and 2100'
      });
      expect(validateDateString('01-01-2101')).toEqual({
        valid: false,
        error: 'Invalid year: 2101. Year must be between 1900 and 2100'
      });
    });

    it('should validate format', () => {
      expect(validateDateString('2024-01-01')).toEqual({
        valid: false,
        error: 'Invalid format. Please use DD-MM-YYYY (e.g., 01-01-2024)'
      });
      expect(validateDateString('1-1-2024')).toEqual({
        valid: false,
        error: 'Invalid format. Please use DD-MM-YYYY (e.g., 01-01-2024)'
      });
    });

    it('should handle empty/null inputs', () => {
      expect(validateDateString('')).toEqual({
        valid: false,
        error: 'Date is required'
      });
      expect(validateDateString(null as any)).toEqual({
        valid: false,
        error: 'Date is required'
      });
    });
  });

  describe('isLeapYear', () => {
    it('should correctly identify leap years', () => {
      expect(isLeapYear(2024)).toBe(true); // Divisible by 4
      expect(isLeapYear(2000)).toBe(true); // Divisible by 400
      expect(isLeapYear(2023)).toBe(false); // Not divisible by 4
      expect(isLeapYear(1900)).toBe(false); // Divisible by 100 but not 400
    });
  });

  describe('getDaysInMonth', () => {
    it('should return correct days for each month', () => {
      expect(getDaysInMonth(1, 2024)).toBe(31); // January
      expect(getDaysInMonth(2, 2024)).toBe(29); // February (leap year)
      expect(getDaysInMonth(2, 2023)).toBe(28); // February (non-leap year)
      expect(getDaysInMonth(4, 2024)).toBe(30); // April
      expect(getDaysInMonth(12, 2024)).toBe(31); // December
    });
  });

  describe('normalizeToUTCMidnight', () => {
    it('should set hours, minutes, seconds, and milliseconds to 0 in UTC', () => {
      const date = new Date('2024-01-15T10:30:45.123Z');
      const normalized = normalizeToUTCMidnight(date);
      
      expect(normalized.getUTCHours()).toBe(0);
      expect(normalized.getUTCMinutes()).toBe(0);
      expect(normalized.getUTCSeconds()).toBe(0);
      expect(normalized.getUTCMilliseconds()).toBe(0);
      expect(normalized.getUTCDate()).toBe(15);
      expect(normalized.getUTCMonth()).toBe(0);
      expect(normalized.getUTCFullYear()).toBe(2024);
    });
  });

  describe('parseAndNormalizeDate', () => {
    it('should parse and normalize dates to UTC midnight', () => {
      const result = parseAndNormalizeDate('15-01-2024');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(0);
      expect(result!.getUTCMinutes()).toBe(0);
      expect(result!.getUTCSeconds()).toBe(0);
      expect(result!.getUTCMilliseconds()).toBe(0);
    });

    it('should return null for invalid dates', () => {
      expect(parseAndNormalizeDate('32-01-2024')).toBeNull();
      expect(parseAndNormalizeDate('invalid')).toBeNull();
    });
  });

  describe('compareDatesUTC', () => {
    it('should compare dates correctly', () => {
      expect(compareDatesUTC('01-01-2024', '02-01-2024')).toBeLessThan(0);
      expect(compareDatesUTC('02-01-2024', '01-01-2024')).toBeGreaterThan(0);
      expect(compareDatesUTC('01-01-2024', '01-01-2024')).toBe(0);
    });

    it('should handle Date objects', () => {
      const date1 = new Date(2024, 0, 1);
      const date2 = new Date(2024, 0, 2);
      expect(compareDatesUTC(date1, date2)).toBeLessThan(0);
    });

    it('should handle null dates', () => {
      expect(compareDatesUTC(null as any, '01-01-2024')).toBe(0);
      expect(compareDatesUTC('01-01-2024', null as any)).toBe(0);
    });
  });

  describe('isDateEqual', () => {
    it('should correctly identify equal dates', () => {
      expect(isDateEqual('01-01-2024', '01-01-2024')).toBe(true);
      expect(isDateEqual('01-01-2024', '02-01-2024')).toBe(false);
    });

    it('should handle different timezones correctly', () => {
      const date1 = new Date('2024-01-01T00:00:00.000Z');
      const date2 = new Date('2024-01-01T23:59:59.999Z');
      expect(isDateEqual(date1, date2)).toBe(true); // Same day in UTC
    });
  });

  describe('isDateBefore', () => {
    it('should correctly identify date ordering', () => {
      expect(isDateBefore('01-01-2024', '02-01-2024')).toBe(true);
      expect(isDateBefore('02-01-2024', '01-01-2024')).toBe(false);
      expect(isDateBefore('01-01-2024', '01-01-2024')).toBe(false);
    });
  });

  describe('isDateAfter', () => {
    it('should correctly identify date ordering', () => {
      expect(isDateAfter('02-01-2024', '01-01-2024')).toBe(true);
      expect(isDateAfter('01-01-2024', '02-01-2024')).toBe(false);
      expect(isDateAfter('01-01-2024', '01-01-2024')).toBe(false);
    });
  });

  describe('isDateBetweenInclusive', () => {
    it('should correctly identify dates within range', () => {
      expect(isDateBetweenInclusive('15-01-2024', '01-01-2024', '31-01-2024')).toBe(true);
      expect(isDateBetweenInclusive('01-01-2024', '01-01-2024', '31-01-2024')).toBe(true); // Start boundary
      expect(isDateBetweenInclusive('31-01-2024', '01-01-2024', '31-01-2024')).toBe(true); // End boundary
      expect(isDateBetweenInclusive('01-02-2024', '01-01-2024', '31-01-2024')).toBe(false); // Outside range
    });

    it('should handle Date objects', () => {
      const date = new Date(2024, 0, 15);
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 0, 31);
      expect(isDateBetweenInclusive(date, start, end)).toBe(true);
    });
  });

  describe('getDateRangeInclusive', () => {
    it('should parse and validate date ranges', () => {
      const result = getDateRangeInclusive('01-01-2024', '31-01-2024');
      expect(result.valid).toBe(true);
      expect(result.startDate).not.toBeNull();
      expect(result.endDate).not.toBeNull();
    });

    it('should validate start date', () => {
      const result = getDateRangeInclusive('32-01-2024', '31-01-2024');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid start date');
    });

    it('should validate end date', () => {
      const result = getDateRangeInclusive('01-01-2024', '32-01-2024');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid end date');
    });

    it('should validate date order', () => {
      const result = getDateRangeInclusive('31-01-2024', '01-01-2024');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Start date cannot be after end date');
    });
  });

  describe('isWithinDaysFromNow', () => {
    it('should correctly identify dates within range', () => {
      expect(isWithinDaysFromNow('15-01-2024', 0)).toBe(true); // Today
      expect(isWithinDaysFromNow('16-01-2024', 1)).toBe(true); // Tomorrow
      expect(isWithinDaysFromNow('22-01-2024', 7)).toBe(true); // 7 days from now
      expect(isWithinDaysFromNow('23-01-2024', 7)).toBe(false); // 8 days from now
    });

    it('should handle past dates', () => {
      expect(isWithinDaysFromNow('14-01-2024', 7)).toBe(false); // Yesterday
    });

    it('should handle invalid dates', () => {
      expect(isWithinDaysFromNow('32-01-2024', 7)).toBe(false);
    });
  });

  describe('getDaysUntil', () => {
    it('should calculate days until future dates', () => {
      expect(getDaysUntil('16-01-2024')).toBe(1); // Tomorrow
      expect(getDaysUntil('22-01-2024')).toBe(7); // 7 days from now
    });

    it('should calculate negative days for past dates', () => {
      expect(getDaysUntil('14-01-2024')).toBe(-1); // Yesterday
    });

    it('should return 0 for today', () => {
      expect(getDaysUntil('15-01-2024')).toBe(0); // Today
    });

    it('should handle invalid dates', () => {
      expect(getDaysUntil('32-01-2024')).toBe(0);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle leap year edge cases', () => {
      expect(validateDateString('29-02-2000')).toEqual({ valid: true }); // Leap year
      expect(validateDateString('29-02-1900')).toEqual({
        valid: false,
        error: 'Invalid date: February 29 does not exist. February has 28 days'
      }); // Not a leap year
    });

    it('should handle month boundary cases', () => {
      expect(validateDateString('31-04-2024')).toEqual({
        valid: false,
        error: 'Invalid date: April 31 does not exist. April has 30 days'
      });
      expect(validateDateString('30-02-2024')).toEqual({
        valid: false,
        error: 'Invalid date: February 30 does not exist. February has 29 days'
      });
    });

    it('should handle year boundary cases', () => {
      expect(validateDateString('01-01-1900')).toEqual({ valid: true });
      expect(validateDateString('31-12-2100')).toEqual({ valid: true });
      expect(validateDateString('01-01-1899')).toEqual({
        valid: false,
        error: 'Invalid year: 1899. Year must be between 1900 and 2100'
      });
      expect(validateDateString('31-12-2101')).toEqual({
        valid: false,
        error: 'Invalid year: 2101. Year must be between 1900 and 2100'
      });
    });
  });
});

