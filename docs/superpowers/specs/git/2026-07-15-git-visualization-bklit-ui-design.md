# Git Visualization: bklit-ui Migration Design

**Date**: 2026-07-15
**Status**: Approved Design

## Overview

Replace all 7 ECharts-powered Git visualization charts with bklit-ui components (built on visx) for visual consistency, reduced bundle size, and better interactivity.

## Approach

**Approach A**: 6 standard charts use bklit-ui components directly; 1 chart (CommitGraph) uses custom visx rendering. ECharts is fully removed.

## Architecture

### Directory Structure

```
frontend/src/
├── styles/
│   ├── index.css                 # Main entry (unchanged)
│   ├── tailwind.css              # NEW: Tailwind 4 entry
├── components/
│   └── ui/                       # NEW: shadcn/ui + bklit-ui components
├── app/
│   └── features/git-visualization/
│       ├── index.ts              # barrel (updated)
│       ├── GitVisualizationView.tsx       # Rewritten with bklit components
│       ├── GitVisualizationView.test.tsx  # Updated
│       ├── charts/
│       │   ├── CodeLineEvo.tsx           # bklit AreaChart
│       │   ├── ContributorStats.tsx      # bklit ComposedChart
│       │   ├── CollabSankey.tsx          # bklit SankeyChart
│       │   ├── ClockHeatmap.tsx          # bklit HeatmapChart
│       │   ├── CalendarHeatmap.tsx       # bklit HeatmapChart
│       │   ├── FileSunburst.tsx          # bklit SunburstChart
│       │   └── CommitTimeline.tsx        # visx custom
│       ├── hooks/
│       │   ├── useBklitTheme.ts          # NEW: theme bridge
│       │   ├── useECharts.ts             # REMOVED
│       │   └── useChartTheme.ts          # REMOVED
│       ├── data/
│       │   └── gitVisMockData.ts         # Adapted for bklit data shapes
│       ├── utils/
│       │   ├── branchColor.ts            # Kept
│       │   └── hslToHex.ts               # Kept
│       └── echartsSetup.ts               # REMOVED
```

### Tailwind + Existing CSS Coexistence

- `tailwind.css` is a standalone entry imported alongside existing CSS in `index.html`
- Tailwind classes exist only inside `src/components/ui/` (shadcn/bklit components)
- Existing CSS untouched, no conflict risk
- Dark mode bridge: `useResolvedTheme()` syncs `class="dark"` on `<html>` for Tailwind dark variant

## Component Mapping

| Old ECharts Component | bklit-ui Component | Notes |
|---|---|---|
| `CodeLineEvolution.tsx` | `AreaChart` | curveType: monotone, showGradient |
| `ContributorStats.tsx` | `ComposedChart` | Mixed bar + line, dual Y-axis |
| `CollabSankey.tsx` | `SankeyChart` | Native data format match |
| `ClockHeatmap.tsx` | `HeatmapChart` | day-of-week × hour grid |
| `CalendarHeatmap.tsx` | `HeatmapChart` | Week × weekday grid (not calendar-style) |
| `FileTreemap.tsx` | `SunburstChart` | Hierarchical data, arcSize: relative |
| `CommitGraph.tsx` | **visx custom** | See CommitTimeline section |

## CommitTimeline (visx Custom)

### Design
- Vertical timeline: Y-axis = time, X-axis = branch lanes
- Circle nodes = regular commits, diamond nodes = merge commits
- Bezier curves for parent-child edges via `@visx/shape`
- Colors from `getBranchColor()`
- Hover tooltip shows commit message, author, date

### Dependencies
- `@visx/shape`, `@visx/group`, `@visx/scale`, `@visx/event`, `@visx/tooltip`
- No dagre or external layout library (manual layout for <50 nodes)

## Theme Bridge (`useBklitTheme`)

Reads `useResolvedTheme()` → returns a BklitTheme palette object (colors, grid styles, tooltip bg) that bklit-ui components consume. Matches the existing light/dark color tokens.

## Build Changes

### Dependencies
- **Add**: `tailwindcss@^4`, `@tailwindcss/vite`, `@visx/shape`, `@visx/group`, `@visx/scale`, `@visx/event`, `@visx/tooltip`
- **Remove**: `echarts@^6.1.0`
- net bundle impact: **~-50KB gzip**

### Vite Config
- Add `tailwindcss()` plugin
- Remove `vendor-echarts` manual chunk rule

## Files Changed

**New** (~10 files): `tailwind.css`, `components.json`, `components/ui/*` (bklit registry), `useBklitTheme.ts`, `CommitTimeline.tsx`
**Modified** (~8 files): `GitVisualizationView.tsx`, all 6 chart components, `gitVisMockData.ts`, `index.ts`, `GitVisualizationView.test.tsx`
**Removed** (12 files): `echartsSetup.ts`, `useECharts.ts`, `useECharts.test.ts`, `useChartTheme.ts`, `useChartTheme.test.ts`, all 7 old chart components

## Testing

| Layer | Scope | Tool |
|---|---|---|
| Unit | useBklitTheme, data adapters, branchColor | Vitest |
| Component | Each bklit chart renders correct data; CommitTimeline nodes/edges | Vitest + testing-library |
| Integration | GitVisualizationView toggle show/hide, lazy loading | Vitest |
| Visual | 7 charts in light/dark mode | Manual |

## Acceptance Criteria

1. `pnpm run lint` — zero warnings
2. `pnpm run typecheck` — zero errors
3. `pnpm test` — all pass
4. 7 charts render correctly in both light and dark themes
5. CommitTimeline hover tooltip works
6. ECharts chunk fully removed from bundle
