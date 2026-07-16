# HeatmapChart Generalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize HeatmapChart to support both calendar and generic 2D grid modes. Replace `ContributorStats` (bar chart) and `CollabSankey` (sankey diagram) with heatmap-based components. Rewrite `ClockHeatmap` (custom @visx SVG) to use HeatmapChart.

**Architecture:** Modify 6 shared heatmap component files to make `HeatmapBin.date` optional and add `rowLabels`/`columnLabels` props. Create 3 chart components (2 new, 1 rewrite) in git-visualization. Remove 2 old components. Update mock data, i18n, tests.

**Tech Stack:** React 19, TypeScript, @visx/scale, motion (framer-motion), Vitest, testing-library

## Global Constraints

- `HeatmapBin.date` must remain optional — backward compatible with `CalendarHeatmap`
- `rowLabels` / `columnLabels` must not affect calendar mode when absent
- All existing tests must pass without modification (except explicitly updated ones)
- `pnpm run lint` — zero warnings
- `pnpm run typecheck` — zero errors

---

### Task 1: Data Layer — Types & Utilities

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-context.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-utils.ts`

**Interfaces:**
- Consumes: existing `HeatmapBin`, `HeatmapColumn`, `HeatmapContextValue`, `HeatmapTooltipData`
- Produces: updated types with optional `date`, new `columnLabel`/`rowLabels`/`columnLabels` fields

#### heatmap-context.tsx

- [ ] **Step 1: Make `HeatmapBin.date` optional**

```typescript
export interface HeatmapBin {
  count: number;
  bin: number;
  date?: Date;
}
```

- [ ] **Step 2: Add `columnLabel` to `HeatmapColumn`**

```typescript
export interface HeatmapColumn {
  bin: number;
  bins: HeatmapBin[];
  columnLabel?: string;
}
```

- [ ] **Step 3: Make `HeatmapTooltipData.date` optional**

```typescript
export interface HeatmapTooltipData {
  column: number;
  row: number;
  count: number;
  date?: Date;
  x: number;
  y: number;
}
```

- [ ] **Step 4: Add `rowLabels`/`columnLabels` to `HeatmapContextValue`, make calendar fields optional**

```typescript
export interface HeatmapContextValue {
  // ... existing fields ...
  rowLabels?: string[];
  columnLabels?: string[];
  timeXScale: HeatmapTimeScale | null;
  weekStartDay?: HeatmapWeekStartDay;
  // separatorLayout is already nullable — unchanged
}
```

- [ ] **Step 5: Run typecheck to verify only consumers report errors**

```bash
cd frontend && npx tsc --noEmit
```
Expected: type errors in `heatmap-chart.tsx`, `heatmap-x-axis.tsx`, `heatmap-y-axis.tsx`, `heatmap-cells.tsx`, `heatmap-utils.ts` — all to be fixed in subsequent steps.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-context.tsx
git commit -m "refactor(heatmap): make date optional, add rowLabels/columnLabels to context"
```

#### heatmap-utils.ts

- [ ] **Step 7: `filterHeatmapColumns` — skip date filter when no dates**

```typescript
export function filterHeatmapColumns(
  columns: HeatmapColumn[],
  xDomain?: [Date, Date]
): HeatmapColumn[] {
  if (!xDomain) {
    return columns;
  }
  if (columns.length > 0 && columns[0].bins[0]?.date == null) {
    return columns;
  }
  // ... existing logic unchanged ...
}
```

- [ ] **Step 8: `getHeatmapTimeExtent` — return null when no dates**

```typescript
export function getHeatmapTimeExtent(columns: HeatmapColumn[]): [Date, Date] | null {
  if (columns.length === 0) {
    return null;
  }
  const firstColumn = columns[0];
  const start = getHeatmapColumnStartDate(firstColumn);
  const lastColumn = columns.at(-1);
  const end = getHeatmapColumnEndDate(lastColumn);
  if (!(start && end)) {
    return null;
  }
  return [start, end];
}
```

