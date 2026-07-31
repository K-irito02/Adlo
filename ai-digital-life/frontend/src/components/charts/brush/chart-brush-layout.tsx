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
}

export const ChartBrushLayout = React.memo(function ChartBrushLayout({
  data,
  xDataKey = 'date',
  enabled,
  height,
  brushStrip,
  children,
  className,
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
    setSelection({
      start: first instanceof Date ? first : new Date(first as string | number),
      end: last instanceof Date ? last : new Date(last as string | number),
    });
  }, [dataRangeKey, xDataKey, data]);

  const xDomain = useMemo<[Date, Date] | undefined>(() => {
    if (!enabled || !selection) {
      return undefined;
    }
    return [selection.start, selection.end];
  }, [enabled, selection]);

  const xDomainSlotCount = useMemo<number | undefined>(() => {
    if (!enabled || !selection) {
      return undefined;
    }
    return data.length;
  }, [enabled, data.length]);

  const handleSelectionChange = useCallback((sel: BrushSelection | null) => {
    setSelection(sel);
  }, []);

  const layout = useMemo<BrushLayoutRenderProps>(
    () => ({
      xDomain,
      xDomainSlotCount,
      brushSelection: selection,
      onBrushSelectionChange: handleSelectionChange,
    }),
    [xDomain, xDomainSlotCount, selection, handleSelectionChange],
  );

  if (!enabled || data.length === 0) {
    return (
      <div className={cn('adl-chart-brush-layout', className)}>
        {children({
          xDomain: undefined,
          xDomainSlotCount: undefined,
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
