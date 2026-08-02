'use client';
/* eslint-disable react-refresh/only-export-components */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChartStable } from '../chart-context';
import {
  type PatternPresetId,
  type PatternPresetOptions,
  renderPatternPreset,
} from '../pattern-preset';
import type { BrushSelection } from './brush-types';

/** Invisible full-height hit target for the resize drag (mirrors upstream visx `handleSize`). */
const HANDLE_HIT_WIDTH = 8;
/** Visible pill — matches upstream `h-6 w-1 rounded-lg` (`24px × 4px`). */
const PILL_WIDTH = 4;
const PILL_HEIGHT = 24;

/** Outer fade extent for the dim panes — matches upstream series edge fade (15%). */
const BRUSH_TRACK_OUTER_FADE = 0.15;

function outsidePaneStyle(
  edge: 'left' | 'right',
  blurPx: number,
  fadeOuterEdges: boolean,
): React.CSSProperties {
  const fadeStop = `${BRUSH_TRACK_OUTER_FADE * 100}%`;
  let mask: string | undefined;
  if (fadeOuterEdges) {
    mask =
      edge === 'left'
        ? `linear-gradient(to right, transparent 0%, black ${fadeStop}, black 100%)`
        : `linear-gradient(to left, transparent 0%, black ${fadeStop}, black 100%)`;
  }
  return {
    pointerEvents: 'none',
    backdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
    WebkitBackdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
}

export interface ChartBrushSelectionPattern extends PatternPresetOptions {
  preset: PatternPresetId;
  /** Pattern overlay opacity. Default: theme token `--chart-brush-pattern-opacity`. */
  opacity?: number | string;
}

/** Shared brush selection pattern for Git visualization charts (stable identity for React.memo). */
export const BRUSH_SELECTION_PATTERN: ChartBrushSelectionPattern = {
  preset: 'diagonal',
  color: 'var(--chart-brush-pattern)',
};

export interface ChartBrushProps {
  onSelectionChange: (domain: { start: Date; end: Date }) => void;
  initialSelection?: BrushSelection;
  blurPx?: number;
  fadeOuterEdges?: boolean;
  /** Pattern fill inside the brush selection window (upstream `selectionPattern`). */
  selectionPattern?: ChartBrushSelectionPattern;
}

export const ChartBrush = React.memo(function ChartBrush({
  onSelectionChange,
  initialSelection,
  blurPx = 1.5,
  fadeOuterEdges = true,
  selectionPattern,
}: ChartBrushProps) {
  const { xScale, innerWidth, innerHeight, margin, containerRef } = useChartStable();
  const patternId = useId().replace(/:/g, '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dragState = useRef<{
    mode: 'pan' | 'resize-left' | 'resize-right' | null;
    startX: number;
    startFracStart: number;
    startFracEnd: number;
  }>({ mode: null, startX: 0, startFracStart: 0, startFracEnd: 1 });

  const innerWidthRef = useRef(innerWidth);
  innerWidthRef.current = innerWidth;

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

  const reportSelection = useCallback(
    (s: number, e: number) => {
      const start = new Date(fullMinTime + s * fullSpan);
      const end = new Date(fullMinTime + e * fullSpan);
      onSelectionChange({ start, end });
    },
    [fullMinTime, fullSpan, onSelectionChange],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: 'pan' | 'resize-left' | 'resize-right') => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const rect = (e.target as Element).closest('svg')?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      dragState.current = {
        mode,
        startX: e.clientX - rect.left,
        startFracStart: fracStartRef.current,
        startFracEnd: fracEndRef.current,
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ds = dragState.current;
      if (!ds.mode) {
        return;
      }
      e.stopPropagation();
      const rect = (e.target as Element).closest('svg')?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      const dx = e.clientX - rect.left - ds.startX;
      const deltaFrac = dx / (innerWidthRef.current || 1);

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
    },
    [reportSelection],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.mode) {
      return;
    }
    e.stopPropagation();
    dragState.current.mode = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const fullMinPx = xScale(domain[0]);
  const fullMaxPx = xScale(domain[1]);
  const x0 = fullMinPx + fracStart * (fullMaxPx - fullMinPx);
  const x1 = fullMinPx + fracEnd * (fullMaxPx - fullMinPx);

  const patternNode = selectionPattern
    ? renderPatternPreset(selectionPattern.preset, patternId, selectionPattern)
    : null;

  const clampedBlur = Math.min(5, Math.max(0, blurPx));

  const renderTrackOverlay = () => {
    const container = containerRef.current;
    if (!(mounted && container)) {
      return null;
    }
    const leftWidth = Math.max(0, x0);
    const rightWidth = Math.max(0, innerWidth - x1);
    if (leftWidth <= 0 && rightWidth <= 0) {
      return null;
    }
    return createPortal(
      <div
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      >
        {leftWidth > 0 ? (
          <div
            style={{
              position: 'absolute',
              ...outsidePaneStyle('left', clampedBlur, fadeOuterEdges),
              top: margin.top,
              left: margin.left,
              width: leftWidth,
              height: innerHeight,
            }}
          />
        ) : null}
        {rightWidth > 0 ? (
          <div
            style={{
              position: 'absolute',
              ...outsidePaneStyle('right', clampedBlur, fadeOuterEdges),
              top: margin.top,
              left: margin.left + x1,
              width: rightWidth,
              height: innerHeight,
            }}
          />
        ) : null}
      </div>,
      container,
    );
  };

  if (innerWidth <= 0) {
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
      {patternNode ? (
        <g pointerEvents="none" aria-hidden="true">
          <defs>{patternNode}</defs>
          <rect
            x={x0}
            y={0}
            width={Math.max(0, x1 - x0)}
            height={innerHeight}
            fill={`url(#${patternId})`}
            fillOpacity={selectionPattern?.opacity ?? 'var(--chart-brush-pattern-opacity)'}
          />
        </g>
      ) : null}
      <rect
        x={x0}
        y={0}
        width={x1 - x0}
        height={innerHeight}
        fill="transparent"
        stroke="var(--chart-brush-border, var(--chart-grid))"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => handlePointerDown(e, 'pan')}
      />
      <rect
        x={x0 - HANDLE_HIT_WIDTH / 2}
        y={0}
        width={HANDLE_HIT_WIDTH}
        height={innerHeight}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
      />
      <rect
        x={x1 - HANDLE_HIT_WIDTH / 2}
        y={0}
        width={HANDLE_HIT_WIDTH}
        height={innerHeight}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
      />
      <g aria-hidden="true">
        <rect
          x={x0 - PILL_WIDTH / 2}
          y={(innerHeight - PILL_HEIGHT) / 2}
          width={PILL_WIDTH}
          height={PILL_HEIGHT}
          rx={PILL_WIDTH / 2}
          fill="var(--chart-brush-border)"
          style={{ pointerEvents: 'none' }}
        />
        <rect
          x={x1 - PILL_WIDTH / 2}
          y={(innerHeight - PILL_HEIGHT) / 2}
          width={PILL_WIDTH}
          height={PILL_HEIGHT}
          rx={PILL_WIDTH / 2}
          fill="var(--chart-brush-border)"
          style={{ pointerEvents: 'none' }}
        />
      </g>
      {renderTrackOverlay()}
    </g>
  );
});