- [ ] **Step 9: `isHeatmapGhostBin` — skip when no date**

```typescript
export function isHeatmapGhostBin(bin: HeatmapBin, range: HeatmapDisplayRange): boolean {
  if (bin.date == null) {
    return false;
  }
  // ... existing logic unchanged ...
}
```

- [ ] **Step 10: `rotateHeatmapColumnBins` — accept optional `weekStartDay`**

```typescript
export function rotateHeatmapColumnBins(
  columns: HeatmapColumn[],
  weekStartDay?: HeatmapWeekStartDay
): HeatmapColumn[] {
  if (weekStartDay == null || weekStartDay === 0) {
    return columns;
  }
  // ... existing logic unchanged ...
}
```

- [ ] **Step 11: `resolveHeatmapDisplayRange` — return null bounds when no dates**

```typescript
export function resolveHeatmapDisplayRange(columns: HeatmapColumn[]): HeatmapDisplayRange {
  if (columns.length === 0) {
    return { start: null, end: null };
  }
  const extent = getHeatmapTimeExtent(columns);
  if (!extent) {
    return { start: null, end: null };
  }
  // ... existing logic unchanged ...
}
```

- [ ] **Step 12: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: errors only in `heatmap-chart.tsx`, `heatmap-x-axis.tsx`, `heatmap-y-axis.tsx`, `heatmap-cells.tsx` — next task.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-utils.ts
git commit -m "refactor(heatmap): add null-safety guards for optional date fields"
```

---

### Task 2: HeatmapChart Generalization — Component Changes

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-chart.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-y-axis.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-cells.tsx`

**Interfaces:**
- Consumes: updated types from Task 1
- Produces: HeatmapChart with `rowLabels`/`columnLabels` props; XAxis/YAxis with label mode

#### heatmap-chart.tsx

- [ ] **Step 1: Add `rowLabels` to `HeatmapChartProps`**

```typescript
export interface HeatmapChartProps {
  // ... existing ...
  rowLabels?: string[];
}
```

- [ ] **Step 2: Auto-derive `columnLabels` from data, pass both to context**

In `HeatmapChartInner`, compute `resolvedColumnLabels` and pass to context:

```typescript
// Before the context value:
const resolvedColumnLabels = useMemo(() => {
  // columnLabels prop not added to props — auto-derive from data
  const hasAnyLabel = data.some((col) => col.columnLabel != null);
  if (!hasAnyLabel) return undefined;
  return data.map((col) => col.columnLabel ?? '');
}, [data]);
```

Add to context value:
```typescript
columnLabels: resolvedColumnLabels,
rowLabels,
```

- [ ] **Step 3: Make `timeXScale` conditional (return null when no dates)**

In `HeatmapChartInner`:

```typescript
const timeExtent = useMemo(() => getHeatmapTimeExtent(data), [data]);

const timeXScale = useMemo(() => {
  if (!timeExtent) {
    return null;
  }
  return scaleTime({
    domain: timeExtent,
    range: [0, innerWidth],
  });
}, [innerWidth, timeExtent]);
```

- [ ] **Step 4: Make `weekStartDay` conditional — pass through without default**

In `HeatmapChart` function component, remove `= 0` default for `weekStartDay`. In `HeatmapChartInner`, use `weekStartDay` as-is (undefined in label mode).

- [ ] **Step 5: Run CalendarHeatmap test to verify regression-free**

```bash
cd frontend && npx vitest run -- src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-chart.tsx
git commit -m "feat(heatmap): add rowLabels prop, auto-derive columnLabels, conditional timeXScale"
```

#### heatmap-x-axis.tsx

- [ ] **Step 7: Read `columnLabels` from context, add label mode**

