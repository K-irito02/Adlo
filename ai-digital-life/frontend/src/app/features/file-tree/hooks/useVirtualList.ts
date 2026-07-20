import { useEffect, useRef, useState, useMemo, type RefObject } from 'react';

export interface VirtualListResult {
  startIndex: number;
  endIndex: number;
  offsetY: number;
}

export function useVirtualList<T>(
  containerRef: RefObject<HTMLElement>,
  items: T[],
  itemHeight: number = 28,
  overscan: number = 5,
): VirtualListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafIdRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setViewportHeight(container.clientHeight || 0);
    setScrollTop(container.scrollTop || 0);

    const scheduleUpdate = () => {
      if (rafIdRef.current) {
        return;
      }
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        setScrollTop(container.scrollTop);
        setViewportHeight(container.clientHeight);
      });
    };

    container.addEventListener('scroll', scheduleUpdate, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;
    resizeObserver?.observe(container);

    return () => {
      if (rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      container.removeEventListener('scroll', scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [containerRef]);

  return useMemo<VirtualListResult>(() => {
    const total = items.length;
    if (total === 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0 };
    }
    if (viewportHeight === 0) {
      return { startIndex: 0, endIndex: total, offsetY: 0 };
    }
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(total, startIndex + visibleCount);
    const offsetY = startIndex * itemHeight;
    return { startIndex, endIndex, offsetY };
  }, [items, scrollTop, viewportHeight, itemHeight, overscan]);
}
