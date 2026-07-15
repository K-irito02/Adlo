# Git Visualization bklit-ui Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 7 ECharts Git visualization charts with bklit-ui components + 1 custom visx CommitGraph, removing ECharts entirely.

**Architecture:** Tailwind CSS 4 + shadcn/ui added alongside existing pure CSS. bklit-ui (shadcn registry) provides 6 chart components. `@visx/*` packages provide the custom CommitGraph. A `useBklitTheme` hook bridges the existing light/dark theme system to bklit-ui's Tailwind dark variant.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4, shadcn/ui, bklit-ui, visx, Vitest

## Global Constraints

- Pure CSS styling system untouched — Tailwind used only inside `src/components/ui/`
- Data layer (`gitVisMockData.ts`) stays as single source of truth; adapters convert to bklit data shapes
- Light/dark theme integration via `useBklitTheme` hook — no CSS var overrides in chart components
- All chart containers maintain 340px height (`.adl-git-vis__chart` class)
- Lazy loading preserved (`LazyGitVisualizationView`)
- i18n keys preserved (English + Chinese)
- `pnpm` package manager throughout

---

### Task 1: Tailwind 4 + shadcn/ui Infrastructure

**Files:**
- Create: `frontend/src/styles/tailwind.css`
- Create: `frontend/components.json`
- Create: `frontend/src/components/ui/` (directory placeholder)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json` and `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing Vite/React/Tailwind v4 compatibility
- Produces: project configured for shadcn/ui + Tailwind 4, ready for bklit-ui registry

- [ ] **Step 1: Install Tailwind CSS 4 + shadcn/ui**

```bash
cd ai-digital-life/frontend
pnpm add tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
```

This creates `components.json` at the frontend root and adds shadcn config.

- [ ] **Step 2: Create tailwind.css entry**

```css
/* src/styles/tailwind.css */
@import "tailwindcss";

/* bklit-ui components use Tailwind for internal styling only */
```

- [ ] **Step 3: Update vite.config.ts — add Tailwind plugin, add `@/` alias for shadcn, remove ECharts chunk rule**

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(), // ADD
    react(),
    // ...
  ],
  resolve: {
    alias: {
      // ... existing aliases (unchanged) ...
      "@root": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/app/components"),
      // ADD @/ alias for shadcn/ui components
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // REMOVE: if (id.includes('echarts')) return 'vendor-echarts'
          // keep other chunk rules
          if (id.includes('react-window')) return 'vendor-react-window'
          // ...
        },
      },
    },
  },
})
```

Also update `tsconfig.json` to add the `@/` path alias.

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      // ... existing paths
    }
  }
}
```

- [ ] **Step 4: Add dark mode class bridge to root component**

In the app root or ThemeController, add a `useEffect` to sync `resolvedTheme` to `class="dark"`:

```typescript
// Location: existing ThemeController or _app.tsx equivalent
useEffect(() => {
  const classList = document.documentElement.classList
  if (resolvedTheme === 'dark') {
    classList.add('dark')
  } else {
    classList.remove('dark')
  }
}, [resolvedTheme])
```

- [ ] **Step 5: Verify build works**

```bash
cd ai-digital-life/frontend
pnpm run build
```

Expected: Build succeeds, `tailwind.css` compiles correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/vite.config.ts frontend/src/styles/tailwind.css frontend/components.json
git commit -m "chore: add Tailwind CSS 4 and shadcn/ui infrastructure"
```

---

### Task 2: Theme Bridge — useBklitTheme Hook

**Files:**
- Create: `frontend/src/app/features/git-visualization/hooks/useBklitTheme.ts`
- Create: `frontend/src/app/features/git-visualization/hooks/useBklitTheme.test.ts`

**Interfaces:**
- Consumes: `useResolvedTheme()` from existing theme system → `'light' | 'dark'`
- Produces: `BklitTheme` object with palette for bklit-ui components

- [ ] **Step 1: Write the failing test**

```typescript
// useBklitTheme.test.ts
import { renderHook } from '@testing-library/react'
import { useBklitTheme } from './useBklitTheme'