```typescript
export const HeatmapXAxis = memo(function HeatmapXAxis({ className }: HeatmapXAxisProps) {
  const { containerRef, data, margin, xScale, columnLabels } = useHeatmap();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const labels = useMemo(() => {
    // Label mode
    if (columnLabels) {
      return columnLabels.map((label, columnIndex) => ({
        label,
        x: margin.left + xScale(columnIndex),
        key: `col-${columnIndex}`,
      })).filter((tick) => tick.label);
    }

    // Calendar mode (unchanged)
    const ticks: { label: string; x: number; key: string }[] = [];
    let lastMonthKey = '';
    for (let columnIndex = 0; columnIndex < data.length; columnIndex++) {
      const column = data[columnIndex];
      if (!column) continue;
      const monthAnchor = getHeatmapColumnMonthAnchor(column);
      if (!monthAnchor) continue;
      const monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
      if (monthKey === lastMonthKey) continue;
      ticks.push({
        label: monthFmt.format(monthAnchor),
        x: margin.left + xScale(columnIndex),
        key: monthKey,
      });
      lastMonthKey = monthKey;
    }
    return ticks;
  }, [columnLabels, data, margin.left, xScale]);

  // ... render portal unchanged ...
});
```

Update import to include `columnLabels` from context:
```typescript
const { containerRef, data, margin, xScale, columnLabels } = useHeatmap();
```

- [ ] **Step 8: Run CalendarHeatmap test + typecheck**

```bash
cd frontend && npx tsc --noEmit && npx vitest run -- src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx
```
Expected: zero errors, tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-x-axis.tsx
git commit -m "feat(heatmap): add label mode to XAxis using columnLabels from context"
```

#### heatmap-y-axis.tsx

- [ ] **Step 10: Read `rowLabels` from context, add label mode**

```typescript
export const HeatmapYAxis = memo(function HeatmapYAxis({
  className,
  tickFilter = 'odd',
  labelFormat = 'full',
  rowOpacity,
}: HeatmapYAxisProps) {
  const { containerRef, margin, binHeight, gap, yScale, rowLabels, weekStartDay } = useHeatmap();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const labels = useMemo(() => {
    if (rowLabels) {
      return rowLabels.map((label, row) => ({
        row,
        label,
        y: margin.top + yScale(row) + (binHeight - gap) / 2,
      }));
    }

    // Calendar mode (unchanged)
    return getHeatmapDayLabels(weekStartDay)
      .map((label, row) => ({
        row,
        label: formatHeatmapYAxisLabel(label, labelFormat),
        y: margin.top + yScale(row) + (binHeight - gap) / 2,
      }))
      .filter((tick) => shouldShowHeatmapYAxisTick(tick.row, tickFilter));
  }, [binHeight, gap, labelFormat, margin.top, rowLabels, tickFilter, weekStartDay, yScale]);

  // ... render portal unchanged ...
});
```

- [ ] **Step 11: Run CalendarHeatmap test + typecheck**

```bash
cd frontend && npx tsc --noEmit && npx vitest run -- src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx
```
Expected: zero errors, tests pass.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-y-axis.tsx
git commit -m "feat(heatmap): add label mode to YAxis using rowLabels from context"
```

#### heatmap-cells.tsx

- [ ] **Step 13: Handle optional date in tooltip — pass `bin.date` as-is**

```typescript
const handleCellEnter = useCallback(
  (column: number, row: number, bin: HeatmapBin, x: number, y: number) => {
    if (!cellsInteractive) return;
    setHoveredLegendLevel(null);
    setHoveredCell({ column, row });
    setTooltipData({
      column,
      row,
      count: bin.count,
      date: bin.date,     // optional — undefined when absent
      x: margin.left + x + binWidth / 2,
      y: margin.top + y + binHeight / 2,
    });
  },
  [binHeight, binWidth, cellsInteractive, margin.left, margin.top, setHoveredCell, setHoveredLegendLevel, setTooltipData]
);
```

- [ ] **Step 14: Run all heatmap tests**

