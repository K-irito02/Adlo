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
  /** Max label width in px before truncation. Default: undefined (no truncation) */
  maxLabelWidth?: number;
  /** Label display mode. Default: 'normal' */
  labelMode?: 'normal' | 'compact' | 'readable';
}

export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
  tickEvery = 1,
  labelFormat = 'short',
  top = 0,
  rotateAngle,
  maxLabelWidth,
  labelMode = 'normal',
}: HeatmapXAxisProps) {
  const { containerRef, data, margin, xScale, binWidth, columnLabels, locale } = useHeatmap();
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

  const isReadable = labelMode === 'readable';

  return createPortal(
    labels.map((tick) => {
      const isRotated = rotateAngle !== undefined && rotateAngle !== 0;
      const shouldTruncate = maxLabelWidth !== undefined && !isReadable;

      const labelStyle: React.CSSProperties = {
        top,
        left: tick.x,
        width: isRotated ? 'auto' : (shouldTruncate ? maxLabelWidth : 'auto'),
        display: 'flex',
        justifyContent: isReadable ? 'center' : 'flex-start',
        overflow: 'visible',
        position: 'absolute',
      };

      return (
        <div
          className="pointer-events-none absolute"
          key={tick.key}
          style={labelStyle}
        >
          <span
            className={cn(
              'text-chart-label text-xs whitespace-nowrap',
              shouldTruncate && 'truncate inline-block',
              isReadable && 'whitespace-normal text-center leading-tight',
              className,
            )}
            title={shouldTruncate ? tick.label : undefined}
            style={{
              ...(isRotated ? {
                transform: `rotate(${rotateAngle}deg)`,
                transformOrigin: 'left center',
              } : {}),
              ...(isReadable ? {
                maxWidth: maxLabelWidth ?? 80,
                display: '-webkit-box' as unknown as React.CSSProperties['display'],
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                fontSize: '10px',
              } : {}),
              ...(shouldTruncate ? { maxWidth: maxLabelWidth, display: 'inline-block' } : {}),
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
