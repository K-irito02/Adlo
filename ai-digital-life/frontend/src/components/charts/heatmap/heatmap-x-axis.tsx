'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { IconFolder } from '@icons';
import { useHeatmap } from './heatmap-context';
import { getHeatmapColumnMonthAnchor } from './heatmap-utils';

export interface ColumnMeta {
  isDir: boolean;
}

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
  /** Per-column metadata (isDir, etc.) for display and interaction decisions */
  columnMeta?: ColumnMeta[];
}

export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
  tickEvery = 1,
  labelFormat = 'short',
  top = 0,
  rotateAngle,
  onColumnClick,
  onColumnContextMenu,
  columnMeta,
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
          dataIndex: columnIndex,
        }))
        .filter((tick, i) => tick.label && i % every === 0);
    }

    const monthFmt = new Intl.DateTimeFormat(locale ?? undefined, { month: 'short' });
    const ticks: { label: string; x: number; key: string; dataIndex?: number }[] = [];
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
        dataIndex: columnIndex,
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
    labels.map((tick, index) => {
      const isRotated = rotateAngle !== undefined && rotateAngle !== 0;
      const meta = columnMeta?.[tick.dataIndex ?? index];
      const isDir = meta?.isDir ?? false;
      const isInteractive = isDir && Boolean(onColumnClick || onColumnContextMenu);

      const labelStyle: React.CSSProperties = {
        top,
        left: tick.x,
        width: 'max-content',
      };

      const handleContextMenu =
        isDir && onColumnContextMenu
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              onColumnContextMenu(tick.label, e.clientX, e.clientY);
            }
          : undefined;

      const folderIcon = isDir && (
        <IconFolder size={14} decorative style={{ color: 'var(--text-muted)' }} />
      );

      const labelContent = (
        <>
          {folderIcon}
          <span
            className={cn(
              'text-chart-label text-xs whitespace-nowrap',
              className,
              isInteractive && 'hover:text-chart-label-hover',
            )}
          >
            {tick.label}
          </span>
        </>
      );

      const interactiveProps = isInteractive
        ? {
            className: 'pointer-events-auto cursor-pointer',
            onClick: () => onColumnClick?.(tick.label),
            onContextMenu: handleContextMenu,
            title: tick.label,
          }
        : {};

      return (
        <div className="absolute pointer-events-none" key={tick.key} style={labelStyle}>
          <div className="flex items-center" style={{ gap: isRotated ? 0 : 4 }}>
            {isRotated ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transform: `rotate(-${rotateAngle}deg)`,
                  transformOrigin: 'left center',
                  whiteSpace: 'nowrap',
                }}
                {...interactiveProps}
              >
                {labelContent}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} {...interactiveProps}>
                {labelContent}
              </div>
            )}
          </div>
        </div>
      );
    }),
    container,
  );
});

HeatmapXAxis.displayName = 'HeatmapXAxis';

export default HeatmapXAxis;
