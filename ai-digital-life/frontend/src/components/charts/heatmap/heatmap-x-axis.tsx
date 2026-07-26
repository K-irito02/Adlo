'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useHeatmap } from './heatmap-context';
import { getHeatmapColumnMonthAnchor } from './heatmap-utils';

export interface HeatmapXAxisProps {
  /** Additional class name for labels */
  className?: string;
  /** Show every N-th label (1 = all). Helps prevent overlap on dense grids. Default: 1 */
  tickEvery?: number;
  /**
   * Label format mode:
   * - `'short'` (default) — localized short month name via Intl.DateTimeFormat
   * - `'numeric'` — plain month number 1-12, no truncation, allows overflow
   */
  labelFormat?: 'short' | 'numeric';
  /** Vertical offset from container top in px. Default: 0 */
  top?: number;
  /** Label rotation angle in degrees. Default: 0 */
  rotateAngle?: number;
  /** Called when a column label is left-clicked */
  onColumnClick?: (label: string) => void;
  /** Called when a column label is right-clicked */
  onColumnContextMenu?: (label: string, x: number, y: number) => void;
}

export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
  tickEvery = 1,
  labelFormat = 'short',
  top = 0,
  rotateAngle,
  onColumnClick,
  onColumnContextMenu,
}: HeatmapXAxisProps) {
  const { containerRef, data, margin, xScale, columnLabels, locale } = useHeatmap();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const labels = useMemo(() => {
    if (columnLabels) {
      const every = Math.max(1, tickEvery);
      return columnLabels
        .map((label, columnIndex) => ({
          label,
          x: margin.left + xScale(columnIndex),
          key: `col-${columnIndex}`,
        }))
        .filter((tick, i) => tick.label && i % every === 0);
    }

    const monthFmt = new Intl.DateTimeFormat(locale ?? undefined, { month: 'short' });
    const ticks: { label: string; x: number; key: string }[] = [];
    let lastMonthKey = '';

    for (let columnIndex = 0; columnIndex < data.length; columnIndex++) {
      const column = data[columnIndex];
      if (!column) {
        continue;
      }

      const monthAnchor = getHeatmapColumnMonthAnchor(column);
      if (!monthAnchor) {
        continue;
      }

      const monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
      if (monthKey === lastMonthKey) {
        continue;
      }

      ticks.push({
        label:
          labelFormat === 'numeric'
            ? String(monthAnchor.getMonth() + 1)
            : monthFmt.format(monthAnchor),
        x: margin.left + xScale(columnIndex),
        key: `x-${columnIndex}-${monthKey}`,
      });
      lastMonthKey = monthKey;
    }

    const every = Math.max(1, tickEvery);
    return ticks.filter((_, i) => i % every === 0);
  }, [columnLabels, data, labelFormat, locale, margin.left, tickEvery, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return createPortal(
    labels.map((tick) => {
      const isRotated = rotateAngle !== undefined && rotateAngle !== 0;
      const hasInteraction = Boolean(onColumnClick || onColumnContextMenu);

      const labelStyle: React.CSSProperties = {
        top,
        left: tick.x + (isRotated ? 6 : 0),
        width: 'max-content',
        display: 'flex',
        justifyContent: 'flex-start',
        overflow: 'visible',
      };

      const handleContextMenu = onColumnContextMenu
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            onColumnContextMenu(tick.label, e.clientX, e.clientY);
          }
        : undefined;

      return (
        <div
          className={cn(
            'absolute',
            hasInteraction ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
          )}
          key={tick.key}
          style={labelStyle}
          onClick={hasInteraction ? () => onColumnClick?.(tick.label) : undefined}
          onContextMenu={handleContextMenu}
          title={hasInteraction ? tick.label : undefined}
        >
          <span
            className={cn(
              'text-chart-label text-xs whitespace-nowrap',
              className,
              hasInteraction && 'hover:text-chart-label-hover',
            )}
            style={{
              ...(isRotated
                ? {
                    transform: `rotate(-${rotateAngle}deg)`,
                    transformOrigin: 'left center',
                  }
                : {}),
            }}
          >
            {tick.label}
          </span>
        </div>
      );
    }),
    container,
  );
});

HeatmapXAxis.displayName = 'HeatmapXAxis';

export default HeatmapXAxis;
