'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  leadCount: number;
  filterCount: number;
}

interface PerformanceMonitorProps {
  leadCount: number;
  filterCount: number;
  onPerformanceIssue?: (metrics: PerformanceMetrics) => void;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  leadCount,
  filterCount,
  onPerformanceIssue
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    leadCount: 0,
    filterCount: 0
  });

  const [isVisible, setIsVisible] = useState(false);
  const lastMeasureTime = React.useRef<number>(0);
  const measurementThrottleMs = 1000; // Throttle measurements to once per second

  const measurePerformance = useCallback(() => {
    // Skip measurements when hidden and no performance issue callback
    // This avoids setMetrics updates and re-render overhead during normal use
    if (!isVisible && !onPerformanceIssue) {
      return;
    }

    // Throttle measurements to reduce performance overhead
    const now = Date.now();
    if (now - lastMeasureTime.current < measurementThrottleMs) {
      return;
    }
    lastMeasureTime.current = now;

    const startTime = performance.now();

    // Simulate render measurement
    requestAnimationFrame(() => {
      // Double-check visibility before updating state to avoid stale closures
      // Only proceed if visible or if there's a performance issue callback
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Get memory usage if available
      const memoryUsage = (performance as any).memory
        ? (performance as any).memory.usedJSHeapSize / 1024 / 1024
        : 0;

      const newMetrics: PerformanceMetrics = {
        renderTime,
        memoryUsage,
        leadCount,
        filterCount
      };

      // Only update state if visible (to display in UI)
      if (isVisible) {
        setMetrics(newMetrics);
      }

      // Check for performance issues regardless of visibility
      if (renderTime > 16 || memoryUsage > 100 || leadCount > 1000) {
        onPerformanceIssue?.(newMetrics);
      }
    });
  }, [leadCount, filterCount, onPerformanceIssue, isVisible]);

  useEffect(() => {
    // Only measure when visible or when there's a performance issue callback
    if (isVisible || onPerformanceIssue) {
      measurePerformance();
    }
  }, [measurePerformance, isVisible, onPerformanceIssue]);

  // Toggle visibility with Ctrl+Shift+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible) return null;

  const getPerformanceColor = (value: number, thresholds: [number, number]) => {
    if (value <= thresholds[0]) return 'text-green-600';
    if (value <= thresholds[1]) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 max-w-xs">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Performance Monitor</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-500 hover:text-gray-700 text-xs"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-600">Render Time:</span>
          <span className={getPerformanceColor(metrics.renderTime, [8, 16])}>
            {metrics.renderTime.toFixed(2)}ms
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Memory Usage:</span>
          <span className={getPerformanceColor(metrics.memoryUsage, [50, 100])}>
            {metrics.memoryUsage.toFixed(1)}MB
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Lead Count:</span>
          <span className={getPerformanceColor(metrics.leadCount, [500, 1000])}>
            {metrics.leadCount}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Filter Count:</span>
          <span className={getPerformanceColor(metrics.filterCount, [5, 10])}>
            {metrics.filterCount}
          </span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Press Ctrl+Shift+P to toggle
        </p>
      </div>
    </div>
  );
};

export default PerformanceMonitor;