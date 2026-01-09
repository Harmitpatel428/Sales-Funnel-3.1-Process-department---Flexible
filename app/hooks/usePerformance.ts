'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function usePerformance() {
  const renderStartTime = useRef<number>(0);
  const renderCount = useRef<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
    renderCount.current += 1;
  });

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;

    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development' && renderTime > 16) {
      console.warn(`Slow render detected: ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
    }
  });

  return {
    renderCount: renderCount.current,
    measureRender: (name: string) => {
      const start = performance.now();
      return () => {
        const end = performance.now();
        if (process.env.NODE_ENV === 'development') {
          console.log(`${name} took ${(end - start).toFixed(2)}ms`);
        }
      };
    }
  };
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef<number>(0);

  return useCallback(
    ((...args: unknown[]) => {
      if (Date.now() - lastRun.current >= delay) {
        callback(...args);
        lastRun.current = Date.now();
      }
    }) as T,
    [callback, delay]
  );
}

/**
 * A hook that provides batched state updates for objects.
 * This allows multiple properties to be updated in a single setState call,
 * reducing re-renders when updating multiple related values.
 * 
 * @example
 * ```tsx
 * const [formState, setBatchedFormState] = useBatchedState({ name: '', email: '' });
 * // Update multiple fields at once without causing multiple re-renders
 * setBatchedFormState({ name: 'John', email: 'john@example.com' });
 * ```
 * 
 * @param initialValue - The initial state object
 * @returns A tuple of [state, batchedSetState] similar to useState
 */
export function useBatchedState<T extends Record<string, unknown>>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);

  const batchedSetState = useCallback((updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  return [state, batchedSetState] as const;
}

/**
 * Performance measurement utilities for data processing operations.
 * Measures filtering, sorting, and other expensive operations with
 * performance marks and budget warnings.
 * 
 * @example
 * ```tsx
 * const { measureOperation, getMetrics } = useDataProcessingPerformance();
 * 
 * // Measure a filter operation
 * const result = measureOperation('filter-leads', () => {
 *   return leads.filter(lead => lead.status === 'active');
 * });
 * ```
 */
export function useDataProcessingPerformance() {
  const metricsRef = useRef<Map<string, number[]>>(new Map());
  const PERFORMANCE_BUDGET_MS = 100; // Warn if operation takes > 100ms

  /**
   * Measure an operation and log performance metrics
   */
  const measureOperation = useCallback(<T>(operationName: string, operation: () => T): T => {
    const startMark = `${operationName}-start`;
    const endMark = `${operationName}-end`;
    const measureName = `${operationName}-duration`;

    // Mark start
    performance.mark(startMark);

    // Execute operation
    const result = operation();

    // Mark end and measure
    performance.mark(endMark);

    try {
      performance.measure(measureName, startMark, endMark);
      const entries = performance.getEntriesByName(measureName);
      const duration = entries[entries.length - 1]?.duration || 0;

      // Store metrics
      if (!metricsRef.current.has(operationName)) {
        metricsRef.current.set(operationName, []);
      }
      const operationMetrics = metricsRef.current.get(operationName)!;
      operationMetrics.push(duration);

      // Keep only last 10 measurements
      if (operationMetrics.length > 10) {
        operationMetrics.shift();
      }

      // Log performance warnings in development
      if (process.env.NODE_ENV === 'development' && duration > PERFORMANCE_BUDGET_MS) {
        console.warn(
          `⚠️ Performance budget exceeded: ${operationName} took ${duration.toFixed(2)}ms (budget: ${PERFORMANCE_BUDGET_MS}ms)`
        );
      }

      // Clean up performance entries
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    } catch (e) {
      // Performance API not available or failed
      if (process.env.NODE_ENV === 'development') {
        console.debug('Performance measurement failed:', e);
      }
    }

    return result;
  }, []);

  /**
   * Get average duration for an operation
   */
  const getAverageDuration = useCallback((operationName: string): number | null => {
    const metrics = metricsRef.current.get(operationName);
    if (!metrics || metrics.length === 0) return null;
    return metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
  }, []);

  /**
   * Get all recorded metrics
   */
  const getMetrics = useCallback(() => {
    const result: Record<string, { count: number; average: number; max: number; min: number }> = {};

    metricsRef.current.forEach((values, name) => {
      if (values.length > 0) {
        result[name] = {
          count: values.length,
          average: values.reduce((sum, val) => sum + val, 0) / values.length,
          max: Math.max(...values),
          min: Math.min(...values)
        };
      }
    });

    return result;
  }, []);

  /**
   * Clear all recorded metrics
   */
  const clearMetrics = useCallback(() => {
    metricsRef.current.clear();
  }, []);

  return {
    measureOperation,
    getAverageDuration,
    getMetrics,
    clearMetrics,
    PERFORMANCE_BUDGET_MS
  };
}