```bash
cd frontend && npx vitest run -- src/components/charts/heatmap/ src/app/features/git-visualization/charts/CalendarHeatmap.test.tsx
```
Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-cells.tsx
git commit -m "fix(heatmap): handle optional date in cell tooltip data"
```

---

### Task 3: Mock Data — New Generators & Cleanup

**Files:**
- Modify: `frontend/src/app/features/git-visualization/data/gitVisMockData.ts`
- Modify: `frontend/src/app/features/git-visualization/data/gitVisMockData.test.ts`

**Interfaces:**
- Consumes: `HeatmapColumn`, `HeatmapBin` types
- Produces: `generateClockHeatmapData()`, `generateContributorActivityData()`, `generateContributorModuleData()`

#### gitVisMockData.ts

- [ ] **Step 1: Add `generateClockHeatmapData()`**

```typescript
export function generateClockHeatmapData(): HeatmapColumn[] {
  const columns: HeatmapColumn[] = [];
  let seed = 123;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let h = 0; h < 24; h++) {
    const bins: HeatmapBin[] = [];
    for (let d = 0; d < 7; d++) {
      let base: number;
      if (h >= 9 && h <= 18) {
        base = Math.floor(pseudoRandom() * 6) + 3;
      } else if (h >= 19 && h <= 23) {
        base = Math.floor(pseudoRandom() * 3);
      } else {
        base = Math.floor(pseudoRandom() * 2);
      }
      if (d === 0 || d === 6) {
        base = Math.floor(base * 0.3);
      }
      bins.push({ count: base, bin: d });
    }
    columns.push({ bin: h, bins, columnLabel: String(h) });
  }
  return columns;
}
```

- [ ] **Step 2: Add `generateContributorActivityData()`**

```typescript
export const contributorNames = ['Alex', 'Ben', 'Cara', 'Diana', 'Evan', 'Fiona'];
export const contributorTotalCommits = [45, 38, 27, 53, 19, 32];

export function generateContributorActivityData(): HeatmapColumn[] {
  const columns: HeatmapColumn[] = [];
  let seed = 456;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let w = 0; w < 48; w++) {
    const bins: HeatmapBin[] = [];
    for (let c = 0; c < contributorNames.length; c++) {
      const maxWeekly = Math.ceil(contributorTotalCommits[c] / 12);
      const count = Math.floor(pseudoRandom() * maxWeekly);
      bins.push({ count, bin: c });
    }
    columns.push({ bin: w, bins });
  }
  return columns;
}
```

- [ ] **Step 3: Add `generateContributorModuleData()`**

```typescript
export const moduleNames = ['前端', '后端', '数据库', '测试', '文档'];

export const contributorModuleMatrix: number[][] = [
  [80, 30,  0,  0,  0],
  [20, 70, 40,  0,  0],
  [ 0, 60,  0, 50,  0],
  [90,  0,  0,  0, 30],
  [ 0,  0, 80, 20,  0],
  [ 0,  0,  0, 40, 70],
];

export function generateContributorModuleData(): HeatmapColumn[] {
  return moduleNames.map((module, mi) => ({
    bin: mi,
    columnLabel: module,
    bins: contributorModuleMatrix.map((row, ci) => ({
      count: row[mi],
      bin: ci,
    })),
  }));
}
```

- [ ] **Step 4: Remove old exports**

Delete all of the following from `gitVisMockData.ts`:
- `clockHeatmapData` constant
- `contributorCommits`, `contributorAdded`, `contributorDeleted`
- `sankeyNodes`, `sankeyLinks`
- `toClockHeatmapData()`, `toContributorData()`, `toBklitSankeyData()`, `toBklitSankeyChartData()`
- `BklitHeatmapCell`, `BklitContributorRow`, `BklitSankeyNode`, `BklitSankeyLink`, `BklitSankeyNodeDatum`, `BklitSankeyLinkDatum`

Keep: `CommitNode`, `CommitEdge`, `commitNodes`, `commitEdges`, `allBranches`, `generateCalendarData`, `generateCodeLineEvolutionData`, `fileTreemapData`, `toBklitAreaData`, `toHeatmapColumns`, `mockCommitTimelineData`, `BklitAreaRow`, `CommitTimelineRow`, `contributorNames`.

- [ ] **Step 5: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: errors in `ContributorStats.tsx` and `CollabSankey.tsx` (to be deleted in Task 5) and `ClockHeatmap.tsx` (to be rewritten in Task 4).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/git-visualization/data/gitVisMockData.ts
git commit -m "feat(git-vis): add heatmap mock data generators, remove old sankey/bar data"
```

