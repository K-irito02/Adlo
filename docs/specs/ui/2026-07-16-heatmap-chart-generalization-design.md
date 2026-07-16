# HeatmapChart Generalization Design

**Date**: 2026-07-16
**Status**: Approved Design

## Overview

Generalize the existing bklit-ui `HeatmapChart` to support both calendar-style heatmaps (current use: `CalendarHeatmap`) and generic 2D grid heatmaps (new use: contributor activity, contributor-module collaboration, and commit time distribution). Replace `ContributorStats` (bar chart), `CollabSankey` (sankey diagram), and `ClockHeatmap` (custom @visx SVG) with HeatmapChart-based components. After this change, all 4 heatmap-type charts in git-visualization share a single reusable HeatmapChart backend.

## Motivation

- Bar charts don't scale to 50+ contributors (too many bars, cluttered)
- Sankey diagrams become unreadable beyond 10-15 nodes (crossing links)
- Heatmaps solve both: space-efficient, color = third dimension, pattern recognition at a glance
- `ClockHeatmap` already renders a 24×7 grid — conceptually a heatmap, but currently implemented with hand-written @visx/scale SVG (no tooltip animation, no hover dimming, no loading states, no theme integration)
- Unifying all heatmap rendering under one generalized component eliminates duplicate code, ensures consistent UX across all 4 heatmap charts, and makes future heatmap variants a zero-effort addition

## Data Layer Changes

### `heatmap-context.tsx`

```typescript
interface HeatmapBin {
  count: number;
  bin: number;
  date?: Date;                     // ← was required, now optional
}

interface HeatmapColumn {
  bin: number;
  bins: HeatmapBin[];
  columnLabel?: string;            // ← NEW: custom column label
}

interface HeatmapContextValue {
  // ... existing fields (unchanged except as noted) ...
  rowLabels?: string[];            // ← NEW: custom row labels
  columnLabels?: string[];
  timeXScale: ... | null;          // ← null when no dates
  weekStartDay?: HeatmapWeekStartDay;  // ← optional
  separatorLayout: ... | null;     // ← unchanged (already nullable)
}

interface HeatmapTooltipData {
  // ... existing fields ...
  date?: Date;                     // ← now optional
}
```

### `heatmap-utils.ts`

All date-dependent functions gain null-safety guards:
- `filterHeatmapColumns` — when no dates, return columns as-is (no date-based filtering)
- `getHeatmapTimeExtent` — return `null` when no column has dates
- `resolveHeatmapDisplayRange` — return `{ start: null, end: null }` when no dates
- `isHeatmapGhostBin` — return `false` when `bin.date` is undefined
- `rotateHeatmapColumnBins` — skip when `weekStartDay` is undefined
- `getHeatmapContributionLevel` — unchanged (value-to-level mapping is data-agnostic)

## Component Changes

### `heatmap-chart.tsx`

**New props**:
```typescript
rowLabels?: string[];
columnLabels?: string[];
```

**Conditional logic**:
- `timeXScale` computed only when data contains dates (check `getHeatmapTimeExtent`)
- `weekStartDay` defaults to `undefined` (calendar mode only when explicitly set)
- `rotateHeatmapColumnBins` only called when `weekStartDay != null`
- Pass `rowLabels`/`columnLabels` through context

### `heatmap-x-axis.tsx`

Two modes, auto-selected:

| Mode | Trigger | Behavior |
|------|---------|----------|
| Calendar | `columnLabels` not provided | Existing: month abbreviations from `column.date` |
| Label | `columnLabels` provided | Show `columnLabels[columnIndex]` directly |

### `heatmap-y-axis.tsx`

Two modes, auto-selected:

| Mode | Trigger | Behavior |
|------|---------|----------|
| Calendar | `rowLabels` not provided | Existing: weekday names, `tickFilter` default `'odd'` |
| Label | `rowLabels` provided | Show `rowLabels[rowIndex]`, `tickFilter` default `'all'` |

### `heatmap-cells.tsx`

- Tooltip: when `bin.date` is present, show date (existing); when absent, show row/column label
- Ghost cell detection: skip when no date data

### Unchanged Files

`HeatmapSeparator`, `HeatmapTooltip`, `HeatmapLegend`, `HeatmapPatternDefs`, `heatmap-colors.ts`, `heatmap-animation.ts` — zero changes.

## Reusable & Extensible Design

After generalization, `HeatmapChart` becomes a single reusable component for any 2D grid heatmap. Adding a new heatmap chart requires only:

1. Produce data in `HeatmapColumn[]` format
2. Pass the appropriate `rowLabels`/`columnLabels`

No modification to `HeatmapChart`, its context, or its child components.

```
HeatmapChart
├── 日历模式（date + weekStartDay）
│   └── CalendarHeatmap         ← 已有，无改动
├── 标签行模式（rowLabels）
│   ├── ContributorActivityHeatmap  ← 新增（替换柱状图）
│   └── ClockHeatmap             ← 改写（替换手写 @visx SVG）
└── 标签行列模式（rowLabels + columnLabels）
    └── ContributorModuleHeatmap    ← 新增（替换桑基图）
```

## New Git Visualization Components

### `ContributorActivityHeatmap.tsx`

Replaces `ContributorStats.tsx` (bar chart).

| Dimension | Mapping |
|-----------|---------|
| Rows | Contributors (sorted by total commits descending) |
| Columns | Time periods (weeks) |
| Color | Commits in that period |

- Uses HeatmapChart with `rowLabels` = `contributorNames`

