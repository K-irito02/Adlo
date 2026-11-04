'use client';

import React, { useMemo, useState, useCallback, useLayoutEffect } from 'react';
import type { BrushSelection, BrushLayoutRenderProps } from './brush-types';
import { cn } from '@/lib/utils';

export interface ChartBrushLayoutProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  enabled: boolean;
  height: number;
  brushStrip: (layout: BrushLayoutRenderProps) => React.ReactNode;
  children: (layout: BrushLayoutRenderProps) => React.ReactNode;
  className?: string;
  /**
   * Actual end of the underlying (un-aggregated) data. Aggregated strip buckets
   * (e.g. weekly Monday starts) can end before the true last data day. Extending
   * the default selection to the real extent lets the brush cover (and zoom into)
   * the partial last period without requiring the user to drag the range open.
   */
  selectionEnd?: Date;
}

export const ChartBrushLayout = React.memo(function ChartBrushLayout({
  data,
  xDataKey = 'date',
  enabled,
  height,
  brushStrip,
  children,
  className,
  selectionEnd,
}: ChartBrushLayoutProps) {
  const [selection, setSelection] = useState<BrushSelection | null>(null);

  const dataRangeKey = useMemo(() => {
    if (data.length === 0) {
      return '';
    }
    return `${data[0][xDataKey]}|${data[data.length - 1][xDataKey]}`;
  }, [data, xDataKey]);

  useLayoutEffect(() => {
    if (data.length === 0) {
      setSelection(null);
      return;
    }
    const first = data[0][xDataKey];
    const last = data[data.length - 1][xDataKey];
    const lastDate = last instanceof Date ? last : new Date(last as string | number);
    const endDate =
      selectionEnd && selectionEnd.getTime() > lastDate.getTime() ? selectionEnd : lastDate;
    setSelection({
      start: first instanceof Date ? first : new Date(first as string | number),
      end: endDate,
    });
  }, [dataRangeKey, xDataKey, data, selectionEnd]);

  const xDomain = useMemo<[Date, Date] | undefined>(() => {
    if (!enabled || !selection) {
      return undefined;
    }
    return [selection.start, selection.end];
  }, [enabled, selection]);

  const handleSelectionChange = useCallback((sel: BrushSelection | null) => {
    setSelection(sel);
  }, []);

  const layout = useMemo<BrushLayoutRenderProps>(
    () => ({
      xDomain,
      brushSelection: selection,
      onBrushSelectionChange: handleSelectionChange,
    }),
    [xDomain, selection, handleSelectionChange],
  );

  if (!enabled || data.length === 0) {
    return (
      <div className={cn('adl-chart-brush-layout', className)}>
        {children({
          xDomain: undefined,
          brushSelection: null,
          onBrushSelectionChange: () => {},
        })}
      </div>
    );
  }

  return (
    <div className={cn('adl-chart-brush-layout', className)}>
      {children(layout)}
      <div className="adl-chart-brush-layout__strip" style={{ height, minHeight: height }}>
        {brushStrip(layout)}
      </div>
    </div>
  );
});
