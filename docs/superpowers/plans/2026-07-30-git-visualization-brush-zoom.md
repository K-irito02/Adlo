# Git Visualization Brush Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brush-zoom interaction to CodeLineEvo and CommitTimeline charts via reusable ChartBrushLayout + ChartBrush components, and fix the date truncation bug in codeEvolutionToAreaData.

**Architecture:** Two new shared components (ChartBrushLayout, ChartBrush) built on existing bklit-ui chart infrastructure. ChartBrushLayout manages brush selection state and derives xDomain/xDomainSlotCount. ChartBrush handles SVG brush interaction (drag/resize handle). Both charts wrap their LineChart in ChartBrushLayout, passing xDomain props for filtered rendering.

**Tech Stack:** React 19, TypeScript, @visx/scale, d3-array, motion (framer-motion), existing bklit-ui chart framework

## Global Constraints

- Follow bklit-ui [Brush](https://bklit.com/docs/utility/brush) API exactly
- ChartBrush component name must match `'ChartBrush'` string in `chart-child-passthrough.ts:85`
- No new npm dependencies (use existing @visx/d3/motion stack)
- SVG event handling must call `stopPropagation()` to prevent chart interaction interference
- i18n keys must be used for any visible text
- CSS variables for brush styling use existing `--chart-brush-border` and `--chart-background`

---
### Task 1: Fix codeEvolutionToAreaData date truncation

**Files:**
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts:200-208`
- Test: `frontend/src/app/features/git-visualization/data/gitVisMockData.test.ts` (or create inline adapter test)
- Modify: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx` (update mock date expectations)

**Interfaces:**
- Produces: `codeEvolutionToAreaData(weeks)` returns rows with `date` as full `YYYY-MM-DD` string instead of truncated `MM-DD`

- [ ] **Step 1: Write failing test for the fix**

Add test to `chartDataAdapters.test.ts` (create if not exists):
```typescript
import { describe, it, expect } from 'vitest';
import { codeEvolutionToAreaData } from './chartDataAdapters';

describe('codeEvolutionToAreaData', () => {
  it('preserves full date (YYYY-MM-DD) in output', () => {
    const input = [
      { weekStart: '2024-01-07', additions: 100, deletions: 50 },
      { weekStart: '2024-06-15', additions: 200, deletions: 80 },
      { weekStart: '2025-03-01', additions: 150, deletions: 60 },
    ];
    const result = codeEvolutionToAreaData(input);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-01-07');
    expect(result[1].date).toBe('2024-06-15');
    expect(result[2].date).toBe('2025-03-01');
  });

  it('handles empty input', () => {
    expect(codeEvolutionToAreaData([])).toEqual([]);
  });
});
```

Run: `pnpm vitest run --reporter=verbose frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts`
Expected: FAIL (test file doesn't exist yet)

- [ ] **Step 2: Create the adapter test file at the correct path**

- [ ] **Step 3: Fix the implementation**

In `chartDataAdapters.ts:204`, change:
```typescript
date: w.weekStart.substring(5),
```
to:
```typescript
date: w.weekStart,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --reporter=verbose frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts
git commit -m "fix: preserve full date in codeEvolutionToAreaData"
```

---
### Task 2: Create brush type definitions

**Files:**
- Create: `frontend/src/components/charts/brush/brush-types.ts`

**Interfaces:**
- Produces: `BrushSelection`, `BrushLayoutRenderProps` types used by Task 3 and Task 4

- [ ] **Step 1: Write the types file**

```typescript
export interface BrushSelection {
  start: Date;
  end: Date;
}

export interface BrushLayoutRenderProps {
  xDomain: [Date, Date] | undefined;
  xDomainSlotCount: number | undefined;
  brushSelection: BrushSelection | null;
  onBrushSelectionChange: (selection: BrushSelection | null) => void;
}
```

- [ ] **Step 2: Create barrel export**

Create `frontend/src/components/charts/brush/index.ts`:
```typescript
export { ChartBrushLayout } from './chart-brush-layout';
export { ChartBrush } from './chart-brush';
export type { BrushSelection, BrushLayoutRenderProps } from './brush-types';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/charts/brush/brush-types.ts frontend/src/components/charts/brush/index.ts
git commit -m "feat: add brush type definitions"
```

---
### Task 3: Create ChartBrush component

**Files:**
- Create: `frontend/src/components/charts/brush/chart-brush.tsx`
- Create: `frontend/src/components/charts/brush/chart-brush.test.tsx`

**Interfaces:**
- Consumes: `BrushSelection` from Task 2, chart context (`useChart`, `useChartStable`) from existing framework
- Produces: `<ChartBrush>` component — renders selection overlay + drag handles inside an SVG, reports pixel-to-date selection via `onSelectionChange`

- [ ] **Step 1: Write the implementation**

```typescript
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
}: ChartBrushProps) {
  const { xScale, innerWidth, innerHeight } = useChartStable();
  const dragState = useRef<{
    mode: 'pan' | 'resize-left' | 'resize-right' | null;
    startX: number;
    startFracStart: number;
    startFracEnd: number;
  }>({ mode: null, startX: 0, startFracStart: 0, startFracEnd: 1 });

  const domain = xScale.domain();
  const fullMinPx = xScale(domain[0]);
  const fullMaxPx = xScale(domain[1]);

  const [fracStart, setFracStart] = useState(() => {
    if (initialSelection) {
      const s = (xScale(initialSelection.start).getTime() - fullMinPx.getTime()) / (fullMaxPx.getTime() - fullMinPx.getTime());
      return Math.max(0, Math.min(1, s));
    }
    return 0;
  });
  const [fracEnd, setFracEnd] = useState(() => {
    if (initialSelection) {
      const e = (xScale(initialSelection.end).getTime() - fullMinPx.getTime()) / (fullMaxPx.getTime() - fullMinPx.getTime());
      return Math.max(0, Math.min(1, e));
    }
    return 1;
  });

  const fracStartRef = useRef(fracStart);
  const fracEndRef = useRef(fracEnd);
  fracStartRef.current = fracStart;
  fracEndRef.current = fracEnd;

  const reportSelection = useCallback((s: number, e: number) => {
    const minTime = domain[0].getTime();
    const maxTime = domain[1].getTime();
    const start = new Date(minTime + s * (maxTime - minTime));
    const end = new Date(minTime + e * (maxTime - minTime));
    onSelectionChange({ start, end });
  }, [domain, onSelectionChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent, mode: 'pan' | 'resize-left' | 'resize-right') => {
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
    >
      {/* Dimmed region left of selection */}
      <rect
        x={0} y={0} width={x0} height={innerHeight}
        fill="var(--chart-brush-dim, rgba(0,0,0,0.15))"
        style={{ backdropFilter: `blur(${blurPx}px)` }}
        pointerEvents="none"
      />
      {/* Dimmed region right of selection */}
      <rect
        x={x1} y={0} width={innerWidth - x1} height={innerHeight}
        fill="var(--chart-brush-dim, rgba(0,0,0,0.15))"
        style={{ backdropFilter: `blur(${blurPx}px)` }}
        pointerEvents="none"
      />
      {/* Selection body — drag to pan */}
      <rect
        x={x0} y={0} width={x1 - x0} height={innerHeight}
        fill="transparent"
        stroke="var(--chart-brush-border, var(--chart-grid))"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => handlePointerDown(e, 'pan')}
      />
      {/* Left handle */}
      <rect
        x={x0 - HANDLE_WIDTH / 2} y={0}
        width={HANDLE_WIDTH} height={innerHeight}
        fill="var(--chart-brush-border, var(--chart-grid))"
        rx={2}
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
      />
      {/* Right handle */}
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
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ChartBrush } from './chart-brush';
import { scaleLinear, scaleTime } from '@visx/scale';

// Mock chart context providers
vi.mock('../chart-context', () => ({
  useChartStable: () => ({
    xScale: scaleTime({ domain: [new Date('2024-01-01'), new Date('2024-12-31')], range: [0, 500] }),
    innerWidth: 500,
    innerHeight: 60,
  }),
  useChartHover: () => ({ tooltipData: null, setTooltipData: () => {} }),
  useChart: () => ({
    xScale: scaleTime({ domain: [new Date('2024-01-01'), new Date('2024-12-31')], range: [0, 500] }),
    innerWidth: 500,
    innerHeight: 60,
    tooltipData: null,
    setTooltipData: () => {},
  }),
}));

describe('ChartBrush', () => {
  it('renders without crashing', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush onSelectionChange={onSel} />
      </svg>
    );
    expect(container.querySelector('g')).toBeInTheDocument();
  });

  it('renders dimmed regions and selection rects', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush onSelectionChange={onSel} />
      </svg>
    );
    const rects = container.querySelectorAll('rect');
    // 2 dim rects + 1 selection body + 2 handles = 5
    expect(rects.length).toBe(5);
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run --reporter=verbose frontend/src/components/charts/brush/chart-brush.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/charts/brush/chart-brush.tsx frontend/src/components/charts/brush/chart-brush.test.tsx
git commit -m "feat: add ChartBrush component"
```

---
### Task 4: Create ChartBrushLayout component

**Files:**
- Create: `frontend/src/components/charts/brush/chart-brush-layout.tsx`
- Create: `frontend/src/components/charts/brush/chart-brush-layout.test.tsx`

**Interfaces:**
- Consumes: `BrushSelection`, `BrushLayoutRenderProps` (Task 2), `ChartBrush` (Task 3)
- Produces: `<ChartBrushLayout>` orchestrator component

- [ ] **Step 1: Write the implementation**

```typescript
'use client';

import React, { useMemo, useState, useCallback } from 'react';
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
  const [selection, setSelection] = useState<BrushSelection | null>(() => {
    if (data.length === 0) return null;
    const first = data[0][xDataKey];
    const last = data[data.length - 1][xDataKey];
    return {
      start: first instanceof Date ? first : new Date(first as string | number),
      end: last instanceof Date ? last : new Date(last as string | number),
    };
  });

  const xDomain = useMemo<[Date, Date] | undefined>(() => {
    if (!enabled || !selection) return undefined;
    return [selection.start, selection.end];
  }, [enabled, selection]);

  const xDomainSlotCount = useMemo<number | undefined>(() => {
    if (!enabled || !selection) return undefined;
    return data.length;
  }, [enabled, data.length]);

  const handleSelectionChange = useCallback((sel: BrushSelection | null) => {
    setSelection(sel);
  }, []);

  const layout = useMemo<BrushLayoutRenderProps>(() => ({
    xDomain,
    xDomainSlotCount,
    brushSelection: selection,
    onBrushSelectionChange: handleSelectionChange,
  }), [xDomain, xDomainSlotCount, selection, handleSelectionChange]);

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
```

- [ ] **Step 2: Write the test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChartBrushLayout } from './chart-brush-layout';

describe('ChartBrushLayout', () => {
  const data = [
    { date: new Date('2024-01-01'), value: 100 },
    { date: new Date('2024-06-01'), value: 200 },
    { date: new Date('2024-12-31'), value: 150 },
  ];

  it('renders children and brush strip when enabled', () => {
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        brushStrip={() => <div data-testid="brush-strip" />}
      >
        {() => <div data-testid="main-chart" />}
      </ChartBrushLayout>
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.getByTestId('brush-strip')).toBeInTheDocument();
  });

  it('skips brush strip when disabled', () => {
    render(
      <ChartBrushLayout
        data={data}
        enabled={false}
        height={72}
        brushStrip={() => <div data-testid="brush-strip" />}
      >
        {() => <div data-testid="main-chart" />}
      </ChartBrushLayout>
    );
    expect(screen.getByTestId('main-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('brush-strip')).not.toBeInTheDocument();
  });

  it('provides xDomain when selection is set', () => {
    let capturedLayout: any;
    render(
      <ChartBrushLayout
        data={data}
        enabled
        height={72}
        brushStrip={() => null}
      >
        {(layout) => {
          capturedLayout = layout;
          return null;
        }}
      </ChartBrushLayout>
    );
    expect(capturedLayout.xDomain).toBeDefined();
    expect(capturedLayout.xDomainSlotCount).toBe(3);
    expect(capturedLayout.brushSelection).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run --reporter=verbose frontend/src/components/charts/brush/chart-brush-layout.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/charts/brush/chart-brush-layout.tsx frontend/src/components/charts/brush/chart-brush-layout.test.tsx
git commit -m "feat: add ChartBrushLayout component"
```

---
### Task 5: Update CodeLineEvo with brush-zoom

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx`
- Modify/check: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`

**Interfaces:**
- Consumes: `ChartBrushLayout`, `ChartBrush` from `@/components/charts/brush`

- [ ] **Step 1: Update CodeLineEvo.tsx**

Replace the entire component body to use `ChartBrushLayout`:

```typescript
import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { codeEvolutionToAreaData } from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { weeks: { weekStart: string; additions: number; deletions: number }[] };
}

export const CodeLineEvo = React.memo(function CodeLineEvo({ data }: CodeLineEvoProps) {
  const chartData = useMemo(() => (data?.weeks ? codeEvolutionToAreaData(data.weeks) : []), [data]);

  if (chartData.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="added" />
          <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
          <Grid />
          <ChartTooltip />
        </LineChart>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={chartData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="added" animate={false} showHighlight={false} />
            <Line dataKey="deleted" stroke="var(--chart-line-secondary)" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={layout.onBrushSelectionChange}
            />
          </LineChart>
        )}
      >
        {(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            xDomain={layout.xDomain}
            xDomainSlotCount={layout.xDomainSlotCount}
            tweenYDomainOnXDomainChange
            yDomainTween
            margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
            style={{ maxHeight: 280 }}
          >
            <Line dataKey="added" />
            <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
            <Grid />
            <ChartTooltip />
          </LineChart>
        )}
      </ChartBrushLayout>
    </div>
  );
});
```

- [ ] **Step 2: Update CodeLineEvo test**

Update `CodeLineEvo.test.tsx` mock to use full date format:

```typescript
// Add mock for ChartBrushLayout and ChartBrush
vi.mock('@/components/charts/brush', () => ({
  ChartBrushLayout: ({ children, brushStrip }: any) => (
    <div data-testid="brush-layout">
      {children({ xDomain: undefined, xDomainSlotCount: undefined, brushSelection: null, onBrushSelectionChange: () => {} })}
      {brushStrip?.({ brushSelection: null, onBrushSelectionChange: () => {} })}
    </div>
  ),
  ChartBrush: () => <div data-testid="chart-brush" />,
}));
```

- [ ] **Step 3: Run existing tests**

Run: `pnpm vitest run --reporter=verbose frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx
git commit -m "feat: add brush-zoom to CodeLineEvo chart"
```

---
### Task 6: Update CommitTimeline with brush-zoom

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx`
- Modify/check: `frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`

- [ ] **Step 1: Update CommitTimeline.tsx**

Replace to use `ChartBrushLayout`:

```typescript
import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { commitTimelineToRows } from '../adapters/chartDataAdapters';

interface CommitTimelineProps {
  data?: { commitTimeline: { date: string; cumulative: number }[] };
}

export const CommitTimeline = React.memo(function CommitTimeline({ data }: CommitTimelineProps) {
  const chartData = useMemo(
    () => (data?.commitTimeline ? commitTimelineToRows(data.commitTimeline) : []),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="cumulative" />
          <Grid />
          <ChartTooltip />
        </LineChart>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={chartData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="cumulative" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={layout.onBrushSelectionChange}
            />
          </LineChart>
        )}
      >
        {(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            xDomain={layout.xDomain}
            xDomainSlotCount={layout.xDomainSlotCount}
            tweenYDomainOnXDomainChange
            yDomainTween
            margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
            style={{ maxHeight: 280 }}
          >
            <Line dataKey="cumulative" />
            <Grid />
            <ChartTooltip />
          </LineChart>
        )}
      </ChartBrushLayout>
    </div>
  );
});
```

- [ ] **Step 2: Update CommitTimeline test**

Find or create `CommitTimeline.test.tsx` and add mock for brush components (same pattern as CodeLineEvo test).

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run --reporter=verbose frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx
git commit -m "feat: add brush-zoom to CommitTimeline chart"
```

---
### Task 7: Add brush CSS variables

**Files:**
- Modify: `frontend/src/styles/tailwind.css` or `frontend/src/styles/regions/rightpanel/git-visualization.css`

- [ ] **Step 1: Add brush CSS variable declarations**

In the Git visualization CSS, add:
```css
.adl-chart-brush-layout {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.adl-chart-brush-layout__strip {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid var(--chart-brush-border);
}

.adl-chart-brush-layout__strip svg {
  display: block;
}
```

- [ ] **Step 2: Verify no CSS regressions**

Run: `pnpm --dir frontend run lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "style: add brush layout CSS"
```

---
### Task 8: End-to-end verification and cleanup

- [ ] **Step 1: Run all frontend tests**

Run: `pnpm --dir frontend run test`
Expected: All existing tests pass + new brush tests pass

- [ ] **Step 2: Run lint**

Run: `pnpm --dir frontend run lint`
Expected: 0 errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: finalize brush-zoom implementation"
```