#### gitVisMockData.test.ts

- [ ] **Step 7: Update test**

Replace the entire file:

```typescript
import { describe, it, expect } from 'vitest';
import {
  toBklitAreaData,
  generateCodeLineEvolutionData,
  toHeatmapColumns,
  generateClockHeatmapData,
  generateContributorActivityData,
  generateContributorModuleData,
} from './gitVisMockData';

describe('bklit data adapters', () => {
  it('toBklitAreaData converts evolution data', () => {
    const result = toBklitAreaData(generateCodeLineEvolutionData());
    expect(result.length).toBe(40);
    expect(result[0]).toHaveProperty('date');
    expect(result[0]).toHaveProperty('added');
    expect(result[0]).toHaveProperty('deleted');
  });

  it('toHeatmapColumns converts calendar data to columns', () => {
    const result = toHeatmapColumns();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('bin');
    expect(result[0]).toHaveProperty('bins');
  });

  it('generateClockHeatmapData produces 24 columns × 7 rows with labels', () => {
    const result = generateClockHeatmapData();
    expect(result.length).toBe(24);
    expect(result[0].bins.length).toBe(7);
    expect(result[0]).toHaveProperty('columnLabel');
  });

  it('generateContributorActivityData has correct dimensions', () => {
    const result = generateContributorActivityData();
    expect(result.length).toBe(48);
    expect(result[0].bins.length).toBe(6);
  });

  it('generateContributorModuleData has correct dimensions', () => {
    const result = generateContributorModuleData();
    expect(result.length).toBe(5);
    expect(result[0].bins.length).toBe(6);
    expect(result[0]).toHaveProperty('columnLabel');
  });
});
```

- [ ] **Step 8: Run tests**

```bash
cd frontend && npx vitest run -- src/app/features/git-visualization/data/
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/features/git-visualization/data/gitVisMockData.test.ts
git commit -m "test(git-vis): update mock data tests for new heatmap generators"
```

---

### Task 4: New Chart Components

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.test.tsx`
- Rewrite: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Rewrite: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.test.tsx`

**Interfaces:**
- Consumes: `HeatmapChart`, `HeatmapCells`, `HeatmapXAxis`, `HeatmapYAxis`, `HeatmapTooltip`
- Produces: 3 working chart components

#### ContributorActivityHeatmap.tsx

- [ ] **Step 1: Create component**

```typescript
import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateContributorActivityData, contributorNames } from '../data/gitVisMockData';

export const ContributorActivityHeatmap = React.memo(function ContributorActivityHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => generateContributorActivityData(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        rowLabels={contributorNames}
        margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
        gap={2}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
```

- [ ] **Step 2: Create test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ContributorActivityHeatmap } from './ContributorActivityHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisContribution: 'contribution', gitVisContributions: 'contributions' },
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', text: '#1e293b', muted: '#94a3b8', grid: '#e2e8f0',
    tooltipBg: '#1e293b', tooltipText: '#f8fafc', background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'], heatmapColors: [],
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react'); const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