describe('useBklitTheme', () => {
  it('returns light palette when resolved theme is light', () => {
    vi.mock('@hooks/useResolvedTheme', () => ({
      useResolvedTheme: () => 'light',
    }))
    const { result } = renderHook(() => useBklitTheme())
    expect(result.current.accent).toBe('#3b82f6')
    expect(result.current.background).toBe('#ffffff')
  })

  it('returns dark palette when resolved theme is dark', () => {
    vi.mock('@hooks/useResolvedTheme', () => ({
      useResolvedTheme: () => 'dark',
    }))
    const { result } = renderHook(() => useBklitTheme())
    expect(result.current.accent).toBe('#60a5fa')
    expect(result.current.background).toBe('#1a1a2e')
  })

  it('provides all required BklitTheme properties', () => {
    vi.mock('@hooks/useResolvedTheme', () => ({
      useResolvedTheme: () => 'light',
    }))
    const { result } = renderHook(() => useBklitTheme())
    const keys: (keyof BklitTheme)[] = [
      'accent', 'background', 'text', 'muted',
      'grid', 'tooltipBg', 'tooltipText',
      'heatmapColors', 'seriesColors',
    ]
    for (const key of keys) {
      expect(result.current).toHaveProperty(key)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ai-digital-life/frontend
pnpm vitest run -- src/app/features/git-visualization/hooks/useBklitTheme.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// useBklitTheme.ts
import { useMemo } from 'react'
import { useResolvedTheme } from '@hooks/useResolvedTheme'

export interface BklitTheme {
  accent: string
  background: string
  text: string
  muted: string
  grid: string
  tooltipBg: string
  tooltipText: string
  heatmapColors: string[]
  seriesColors: string[]
}

const LIGHT_THEME: BklitTheme = {
  accent: '#3b82f6',
  background: '#ffffff',
  text: '#1e293b',
  muted: '#94a3b8',
  grid: '#e2e8f0',
  tooltipBg: '#1e293b',
  tooltipText: '#f8fafc',
  heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
  seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
}

const DARK_THEME: BklitTheme = {
  accent: '#60a5fa',
  background: '#1a1a2e',
  text: '#e2e8f0',
  muted: '#64748b',
  grid: '#334155',
  tooltipBg: '#f8fafc',
  tooltipText: '#1e293b',
  heatmapColors: ['#1e293b', '#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa'],
  seriesColors: ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'],
}

export function useBklitTheme(): BklitTheme {
  const resolvedTheme = useResolvedTheme()
  return useMemo(() => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME), [resolvedTheme])
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ai-digital-life/frontend
pnpm vitest run -- src/app/features/git-visualization/hooks/useBklitTheme.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/hooks/useBklitTheme.ts frontend/src/app/features/git-visualization/hooks/useBklitTheme.test.ts
git commit -m "feat(git-visualization): add useBklitTheme theme bridge hook"
```

---

### Task 3: Install bklit-ui Chart Components

**Files:**
- Create: `frontend/src/components/ui/chart.tsx`
- Create: `frontend/src/components/ui/area-chart.tsx`
- Create: `frontend/src/components/ui/composed-chart.tsx`
- Create: `frontend/src/components/ui/heatmap-chart.tsx`
- Create: `frontend/src/components/ui/sunburst-chart.tsx`
- Create: `frontend/src/components/ui/sankey-chart.tsx`
- Modify: `frontend/components.json` (add bklit registry namespace)

**Interfaces:**
- Consumes: bklit-ui shadcn registry
- Produces: chart components under `src/components/ui/` ready to use in git visualization

- [ ] **Step 1: Configure bklit registry in components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/tailwind.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  },
  "registries": {
    "@bklit": "https://ui.bklit.com/r/{name}.json"
  }
}
```

- [ ] **Step 2: Install bklit-ui chart components**

```bash
cd ai-digital-life/frontend
npx shadcn@latest add @bklit/area-chart
npx shadcn@latest add @bklit/composed-chart
npx shadcn@latest add @bklit/heatmap-chart
npx shadcn@latest add @bklit/sunburst-chart
npx shadcn@latest add @bklit/sankey-chart
```

This copies each component into `src/components/ui/` with its full source.

- [ ] **Step 3: Verify components import correctly**

```typescript
// Quick verification — can be removed after
import { AreaChart } from '@/components/ui/area-chart'
import { ComposedChart } from '@/components/ui/composed-chart'
import { HeatmapChart } from '@/components/ui/heatmap-chart'
import { SunburstChart } from '@/components/ui/sunburst-chart'
import { SankeyChart } from '@/components/ui/sankey-chart'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components.json frontend/src/components/ui/
git commit -m "feat: install bklit-ui chart components via shadcn registry"
```

---

### Task 4: Adapt Mock Data for bklit Data Shapes

**Files:**
- Modify: `frontend/src/app/features/git-visualization/data/gitVisMockData.ts`

**Interfaces:**
- Consumes: existing mock data generation code
- Produces: re-exported data shapes compatible with bklit-ui component APIs

- [ ] **Step 1: Write data adapter tests**

The existing mock data stays as-is; add adapter functions that transform data shapes. Write tests for each adapter:

```typescript
// Add to gitVisMockData.test.ts
import { toBklitAreaData, toBklitSankeyData, toBklitHeatmapData } from './gitVisMockData'

describe('bklit data adapters', () => {
  it('toBklitAreaData converts cumulative evolution data to xKey/yKey format', () => {
    const result = toBklitAreaData(generateCodeLineEvolutionData())
    expect(result[0]).toHaveProperty('week')
    expect(result[0]).toHaveProperty('added')
    expect(result[0]).toHaveProperty('deleted')
  })
})
```

- [ ] **Step 2: Add adapter functions to gitVisMockData.ts**

```typescript
// Appended to gitVisMockData.ts

// --- bklit-ui data adapters ---

export interface BklitAreaRow {
  date: string
  added: number
  deleted: number
}

/** generateCodeLineEvolutionData returns {dates[], added[], deleted[]} — convert to row array */
export function toBklitAreaData(raw: ReturnType<typeof generateCodeLineEvolutionData>): BklitAreaRow[] {
  return raw.dates.map((date, i) => ({
    date,
    added: raw.added[i],
    deleted: raw.deleted[i],
  }))
}

export interface BklitSankeyNode {
  id: string
  label: string
}

export interface BklitSankeyLink {
  source: string
  target: string
  value: number
}

/** sankeyNodes has {name} format. Sankey expects nodes with id/label. */
export function toBklitSankeyData(): { nodes: BklitSankeyNode[]; links: BklitSankeyLink[] } {
  return {
    nodes: sankeyNodes.map(n => ({ id: n.name, label: n.name })),
    links: sankeyLinks,
  }
}

export interface BklitHeatmapCell {
  x: string | number
  y: string | number
  value: number
}

/** clockHeatmapData is [hour, day, count][] — convert to {x, y, value}[] */
export function toClockHeatmapData(): BklitHeatmapCell[] {
  return clockHeatmapData.map(([hour, day, count]) => ({
    x: hour,
    y: day,
    value: count,
  }))
}

/** generateCalendarData returns [dateStr, count][] — convert to {x, y, value}[] */
export function toCalendarHeatmapData(): BklitHeatmapCell[] {
  return generateCalendarData().map(([dateStr, count]) => {
    const d = new Date(dateStr)
    return {
      x: d.getDay(),       // day of week (0=Sun)
      y: getWeekNumber(d), // week of year
      value: count,
    }
  })
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - start.getTime()
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7)
}

export interface BklitContributorRow {
  name: string
  commits: number
  added: number
  deleted: number
}

export function toContributorData(): BklitContributorRow[] {
  return contributorNames.map((name, i) => ({
    name,
    commits: contributorCommits[i],
    added: contributorAdded[i],
    deleted: contributorDeleted[i],
  }))
}
```

- [ ] **Step 3: Run tests**

```bash
cd ai-digital-life/frontend
pnpm vitest run -- src/app/features/git-visualization/
```

Expected: all existing tests + new adapter tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/data/gitVisMockData.ts
git commit -m "feat(git-visualization): add bklit-ui data adapters to mock data"
```

---

### Task 5: CodeLineEvo — visx AreaClosed

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/CodeLineEvo.test.tsx`

**Interfaces:**
- Consumes: `toBklitAreaData()` from Task 4, `useBklitTheme()` from Task 2
- Produces: self-contained chart component using visx AreaClosed

- [ ] **Step 1: Write test**

```typescript
// CodeLineEvo.test.tsx
import { render, screen } from '@testing-library/react'
import { CodeLineEvo } from './CodeLineEvo'

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    text: '#1e293b',
    muted: '#94a3b8',
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
    background: '#ffffff',
    seriesColors: ['#3b82f6', '#ef4444'],
    heatmapColors: [],
  }),
}))

describe('CodeLineEvo', () => {
  it('renders without crashing', () => {
    const { container } = render(<CodeLineEvo />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write component using visx**

```typescript
// CodeLineEvo.tsx
import React, { useMemo } from 'react'
import { AreaClosed, LinePath } from '@visx/shape'
import { Group } from '@visx/group'
import { scaleTime, scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GradientTealBlue } from '@visx/gradient'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { generateCodeLineEvolutionData, toBklitAreaData } from '../data/gitVisMockData'

const WIDTH = 600
const HEIGHT = 300
const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 }

export const CodeLineEvo = React.memo(function CodeLineEvo() {
  const theme = useBklitTheme()
  const data = useMemo(() => toBklitAreaData(generateCodeLineEvolutionData()), [])

  const xScale = useMemo(() => scaleLinear({
    domain: [0, data.length - 1],
    range: [MARGIN.left, WIDTH - MARGIN.right],
  }), [data.length])

  const yScale = useMemo(() => scaleLinear({
    domain: [0, Math.max(...data.map(d => Math.max(d.added, d.deleted))) * 1.1],
    range: [HEIGHT - MARGIN.bottom, MARGIN.top],
  }), [data])

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <GradientTealBlue id="area-gradient" />
        <AreaClosed
          data={data}
          x={(d, i) => xScale(i) ?? 0}
          y={d => yScale(d.added)}
          yScale={yScale}
          fill="url(#area-gradient)"
        />
        <LinePath
          data={data}
          x={(d, i) => xScale(i) ?? 0}
          y={d => yScale(d.deleted)}
          stroke={theme.seriesColors[1]}
          strokeWidth={2}
        />
        <AxisBottom top={HEIGHT - MARGIN.bottom} scale={xScale} tickFormat={i => data[i]?.date ?? ''} />
      </svg>
    </div>
  )
})
```

- [ ] **Step 3: Run tests & commit**

---

### Task 6: ContributorStats — visx BarGroup + LinePath

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/ContributorStats.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/ContributorStats.test.tsx`

**Interfaces:**
- Consumes: `toContributorData()` from Task 4, `useBklitTheme()` from Task 2
- Produces: self-contained chart component with bar + dual line series

Use visx `BarGroup` for commit counts and `LinePath` for added/deleted lines.

- [ ] **Step 1: Write test** (similar to Task 5 pattern)

- [ ] **Step 2: Write component using visx**

```typescript
// ContributorStats.tsx
import React, { useMemo } from 'react'
import { BarGroup } from '@visx/shape'
import { Group } from '@visx/group'
import { scaleBand, scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft, AxisRight } from '@visx/axis'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { toContributorData } from '../data/gitVisMockData'

const WIDTH = 600; const HEIGHT = 300; const MARGIN = { top: 20, right: 80, bottom: 40, left: 60 }

export const ContributorStats = React.memo(function ContributorStats() {
  const theme = useBklitTheme()
  const data = useMemo(() => toContributorData(), [])

  const x0Scale = useMemo(() => scaleBand({ domain: data.map(d => d.name), range: [MARGIN.left, WIDTH - MARGIN.right], padding: 0.2 }), [data])
  const keys = ['commits', 'added', 'deleted']
  const yScale = useMemo(() => scaleLinear({ domain: [0, Math.max(...data.map(d => d.commits)) * 1.2], range: [HEIGHT - MARGIN.bottom, MARGIN.top] }), [data])

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <BarGroup
          data={data}
          keys={keys}
          height={HEIGHT - MARGIN.bottom - MARGIN.top}
          x0={d => d.name}
          x0Scale={x0Scale}
          yScale={yScale}
          color={(key) => key === 'commits' ? theme.accent : key === 'added' ? '#10b981' : '#ef4444'}
        />
        <AxisBottom top={HEIGHT - MARGIN.bottom} scale={x0Scale} />
        <AxisLeft scale={yScale} />
      </svg>
    </div>
  )
})
```

- [ ] **Step 3: Run tests & commit**

---

### Task 7: CollabSankey — visx Sankey

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/CollabSankey.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/CollabSankey.test.tsx`

Uses `@visx/sankey` with data from `toBklitSankeyData()`.

```typescript
// CollabSankey.tsx
import React, { useMemo } from 'react'
import { Sankey, sankeyLinkHorizontal } from '@visx/sankey'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { toBklitSankeyData } from '../data/gitVisMockData'

const WIDTH = 600; const HEIGHT = 300

export const CollabSankey = React.memo(function CollabSankey() {
  const theme = useBklitTheme()
  const { nodes, links } = useMemo(() => toBklitSankeyData(), [])

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Sankey
          root={{ nodes, links }}
          nodeWidth={20}
          nodePadding={10}
          size={[WIDTH, HEIGHT]}
        >
          {({ graph }) => (
            <>
              {graph.nodes.map((node, i) => (
                <rect key={i} x={node.x0} y={node.y0} width={node.x1 - node.x0} height={node.y1 - node.y0} fill={theme.accent} />
              ))}
              {graph.links.map((link, i) => (
                <path key={i} d={sankeyLinkHorizontal(link)} stroke={theme.muted} strokeWidth={Math.max(1, link.width ?? 1)} fill="none" />
              ))}
            </>
          )}
        </Sankey>
      </svg>
    </div>
  )
})
```

---

### Task 8: ClockHeatmap + CalendarHeatmap — visx HeatmapRect (×2)

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`
- Create: tests for both

Use `@visx/heatmap` (HeatmapRect) with data from `toClockHeatmapData()` / `toCalendarHeatmapData()`.

```typescript
// ClockHeatmap.tsx — example pattern
import React, { useMemo } from 'react'
import { HeatmapRect } from '@visx/heatmap'
import { scaleLinear } from '@visx/scale'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { toClockHeatmapData } from '../data/gitVisMockData'

const WIDTH = 600; const HEIGHT = 300; const MARGIN = { top: 20, left: 40, right: 20, bottom: 40 }

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const theme = useBklitTheme()
  const data = useMemo(() => toClockHeatmapData(), [])

  const colorScale = useMemo(() =>
    scaleLinear({ domain: [0, Math.max(...data.map(d => d.value))], range: theme.heatmapColors as any }),
  [data, theme])

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <HeatmapRect data={data} binWidth={20} binHeight={20} xScale={d => d.x * 25} yScale={d => d.y * 25}>
          {heatmap => heatmap.map(bin => (
            <rect key={bin.x} x={bin.x} y={bin.y} width={bin.width} height={bin.height} fill={colorScale(bin.value)} rx={2} />
          ))}
        </HeatmapRect>
      </svg>
    </div>
  )
})
```

CalendarHeatmap follows the same pattern with `toCalendarHeatmapData()`.

---

### Task 9: FileSunburst — visx Hierarchy Sunburst

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`

Uses `@visx/hierarchy`'s Sunburst or Treemap. Data from `fileTreemapData` (already hierarchical).

```typescript
// FileSunburst.tsx
import React, { useMemo } from 'react'
import { hierarchy, partition } from 'd3-hierarchy'
import { Group } from '@visx/group'
import { arc } from 'd3-shape'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { fileTreemapData } from '../data/gitVisMockData'

const WIDTH = 300; const HEIGHT = 300; const RADIUS = Math.min(WIDTH, HEIGHT) / 2

export const FileSunburst = React.memo(function FileSunburst() {
  const theme = useBklitTheme()

  const root = useMemo(() => {
    const h = hierarchy(fileTreemapData).sum(d => (d as any).value ?? 0)
    const p = partition().size([2 * Math.PI, RADIUS])
    p(h)
    return h
  }, [])

  const arcs = useMemo(() => {
    const makeArc = arc().startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0).outerRadius(d => d.y1)
    return root.descendants().filter(d => d.depth > 0).map((d, i) => ({ path: makeArc(d as any), color: theme.seriesColors[i % theme.seriesColors.length], name: d.data.name }))
  }, [root, theme])

  return (
    <div className="adl-git-vis__chart">
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Group top={HEIGHT / 2} left={WIDTH / 2}>
          {arcs.map((arc, i) => <path key={i} d={arc.path ?? ''} fill={arc.color} stroke={theme.background} strokeWidth={1} />)}
        </Group>
      </svg>
    </div>
  )
})
```

---

### Task 10: CommitTimeline — visx Custom

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx`
- Create: `frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx`

**Interfaces:**
- Consumes: `gitVisMockData` (CommitNode/CommitEdge), `useBklitTheme()`, `getBranchColor()`
- Produces: custom SVG-based commit graph component

- [ ] **Step 1: Install visx dependencies**

```bash
cd ai-digital-life/frontend
pnpm add @visx/shape @visx/group @visx/scale @visx/event @visx/tooltip
```

- [ ] **Step 2: Write test**

```typescript
// CommitTimeline.test.tsx
import { render, screen } from '@testing-library/react'
import { CommitTimeline } from './CommitTimeline'
import { commitNodes, commitEdges } from '../data/gitVisMockData'

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    text: '#1e293b',
    muted: '#94a3b8',
    background: '#ffffff',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}))

describe('CommitTimeline', () => {
  it('renders commit nodes and edges', () => {
    const { container } = render(<CommitTimeline />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('.commit-node').length).toBeGreaterThan(0)
  })

  it('renders all 12 commit nodes', () => {
    const { container } = render(<CommitTimeline />)
    expect(container.querySelectorAll('.commit-node').length).toBe(commitNodes.length)
  })
})
```

- [ ] **Step 3: Write the visx CommitTimeline component**

```typescript
// CommitTimeline.tsx
import React, { useMemo } from 'react'
import { Group } from '@visx/group'
import { scaleLinear, scalePoint } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { localPoint } from '@visx/event'
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip'
import { useBklitTheme } from '../hooks/useBklitTheme'
import { commitNodes, commitEdges, CommitNode } from '../data/gitVisMockData'
import { getBranchColor } from '../utils/branchColor'

const WIDTH = 600
const HEIGHT = 340
const NODE_R = 5
const PADDING = 40

interface LayoutNode extends CommitNode {
  x: number
  y: number
  isMerge: boolean
}

/** CommitNode has: id, name (hash), branch, date (ISO string) */
export const CommitTimeline = React.memo(function CommitTimeline() {
  const theme = useBklitTheme()
  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<LayoutNode>()

  const layout = useMemo(() => {
    const branches = [...new Set(commitNodes.map(c => c.branch))]
    // Sort by date ascending (oldest at top)
    const sorted = [...commitNodes].sort((a, b) => a.date.localeCompare(b.date))

    const xScale = scalePoint({ domain: branches, range: [PADDING, WIDTH - PADDING] })
    const yScale = scaleLinear({ domain: [0, sorted.length - 1], range: [PADDING, HEIGHT - PADDING] })

    // Count parent edges per node to detect merge commits
    const parentCount = new Map<string, number>()
    for (const e of commitEdges) {
      // source → target means target is parent of source
      parentCount.set(e.source, (parentCount.get(e.source) ?? 0) + 1)
    }

    const nodes: LayoutNode[] = sorted.map((c, i) => ({
      ...c,
      x: xScale(c.branch) ?? PADDING,
      y: yScale(i),
      isMerge: (parentCount.get(c.id) ?? 0) > 1,
    }))

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Draw edges from parent (target) → child (source)
    const edges = commitEdges.map(e => ({
      from: nodeMap.get(e.target),
      to: nodeMap.get(e.source),
    })).filter(e => e.from && e.to)

    return { nodes, edges, allBranches: branches }
  }, [])

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />
        {/* Draw edges — parent → child */}
        {layout.edges.map((edge, i) => (
          <LinePath
            key={`edge-${i}`}
            data={[
              { x: edge.from!.x, y: edge.from!.y },
              { x: edge.to!.x, y: edge.to!.y },
            ]}
            x={d => d.x}
            y={d => d.y}
            stroke={theme.muted}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        ))}
        {/* Draw nodes */}
        {layout.nodes.map(node => (
          <Group key={node.id}>
            {node.isMerge ? (
              // Diamond shape for merge commits
              <polygon
                className="commit-node"
                points={`${node.x},${node.y - NODE_R * 1.5} ${node.x + NODE_R * 1.5},${node.y} ${node.x},${node.y + NODE_R * 1.5} ${node.x - NODE_R * 1.5},${node.y}`}
                fill={getBranchColor(node.branch, layout.allBranches)}
                stroke={theme.background}
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const pt = localPoint(e) || { x: 0, y: 0 }
                  showTooltip({ tooltipData: node, tooltipLeft: pt.x, tooltipTop: pt.y })
                }}
                onMouseLeave={hideTooltip}
              />
            ) : (
              <circle
                className="commit-node"
                cx={node.x}
                cy={node.y}
                r={NODE_R}
                fill={getBranchColor(node.branch, layout.allBranches)}
                stroke={theme.background}
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const pt = localPoint(e) || { x: 0, y: 0 }
                  showTooltip({ tooltipData: node, tooltipLeft: pt.x, tooltipTop: pt.y })
                }}
                onMouseLeave={hideTooltip}
              />
            )}
          </Group>
        ))}
      </svg>
      {tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{ ...defaultStyles, background: theme.tooltipBg, color: theme.tooltipText }}
        >
          <strong>{tooltipData.name}</strong>
          <br />
          <small>{tooltipData.branch} — {tooltipData.date}</small>
        </TooltipWithBounds>
      )}
    </div>
  )
})
```

- [ ] **Step 4: Run tests**

```bash
cd ai-digital-life/frontend
pnpm vitest run -- src/app/features/git-visualization/charts/CommitTimeline.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/app/features/git-visualization/charts/CommitTimeline.tsx frontend/src/app/features/git-visualization/charts/CommitTimeline.test.tsx
git commit -m "feat(git-visualization): add visx CommitTimeline replacing CommitGraph"
```

---

### Task 11: Rewrite GitVisualizationView

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx`

- [ ] **Step 1: Update test** — update imports and card count (still needs 7 chart cards)

- [ ] **Step 2: Rewrite GitVisualizationView** — replace ECharts imports with bklit imports

```typescript
// GitVisualizationView.tsx
import React, { Suspense } from 'react'
import { CodeLineEvo } from './charts/CodeLineEvo'
import { ContributorStats } from './charts/ContributorStats'
import { CollabSankey } from './charts/CollabSankey'
import { ClockHeatmap } from './charts/ClockHeatmap'
import { CalendarHeatmap } from './charts/CalendarHeatmap'
import { FileSunburst } from './charts/FileSunburst'
import { CommitTimeline } from './charts/CommitTimeline'
import { useTCopy } from '@hooks/useTCopy'

const chartCards = [
  { id: 'code-line-evo', titleKey: 'codeLineEvolution', component: CodeLineEvo, accent: 'accent-blue' },
  { id: 'contributor-stats', titleKey: 'contributorStats', component: ContributorStats, accent: 'accent-green' },
  { id: 'collab-sankey', titleKey: 'collabSankey', component: CollabSankey, accent: 'accent-purple' },
  { id: 'clock-heatmap', titleKey: 'clockHeatmap', component: ClockHeatmap, accent: 'accent-orange' },
  { id: 'calendar-heatmap', titleKey: 'calendarHeatmap', component: CalendarHeatmap, accent: 'accent-cyan' },
  { id: 'file-sunburst', titleKey: 'fileSunburst', component: FileSunburst, accent: 'accent-pink' },
  { id: 'commit-timeline', titleKey: 'commitGraph', component: CommitTimeline, accent: 'accent-blue' },
]

export function GitVisualizationView() {
  const t = useTCopy()

  return (
    <div className="adl-git-vis">
      <header className="adl-git-vis__header">
        <h2 className="adl-git-vis__title">{t.gitVisualization.analytics}</h2>
        <span className="adl-git-vis__badge">7 charts</span>
      </header>
      <div className="adl-git-vis__grid">
        {chartCards.map(({ id, titleKey, component: Chart, accent }) => (
          <ChartCard key={id} accent={accent} title={t.gitVisualization[titleKey]}>
            <Suspense fallback={<div className="adl-git-vis__skeleton" />}>
              <Chart />
            </Suspense>
          </ChartCard>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
cd ai-digital-life/frontend
pnpm vitest run -- src/app/features/git-visualization/
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/GitVisualizationView.tsx frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "feat(git-visualization): rewrite GitVisualizationView with bklit-ui components"
```

---

### Task 12: Cleanup — Remove ECharts & Old Files

**Files:**
- Remove: `frontend/src/app/features/git-visualization/echartsSetup.ts`
- Remove: `frontend/src/app/features/git-visualization/hooks/useECharts.ts`
- Remove: `frontend/src/app/features/git-visualization/hooks/useECharts.test.ts`
- Remove: `frontend/src/app/features/git-visualization/hooks/useChartTheme.ts`
- Remove: `frontend/src/app/features/git-visualization/hooks/useChartTheme.test.ts`
- Remove: `frontend/src/app/features/git-visualization/charts/CommitGraph.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/FileTreemap.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/CalendarHeatmap.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/ClockHeatmap.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/ContributorStats.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/CodeLineEvolution.tsx`
- Remove: `frontend/src/app/features/git-visualization/charts/CollabSankey.tsx`
- Modify: `frontend/package.json` (remove echarts dependency)
- Modify: `frontend/src/app/features/git-visualization/index.ts` (update exports)

- [ ] **Step 1: Remove old ECharts files and update barrel exports**

```bash
cd ai-digital-life/frontend
Remove-Item src/app/features/git-visualization/echartsSetup.ts
Remove-Item src/app/features/git-visualization/hooks/useECharts.ts
Remove-Item src/app/features/git-visualization/hooks/useECharts.test.ts
Remove-Item src/app/features/git-visualization/hooks/useChartTheme.ts
Remove-Item src/app/features/git-visualization/hooks/useChartTheme.test.ts
Remove-Item src/app/features/git-visualization/charts/CommitGraph.tsx
Remove-Item src/app/features/git-visualization/charts/FileTreemap.tsx
Remove-Item src/app/features/git-visualization/charts/CalendarHeatmap.tsx
Remove-Item src/app/features/git-visualization/charts/ClockHeatmap.tsx
Remove-Item src/app/features/git-visualization/charts/ContributorStats.tsx
Remove-Item src/app/features/git-visualization/charts/CodeLineEvolution.tsx
Remove-Item src/app/features/git-visualization/charts/CollabSankey.tsx
```

Update `index.ts` barrel:
```typescript
export { GitVisualizationView } from './GitVisualizationView'
```

- [ ] **Step 2: Remove echarts from package.json**

```bash
pnpm remove echarts
```

- [ ] **Step 3: Run full test suite**

```bash
cd ai-digital-life/frontend
pnpm test
```

Expected: all tests pass

- [ ] **Step 4: Verify build**

```bash
cd ai-digital-life/frontend
pnpm run build
```

Expected: build succeeds, no ECharts in output bundle

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git add -A
git commit -m "refactor(git-visualization): remove ECharts and old chart files"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run typecheck**

```bash
cd ai-digital-life/frontend
pnpm run typecheck
```

Expected: zero errors

- [ ] **Step 2: Run lint**

```bash
cd ai-digital-life/frontend
pnpm run lint
```

Expected: zero warnings

- [ ] **Step 3: Run full test suite**

```bash
cd ai-digital-life/frontend
pnpm test
```

Expected: all tests pass

- [ ] **Step 4: Visual verification** — start dev server and check all 7 charts in light + dark mode

```bash
cd ai-digital-life/frontend
pnpm run dev
```
