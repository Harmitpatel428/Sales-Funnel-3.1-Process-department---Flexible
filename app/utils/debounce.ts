/**
 * Debounce utility for search inputs and callbacks
 * 
 * This module provides debouncing functionality to avoid excessive function calls
 * during rapid user interactions like typing in search inputs.
 */

import { useState, useEffect, useRef, useCallback, DependencyList } from 'react';

/**
 * Generic debounce function
 * Delays the execution of a function until after a specified delay
 * 
 * @example
 * const debouncedSearch = debounce((value: string) => {
 *   console.log('Searching for:', value);
 * }, 300);
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;

  return function executedFunction(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * React hook for debouncing state values (useful for search inputs)
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebouncedValue(searchTerm, 300);
 * 
 * // Use debouncedSearch for filtering, while searchTerm updates immediately
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear existing timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * React hook for debouncing callbacks
 * 
 * @example
 * const debouncedHandler = useDebouncedCallback(
 *   (value: string) => {
 *     setFilters({ ...filters, search: value });
 *   },
 *   300,
 *   [filters]
 * );
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList
): (...args: Parameters<T>) => void {
  const timerRef = useRef<number | null>(null);

   
  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      // Clear existing timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      // Set new timer
      timerRef.current = window.setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay, ...deps]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

