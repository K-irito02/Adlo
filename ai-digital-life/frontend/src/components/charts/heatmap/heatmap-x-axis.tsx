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
}

export const HeatmapXAxis = memo(function HeatmapXAxis({ className, tickEvery = 1 }: HeatmapXAxisProps) {
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
        label: monthFmt.format(monthAnchor),
        x: margin.left + xScale(columnIndex),
        key: `x-${columnIndex}-${monthKey}`,
      });
      lastMonthKey = monthKey;
    }

    return ticks;
  }, [columnLabels, data, locale, margin.left, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return createPortal(
    labels.map((tick) => (
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={{
          top: 0,
          left: tick.x,
          width: binWidth,
          display: 'flex',
          justifyContent: 'flex-start',
          overflow: 'hidden',
        }}
      >
        <span
          className={cn('truncate text-chart-label text-xs', className)}
          title={tick.label}
        >
          {tick.label}
        </span>
      </div>
    )),
    container
  );
});

HeatmapXAxis.displayName = 'HeatmapXAxis';

export default HeatmapXAxis;
