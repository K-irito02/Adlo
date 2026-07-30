'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useChartStable } from '../chart-context';
import type { BrushSelection } from './brush-types';

const HANDLE_WIDTH = 8;

export interface ChartBrushProps {
  onSelectionChange: (domain: { start: Date; end: Date }) => void;
  initialSelection?: BrushSelection;
  blurPx?: number;
  fadeOuterEdges?: boolean;
}

export const ChartBrush = React.memo(function ChartBrush({
  onSelectionChange,
  initialSelection,
  blurPx = 1.5,
  fadeOuterEdges = true,
}: ChartBrushProps) {
  const { xScale, innerWidth, innerHeight } = useChartStable();
  const dragState = useRef<{
    mode: 'pan' | 'resize-left' | 'resize-right' | null;
    startX: number;
    startFracStart: number;
    startFracEnd: number;
  }>({ mode: null, startX: 0, startFracStart: 0, startFracEnd: 1 });

  const domain = xScale.domain();
  const fullMinTime = domain[0].getTime();
  const fullMaxTime = domain[1].getTime();
  const fullSpan = fullMaxTime - fullMinTime || 1;

  const [fracStart, setFracStart] = useState(() => {
    if (initialSelection) {
      const s = (initialSelection.start.getTime() - fullMinTime) / fullSpan;
      return Math.max(0, Math.min(1, s));
    }
    return 0;
  });
  const [fracEnd, setFracEnd] = useState(() => {
    if (initialSelection) {
      const e = (initialSelection.end.getTime() - fullMinTime) / fullSpan;
      return Math.max(0, Math.min(1, e));
    }
    return 1;
  });

  const fracStartRef = useRef(fracStart);
  const fracEndRef = useRef(fracEnd);
  fracStartRef.current = fracStart;
  fracEndRef.current = fracEnd;

  const reportSelection = useCallback((s: number, e: number) => {
    const start = new Date(fullMinTime + s * fullSpan);
    const end = new Date(fullMinTime + e * fullSpan);
    onSelectionChange({ start, end });
  }, [fullMinTime, fullSpan, onSelectionChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent, mode: 'pan' | 'resize-left' | 'resize-right') => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const rect = (e.target as Element).closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      mode,
      startX: e.clientX - rect.left,
      startFracStart: fracStartRef.current,
      startFracEnd: fracEndRef.current,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.mode) return;
    e.stopPropagation();
    const rect = (e.target as Element).closest('svg')?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const dx = (e.clientX - rect.left) - ds.startX;
    const deltaFrac = dx / rect.width;

    let s = ds.startFracStart;
    let ef = ds.startFracEnd;

    if (ds.mode === 'pan') {
      const range = ds.startFracEnd - ds.startFracStart;
      s = Math.max(0, Math.min(1 - range, ds.startFracStart + deltaFrac));
      ef = s + range;
    } else if (ds.mode === 'resize-left') {
      s = Math.max(0, Math.min(ds.startFracEnd - 0.02, ds.startFracStart + deltaFrac));
    } else if (ds.mode === 'resize-right') {
      ef = Math.min(1, Math.max(ds.startFracStart + 0.02, ds.startFracEnd + deltaFrac));
    }

    setFracStart(s);
    setFracEnd(ef);
    reportSelection(s, ef);
  }, [reportSelection]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.mode) return;
    e.stopPropagation();
    dragState.current.mode = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const fullMinPx = xScale(domain[0]);
  const fullMaxPx = xScale(domain[1]);
  const x0 = fullMinPx + fracStart * (fullMaxPx - fullMinPx);
  const x1 = fullMinPx + fracEnd * (fullMaxPx - fullMinPx);

  if (innerWidth === 0) {
    return null;
  }

  return (
    <g
      style={{ pointerEvents: 'auto' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <rect
        x={0} y={0} width={x0} height={innerHeight}
        fill="var(--chart-brush-dim, rgba(0,0,0,0.15))"
        style={{
          backdropFilter: `blur(${blurPx}px)`,
          ...(fadeOuterEdges ? { maskImage: 'linear-gradient(to right, transparent, black 10%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%)' } : {}),
        }}
        pointerEvents="none"
      />
      <rect
        x={x1} y={0} width={innerWidth - x1} height={innerHeight}
        fill="var(--chart-brush-dim, rgba(0,0,0,0.15))"
        style={{
          backdropFilter: `blur(${blurPx}px)`,
          ...(fadeOuterEdges ? { maskImage: 'linear-gradient(to left, transparent, black 10%)', WebkitMaskImage: 'linear-gradient(to left, transparent, black 10%)' } : {}),
        }}
        pointerEvents="none"
      />
      <rect
        x={x0} y={0} width={x1 - x0} height={innerHeight}
        fill="transparent"
        stroke="var(--chart-brush-border, var(--chart-grid))"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => handlePointerDown(e, 'pan')}
      />
      <rect
        x={x0 - HANDLE_WIDTH / 2} y={0}
        width={HANDLE_WIDTH} height={innerHeight}
        fill="var(--chart-brush-border, var(--chart-grid))"
        rx={2}
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
      />
      <rect
        x={x1 - HANDLE_WIDTH / 2} y={0}
        width={HANDLE_WIDTH} height={innerHeight}
        fill="var(--chart-brush-border, var(--chart-grid))"
        rx={2}
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
      />
    </g>
  );
});
