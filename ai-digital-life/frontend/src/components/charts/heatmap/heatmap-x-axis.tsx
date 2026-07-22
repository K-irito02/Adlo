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
}

export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
  tickEvery = 1,
  labelFormat = 'short',
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
        label: labelFormat === 'numeric'
          ? String(monthAnchor.getMonth() + 1)
          : monthFmt.format(monthAnchor),
        x: margin.left + xScale(columnIndex),
        key: `x-${columnIndex}-${monthKey}`,
      });
      lastMonthKey = monthKey;
    }

    return ticks;
  }, [columnLabels, data, labelFormat, locale, margin.left, tickEvery, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  const useAutoWidth = labelFormat === 'numeric' || !!columnLabels;

  return createPortal(
    labels.map((tick) => (
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={{
          top: 0,
          left: tick.x,
          width: useAutoWidth ? 'auto' : binWidth,
          display: 'flex',
          justifyContent: 'flex-start',
          overflow: useAutoWidth ? 'visible' : 'hidden',
        }}
      >
        <span
          className={cn(
            'text-chart-label text-xs',
            !useAutoWidth && 'truncate',
            className,
          )}
          title={useAutoWidth ? undefined : tick.label}
        >
          {tick.label}
        </span>
      </div>
    )),
    container,
  );
});

HeatmapXAxis.displayName = 'HeatmapXAxis';

export default HeatmapXAxis;