describe('ContributorActivityHeatmap', () => {
  it('renders SVG', () => {
    const { container } = render(<ContributorActivityHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd frontend && npx vitest run -- src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.tsx frontend/src/app/features/git-visualization/charts/ContributorActivityHeatmap.test.tsx
git commit -m "feat(git-vis): add ContributorActivityHeatmap component"
```

#### ContributorModuleHeatmap.tsx

- [ ] **Step 5: Create component**

```typescript
import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateContributorModuleData, contributorNames } from '../data/gitVisMockData';

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => generateContributorModuleData(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        rowLabels={contributorNames}
        margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
        gap={2}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
```

Note: `columnLabels` are auto-derived by HeatmapChart from `data[].columnLabel`.

- [ ] **Step 6: Create test** (same pattern as ContributorActivityHeatmap)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ContributorModuleHeatmap } from './ContributorModuleHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisContribution: 'contribution', gitVisContributions: 'contributions' },
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', text: '#1e293b', muted: '#94a3b8', grid: '#e2e8f0',
    tooltipBg: '#1e293b', tooltipText: '#f8fafc', background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'], heatmapColors: [],
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react'); const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

describe('ContributorModuleHeatmap', () => {
  it('renders SVG', () => {
    const { container } = render(<ContributorModuleHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test**

```bash
cd frontend && npx vitest run -- src/app/features/git-visualization/charts/ContributorModuleHeatmap.test.tsx
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.test.tsx
git commit -m "feat(git-vis): add ContributorModuleHeatmap component"
```

#### ClockHeatmap.tsx (rewrite)

- [ ] **Step 9: Rewrite ClockHeatmap to use HeatmapChart**

```typescript
import React, { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
} from '@/components/charts/heatmap';
import { generateClockHeatmapData } from '../data/gitVisMockData';

const DAY_LABELS: string[] = (() => {
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => dayFmt.format(new Date(2026, 0, 4 + i)));
})();

const HOUR_LABELS = [
  '0', '', '2', '', '4', '', '6', '', '8', '', '10', '',
  '12', '', '14', '', '16', '', '18', '', '20', '', '22', '',
];

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const { t } = useTCopy();
  const data = useMemo(() => generateClockHeatmapData(), []);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisCommits : t.gitVisCommits;
      return `${count} ${word}`;
    },
    [t]
  );

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <HeatmapChart
        data={data}
        rowLabels={DAY_LABELS}
        margin={{ top: 28, right: 16, bottom: 0, left: 40 }}
        gap={2}
        animate={true}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis />
        <HeatmapYAxis />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
    </div>
  );
});
```

Note: `columnLabels` are auto-derived by HeatmapChart from `data[].columnLabel` (each column has `columnLabel: String(h)` set in `generateClockHeatmapData()`).

- [ ] **Step 10: Rewrite clock heatmap test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ClockHeatmap } from './ClockHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisCommits: 'commits' },
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', text: '#1e293b', muted: '#94a3b8', grid: '#e2e8f0',
    tooltipBg: '#1e293b', tooltipText: '#f8fafc', background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'], heatmapColors: [],
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react'); const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

describe('ClockHeatmap', () => {
  it('renders SVG', () => {
    const { container } = render(<ClockHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run test**

```bash
cd frontend && npx vitest run -- src/app/features/git-visualization/charts/ClockHeatmap.test.tsx
```
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx frontend/src/app/features/git-visualization/charts/ClockHeatmap.test.tsx
git commit -m "feat(git-vis): rewrite ClockHeatmap to use generalized HeatmapChart"
```

---

### Task 5: Integration — GitVisualizationView, i18n, Cleanup

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Delete: `frontend/src/app/features/git-visualization/charts/ContributorStats.tsx`
- Delete: `frontend/src/app/features/git-visualization/charts/ContributorStats.test.tsx`
- Delete: `frontend/src/app/features/git-visualization/charts/CollabSankey.tsx`
- Delete: `frontend/src/app/features/git-visualization/charts/CollabSankey.test.tsx`
- Delete: `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` (unused — removed in original plan? No, let me keep it. Actually let me check...)

**Interfaces:**
- Consumes: all 3 new chart components from Task 4

#### GitVisualizationView.tsx

- [ ] **Step 1: Update imports and chart cards**

Replace old imports:
```typescript
import { CollabSankey } from './charts/CollabSankey';
import { ContributorStats } from './charts/ContributorStats';
```

With new:
```typescript
import { ContributorActivityHeatmap } from './charts/ContributorActivityHeatmap';
import { ContributorModuleHeatmap } from './charts/ContributorModuleHeatmap';
```

