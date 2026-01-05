'use client';

import React, { useState, useRef, useMemo, useCallback, memo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
}

function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = ''
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    const { startIndex, endIndex } = visibleRange;
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      index: startIndex + index
    }));
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Set CSS custom properties using useEffect to avoid inline styles
  React.useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      container.style.setProperty('--container-height', `${containerHeight}px`);
      container.style.setProperty('--total-height', `${totalHeight}px`);
      container.style.setProperty('--offset-y', `${offsetY}px`);
      container.style.setProperty('--item-height', `${itemHeight}px`);
    }
  }, [containerHeight, totalHeight, offsetY, itemHeight]);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto virtual-list-container ${className}`}
      onScroll={handleScroll}
    >
      <div className="virtual-list-total">
        <div className="virtual-list-items">
          {visibleItems.map(({ item, index }) => (
            <div key={index} className="virtual-list-item">
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(VirtualList);