### `ContributorModuleHeatmap.tsx`

Replaces `CollabSankey.tsx` (sankey diagram).

| Dimension | Mapping |
|-----------|---------|
| Rows | Contributors |
| Columns | Modules |
| Color | Contribution volume (lines/commits) |

- Uses HeatmapChart with `rowLabels` = `contributorNames`, `columnLabels` = `moduleNames`
- No date dependency — pure 2D grid

**Reading the collaboration heatmap**:
- A row with one deep cell = silo developer (single module specialist)
- A row with many warm cells = full-stack developer (cross-module contributor)
- A column with many deep cells = core module (many contributors)

### `ClockHeatmap.tsx` (rewrite)

Rewrites the existing custom @visx SVG into a HeatmapChart. No visual change — same 24×7 grid.

| Dimension | Mapping |
|-----------|---------|
| Rows | Days of week (7 rows, `rowLabels` = `["Sun","Mon",...]`) |
| Columns | Hours (24 columns, `columnLabels` = `["0","","2",...]`) |
| Color | Commit count for that hour+day |

**Benefits of migration**:
- Inherits bklit-ui tooltip animation (slide-in, debounce)
- Inherits hover dimming (inactive cells fade to 0.3 opacity)
- Inherits enter animation (wave stagger from left)
- Inherits loading shimmer state
- Consistent tooltip styling with other charts
- One less bespoke SVG component to maintain

## Mock Data

### `gitVisMockData.ts`

**New / modified generators**:
```typescript
// Clock × Day: 24 hours × 7 days
// Replaces old toClockHeatmapData() → {x,y,value}[]
generateClockHeatmapData(): HeatmapColumn[]

// Contributor × Week: 6 contributors × 52 weeks
generateContributorActivityData(): HeatmapColumn[]

// Contributor × Module: 6 contributors × 8 modules
generateContributorModuleData(): HeatmapColumn[]
```

**Removed**: `toClockHeatmapData()` (old flat format), `sankeyNodes`/`sankeyLinks`, `contributorNames`/`contributorCommits` (flat bar data), related adapters.

## i18n Updates

Update `changes.ts` (zh-CN + en-US):

| Key | zh-CN | en-US |
|-----|-------|-------|
| `gitVisContributorActivity` | 贡献者活跃度 | Contributor Activity |
| `gitVisContributorActivityDesc` | 行=贡献者，列=时间，颜色越深提交越活跃 | Rows=contributors, columns=time, darker=more active |
| `gitVisContributorModule` | 协作热力图 | Collaboration Heatmap |
| `gitVisCollaborationDesc` | 行=贡献者，列=模块，颜色越深贡献越多。单格深色=模块专精，多格暖色=跨模块贡献 | Rows=contributors, columns=modules, darker=more contributions. Single deep cell=specialist, multiple warm cells=full-stack |

Remove old keys: `gitVisContributorStats`, `gitVisCollabSankey` (and their desc keys).

## File Change Summary

| Operation | Files |
|-----------|-------|
| **Modify** | `heatmap-context.tsx`, `heatmap-chart.tsx`, `heatmap-x-axis.tsx`, `heatmap-y-axis.tsx`, `heatmap-cells.tsx`, `heatmap-utils.ts` |
| **Create** | `git-visualization/charts/ContributorActivityHeatmap.tsx`, `git-visualization/charts/ContributorModuleHeatmap.tsx` |
| **Rewrite** | `git-visualization/charts/ClockHeatmap.tsx` (custom @visx → HeatmapChart), `ClockHeatmap.test.tsx` |
| **Delete** | `git-visualization/charts/ContributorStats.tsx`, `git-visualization/charts/CollabSankey.tsx` |
| **Update** | `gitVisMockData.ts`, `GitVisualizationView.tsx`, `index.ts` (barrel), i18n `changes.ts` (zh-CN + en-US) |
| **Test delete** | `ContributorStats.test.tsx`, `CollabSankey.test.tsx` |
| **Test create** | `ContributorActivityHeatmap.test.tsx`, `ContributorModuleHeatmap.test.tsx` |
| **Test update** | `gitVisMockData.test.ts` |

## Testing

| Scope | Coverage |
|-------|----------|
| HeatmapChart | New props: rowLabels, columnLabels; date-optional modes |
| HeatmapXAxis | Calendar mode (unchanged), label mode (new) |
| HeatmapYAxis | Calendar mode (unchanged), label mode (new) |
| ClockHeatmap (rewrite) | Renders 24×7 cells, tooltip shows hour+day+count, no visual regression |
| ContributorActivityHeatmap | Renders correct row count, colors match commit density |
| ContributorModuleHeatmap | Renders correct row/column count, cell tooltip shows contributor & module |
| gitVisMockData | New adapters produce correct shapes |
| GitVisualizationView | Lazy loading still works, 7 cards still render (2 replaced, 1 rewritten) |

## Acceptance Criteria

1. `pnpm run lint` — zero warnings
2. `pnpm run typecheck` — zero errors
3. `pnpm test` — all pass (updated + new tests)
4. Existing `CalendarHeatmap` renders identically (regression-free)
5. `ClockHeatmap` renders identically to before (no visual regression — same 24×7 grid, but with bklit-ui tooltip/hover/animation)
6. New `ContributorActivityHeatmap` and `ContributorModuleHeatmap` render in both light/dark themes
7. Tooltips show correct data on all 4 heatmap charts
8. Hover dimming works on all 4 heatmap charts