Replace the two chart card sections:
```typescript
<ChartCard title={t.gitVisContributorActivity} desc={t.gitVisContributorActivityDesc}>
  <ContributorActivityHeatmap />
</ChartCard>
<ChartCard title={t.gitVisCollaboration} desc={t.gitVisCollaborationDesc}>
  <ContributorModuleHeatmap />
</ChartCard>
```

Remove the old:
```typescript
<ChartCard title={t.gitVisContributorStats} desc={t.gitVisContributorStatsDesc}>
  <ContributorStats />
</ChartCard>
<ChartCard title={t.gitVisCollabSankey} desc={t.gitVisCollabSankeyDesc}>
  <CollabSankey />
</ChartCard>
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/GitVisualizationView.tsx
git commit -m "feat(git-vis): update GitVisualizationView with new heatmap chart imports"
```

#### i18n Updates

- [ ] **Step 4: Update zh-CN `changes.ts`**

Replace the old keys with new ones:

| Old | Remove | New | Add |
|-----|--------|-----|-----|
| `gitVisContributorStats` | Delete | `gitVisContributorActivity` | 贡献者活跃度 |
| `gitVisContributorStatsDesc` | Delete | `gitVisContributorActivityDesc` | 行=贡献者，列=时间，颜色越深提交越活跃。 |
| `gitVisCollabSankey` | Delete | `gitVisCollaboration` | 协作热力图 |
| `gitVisCollabSankeyDesc` | Delete | `gitVisCollaborationDesc` | 行=贡献者，列=模块，颜色越深贡献越多。单格深色=模块专精，多格暖色=跨模块贡献。 |
| | | `gitVisClockHeatmap` | Keep (unchanged) |
| | | `gitVisClockHeatmapDesc` | Keep (unchanged) |

- [ ] **Step 5: Update en-US `changes.ts`**

Same structure — replace old with new English keys.

- [ ] **Step 6: Update `GitVisualizationView.test.tsx` i18n mock**

In `GitVisualizationView.test.tsx`, replace the old i18n keys in the `useTCopy` mock:
- Replace `gitVisCollabSankey` → `gitVisCollaboration`
- Replace `gitVisContributorStats` → `gitVisContributorActivity`
- Replace `gitVisCollabSankeyDesc` → `gitVisCollaborationDesc`
- Replace `gitVisContributorStatsDesc` → `gitVisContributorActivityDesc`

- [ ] **Step 7: Update `LazyComponents.tsx` if needed** — check if it references any of the old chart names

```bash
cd frontend && rg "ContributorStats|CollabSankey" src/
```
Expected: only matches in the files to be deleted.

- [ ] **Step 8: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "fix(i18n): update git-visualization i18n keys for heatmap charts"
```

#### Delete Old Files

- [ ] **Step 10: Delete old chart files**

```bash
git rm frontend/src/app/features/git-visualization/charts/ContributorStats.tsx
git rm frontend/src/app/features/git-visualization/charts/ContributorStats.test.tsx
git rm frontend/src/app/features/git-visualization/charts/CollabSankey.tsx
git rm frontend/src/app/features/git-visualization/charts/CollabSankey.test.tsx
```

- [ ] **Step 11: Run full test suite**

```bash
cd frontend && npx vitest run
```
Expected: all pass.

- [ ] **Step 12: Run lint**

```bash
cd frontend && npx eslint .
```
Expected: zero warnings.

- [ ] **Step 13: Final typecheck**

```bash
cd frontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 14: Commit**

```bash
git commit -m "chore(git-vis): remove old ContributorStats and CollabSankey components"
```

---

## Spec Self-Review Checklist

After writing all tasks, verify:
- [ ] Every spec requirement has a corresponding task
- [ ] No "TBD", "TODO", "implement later" placeholders
- [ ] Type names and signatures are consistent across all tasks
- [ ] Mock data generators produce data in the expected `HeatmapColumn[]` format
- [ ] CalendarHeatmap is never modified — regression-free guarantee
- [ ] All new chart components follow the same pattern as CalendarHeatmap
