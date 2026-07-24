# Branch Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitLens-style branch graph visualization as the 8th card in the Git Visualization dashboard.

**Architecture:** Pure SVG branch lanes overlaid on a CSS Grid row list. Lanes algorithm assigns each branch a vertical column; merge commits use Bezier curves. All data is mock-generated. Zero new dependencies.

**Tech Stack:** React 19, TypeScript, CSS Grid, SVG, Zustand (uiSlice), i18n via useTCopy

## Global Constraints

- All data is mock-generated (no git log backend needed)
- Zero new npm dependencies
- Colors must use CSS custom properties / theme-aware constants (follow `useBklitTheme` pattern)
- i18n keys must be added to both `en-US/changes.ts` and `zh-CN/changes.ts`
- Component must be `React.memo` wrapped
- Tests must follow existing patterns (vitest + @testing-library/react)
- File paths are relative to `ai-digital-life/frontend/`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/features/git-visualization/data/gitVisMockData.ts` | Modify | Enhance CommitNode interface + 28-node topology |
| `src/app/features/git-visualization/data/gitVisMockData.test.ts` | Modify | Add tests for new data structure |
| `src/app/i18n/en-US/changes.ts` | Modify | Add 4 new keys after `gitVisFileSunburstDesc` |
| `src/app/i18n/zh-CN/changes.ts` | Modify | Add 4 keys (translations) |
| `src/app/features/git-visualization/charts/BranchGraph.tsx` | Create | Main container: lane assignment + row list + SVG overlay |
| `src/app/features/git-visualization/charts/BranchGraph.test.tsx` | Create | Tests for BranchGraph |
| `src/app/features/git-visualization/GitVisualizationView.tsx` | Modify | Import BranchGraph + add 8th ChartCard |
| `src/app/features/git-visualization/GitVisualizationView.test.tsx` | Modify | Update card count to 8 + add BranchGraph key |
| `src/styles/regions/rightpanel/git-visualization.css` | Modify | Add branch graph row/lane/hover/tooltip styles |

### Task 1: Enhance Mock Data

**Files:**
- Modify: `src/app/features/git-visualization/data/gitVisMockData.ts` (full file)
- Test: `src/app/features/git-visualization/data/gitVisMockData.test.ts`

**Interfaces:**
- Produces: `CommitNode[]`, `CommitEdge[]`, `allBranches[]`, `CommitNode` and `CommitEdge` types (exported)

- [ ] **Step 1: Write the failing tests for new mock data**

Add to `gitVisMockData.test.ts`:

```typescript
import { commitNodes, commitEdges, allBranches, CommitNode, CommitEdge } from './gitVisMockData';

describe('branch graph mock data', () => {
  it('has 28 commit nodes', () => {
    expect(commitNodes.length).toBe(28);
  });

  it('every node has required fields', () => {
    for (const node of commitNodes) {
      expect(node.id).toBeTruthy();
      expect(node.hash).toMatch(/^[a-z0-9]{6,7}$/);
      expect(node.branch).toBeTruthy();
      expect(node.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(node.message).toBeTruthy();
      expect(node.author).toBeTruthy();
    }
  });

  it('has edges forming a valid DAG', () => {
    expect(commitEdges.length).toBeGreaterThan(0);
    const childIds = new Set(commitEdges.map(e => e.source));
    const parentIds = new Set(commitEdges.map(e => e.target));
    // All source/target ids must reference existing nodes
    const allIds = new Set(commitNodes.map(n => n.id));
    for (const edge of commitEdges) {
      expect(allIds.has(edge.source)).toBe(true);
      expect(allIds.has(edge.target)).toBe(true);
    }
  });

  it('has exactly 7 branches', () => {
    expect(allBranches.length).toBe(7);
    expect(allBranches).toContain('main');
  });

  it('includes at least one merge commit (2+ parents)', () => {
    const parentCount = new Map<string, number>();
    for (const edge of commitEdges) {
      parentCount.set(edge.source, (parentCount.get(edge.source) || 0) + 1);
    }
    const merges = [...parentCount.entries()].filter(([, c]) => c >= 2);
    expect(merges.length).toBeGreaterThanOrEqual(1);
  });

  it('includes an octopus merge (3+ parents)', () => {
    const parentCount = new Map<string, number>();
    for (const edge of commitEdges) {
      parentCount.set(edge.source, (parentCount.get(edge.source) || 0) + 1);
    }
    const octopus = [...parentCount.entries()].filter(([, c]) => c >= 3);
    expect(octopus.length).toBe(1);
  });

  it('includes an unmerged branch tip', () => {
    const allParents = new Set(commitEdges.map(e => e.target));
    const unmerged = commitNodes.filter(n =>
      !allParents.has(n.id) && n.branch !== 'main'
    );
    expect(unmerged.length).toBeGreaterThanOrEqual(1);
  });

  it('covers all 7 branch names', () => {
    const branchSet = new Set(commitNodes.map(n => n.branch));
    for (const b of allBranches) {
      expect(branchSet.has(b)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && pnpm exec vitest run src/app/features/git-visualization/data/gitVisMockData.test.ts --reporter=verbose
```
Expected: FAIL - `commitNodes` not defined

- [ ] **Step 3: Replace mock data file with enhanced version**

Replace the entire `gitVisMockData.ts`. Keep all existing exports (`generateCalendarData`, `contributorNames`, `fileTreemapData`, `generateCodeLineEvolutionData`, `toBklitAreaData`, `toHeatmapColumns`, `mockCommitTimelineData`, `generateClockHeatmapData`, `generateContributorActivityData`, `moduleNames`, `contributorModuleMatrix`, `generateContributorModuleData`) — only add/modify the types and data at the top.

Replace the `CommitNode` and `CommitEdge` interfaces and the `commitNodes`, `commitEdges`, `allBranches` exports:

```typescript
export interface CommitNode {
  id: string;
  hash: string;
  branch: string;
  date: string;
  message: string;
  author: string;
  authorEmail: string;
  tag?: string;
}

export interface CommitEdge {
  source: string;
  target: string;
}

export const commitNodes: CommitNode[] = [
  // ---- main branch (linear spine) ----
  { id: 'a1',  hash: 'a0a1a2', branch: 'main', date: '2026-01-01', message: 'Initial project setup', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a2',  hash: 'a1a2a3', branch: 'main', date: '2026-01-03', message: 'Add core utility modules', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a3',  hash: 'a2a3a4', branch: 'main', date: '2026-01-05', message: 'Configure CI/CD pipeline', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a7',  hash: 'a6a7a8', branch: 'main', date: '2026-01-20', message: 'Merge branch feature-1', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a8',  hash: 'a7a8a9', branch: 'main', date: '2026-01-22', message: 'Bump version to 1.1', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a10', hash: 'a9a0a1', branch: 'main', date: '2026-02-01', message: 'Update README and changelog', author: 'Alex', authorEmail: 'alex@example.com' },
  { id: 'a14', hash: 'd0e1f2', branch: 'main', date: '2026-02-20', message: 'Merge: feature-1, hotfix, main', author: 'Evan', authorEmail: 'evan@example.com' },
  { id: 'a15', hash: 'e7f8a9', branch: 'main', date: '2026-02-22', message: 'Release v2.0', author: 'Alex', authorEmail: 'alex@example.com' },

  // ---- feature-1 (long-lived, 8 commits) ----
  { id: 'b1',  hash: 'b0b1b2', branch: 'feature-1', date: '2026-01-06', message: 'Init feature-1: auth system', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b2',  hash: 'b1b2b3', branch: 'feature-1', date: '2026-01-08', message: 'Setup auth middleware', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b3',  hash: 'b2b3b4', branch: 'feature-1', date: '2026-01-10', message: 'Add user model', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b4',  hash: 'b3b4b5', branch: 'feature-1', date: '2026-01-12', message: 'Add login page UI', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b5',  hash: 'b4b5b6', branch: 'feature-1', date: '2026-01-15', message: 'Complete auth flow', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b6',  hash: 'b5b6b7', branch: 'feature-1', date: '2026-01-25', message: 'Update API documentation', author: 'Cara', authorEmail: 'cara@example.com' },
  { id: 'b7',  hash: 'b6b7b8', branch: 'feature-1', date: '2026-02-05', message: 'Refactor auth module', author: 'Ben', authorEmail: 'ben@example.com' },
  { id: 'b8',  hash: 'b7b8b9', branch: 'feature-1', date: '2026-02-15', message: 'Add final integration tests', author: 'Ben', authorEmail: 'ben@example.com' },

  // ---- feature-2 (5 commits, unmerged) ----
  { id: 'c1',  hash: 'c0c1c2', branch: 'feature-2', date: '2026-01-07', message: 'Init feature-2: dashboard', author: 'Cara', authorEmail: 'cara@example.com' },
  { id: 'c2',  hash: 'c1c2c3', branch: 'feature-2', date: '2026-01-09', message: 'Add API routes', author: 'Cara', authorEmail: 'cara@example.com' },
  { id: 'c3',  hash: 'c2c3c4', branch: 'feature-2', date: '2026-01-11', message: 'Build dashboard layout', author: 'Cara', authorEmail: 'cara@example.com' },
  { id: 'c4',  hash: 'c3c4c5', branch: 'feature-2', date: '2026-01-18', message: 'Fix review comments', author: 'Cara', authorEmail: 'cara@example.com' },
  { id: 'c5',  hash: 'c4c5c6', branch: 'feature-2', date: '2026-01-28', message: 'Dashboard v2 work-in-progress', author: 'Cara', authorEmail: 'cara@example.com' },

  // ---- feature-3 (4 commits, forks from feature-2, merges into feature-2) ----
  { id: 'd1',  hash: 'd0d1d2', branch: 'feature-3', date: '2026-01-13', message: 'Init feature-3: query optimization', author: 'Diana', authorEmail: 'diana@example.com' },
  { id: 'd2',  hash: 'd1d2d3', branch: 'feature-3', date: '2026-01-16', message: 'Add pagination support', author: 'Diana', authorEmail: 'diana@example.com' },
  { id: 'd3',  hash: 'd2d3d4', branch: 'feature-3', date: '2026-01-21', message: 'Optimize slow queries', author: 'Diana', authorEmail: 'diana@example.com' },
  { id: 'd4',  hash: 'd3d4d5', branch: 'feature-3', date: '2026-01-26', message: 'Merge feature-4 into feature-3', author: 'Diana', authorEmail: 'diana@example.com' },

  // ---- feature-4 (2 commits, forks from feature-3, merges into feature-3) ----
  { id: 'e1',  hash: 'e0e1e2', branch: 'feature-4', date: '2026-01-17', message: 'Init feature-4: analytics module', author: 'Evan', authorEmail: 'evan@example.com' },
  { id: 'e2',  hash: 'e1e2e3', branch: 'feature-4', date: '2026-01-19', message: 'Add data export feature', author: 'Evan', authorEmail: 'evan@example.com' },

  // ---- release/v1.0 (2 commits from a8, tag v1.0) ----
  { id: 'r1',  hash: 'r0r1r2', branch: 'release/v1.0', date: '2026-01-24', message: 'v1.0 release candidate', author: 'Evan', authorEmail: 'evan@example.com' },
  { id: 'r2',  hash: 'r1r2r3', branch: 'release/v1.0', date: '2026-01-27', message: 'v1.0 release candidate 2', author: 'Evan', authorEmail: 'evan@example.com', tag: 'v1.0' },

  // ---- hotfix (2 commits from a10) ----
  { id: 'h1',  hash: 'h1h2h3', branch: 'hotfix', date: '2026-02-05', message: 'Urgent: security patch', author: 'Diana', authorEmail: 'diana@example.com' },
  { id: 'h2',  hash: 'h3h4i5', branch: 'hotfix', date: '2026-02-10', message: 'Apply hotfix v2', author: 'Diana', authorEmail: 'diana@example.com' },
];

export const commitEdges: CommitEdge[] = [
  // main spine
  { source: 'a2', target: 'a1' },
  { source: 'a3', target: 'a2' },
  // feature-1 from a3
  { source: 'b1', target: 'a3' },
  { source: 'b2', target: 'b1' },
  { source: 'b3', target: 'b2' },
  { source: 'b4', target: 'b3' },
  // feature-2 from a3
  { source: 'c1', target: 'a3' },
  { source: 'c2', target: 'c1' },
  { source: 'c3', target: 'c2' },
  // feature-3 from feature-2 (c3)
  { source: 'd1', target: 'c3' },
  { source: 'd2', target: 'd1' },
  // feature-4 from feature-3 (d2)
  { source: 'e1', target: 'd2' },
  { source: 'e2', target: 'e1' },
  // feature-3 continues
  { source: 'd3', target: 'd2' },
  // d4 = merge of feature-3 + feature-4
  { source: 'd4', target: 'd3' },
  { source: 'd4', target: 'e2' },
  // feature-2 continues after feature-3 merge
  { source: 'c4', target: 'c3' },
  { source: 'c4', target: 'd4' },
  { source: 'c5', target: 'c4' },
  // feature-1 continues
  { source: 'b5', target: 'b4' },
  // a7 = merge of feature-1 (b5) + main (a3)
  { source: 'a7', target: 'b5' },
  { source: 'a7', target: 'a3' },
  // main continues
  { source: 'a8', target: 'a7' },
  // release/v1.0 from a8
  { source: 'r1', target: 'a8' },
  { source: 'r2', target: 'r1' },
  // feature-1 continues after merge
  { source: 'b6', target: 'b5' },
  { source: 'b7', target: 'b6' },
  { source: 'b8', target: 'b7' },
  // main continues
  { source: 'a10', target: 'a8' },
  // hotfix from a10
  { source: 'h1', target: 'a10' },
  { source: 'h2', target: 'h1' },
  // a14 = octopus merge: feature-1 (b8) + hotfix (h2) + main (a10)
  { source: 'a14', target: 'b8' },
  { source: 'a14', target: 'h2' },
  { source: 'a14', target: 'a10' },
  // main continues
  { source: 'a15', target: 'a14' },
];

export const allBranches = ['main', 'feature-1', 'feature-2', 'feature-3', 'feature-4', 'release/v1.0', 'hotfix'];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm exec vitest run src/app/features/git-visualization/data/gitVisMockData.test.ts --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/data/gitVisMockData.ts ai-digital-life/frontend/src/app/features/git-visualization/data/gitVisMockData.test.ts
git commit -m "feat(git-vis): enhance mock data with 28-node branch topology"
```

---

### Task 2: Add i18n Keys for Branch Graph

**Files:**
- Modify: `src/app/i18n/en-US/changes.ts`
- Modify: `src/app/i18n/zh-CN/changes.ts`

**Interfaces:**
- Consumes: none
- Produces: `t.gitVisBranchGraph`, `t.gitVisBranchGraphDesc`, `t.gitVisBranch`, `t.gitVisBranchGraphFilterHint` (available on `useTCopy().t`)

- [ ] **Step 1: Add keys to en-US**

Insert 4 lines before `gitVisMockDataNote` in `en-US/changes.ts`:

```typescript
  gitVisBranchGraph: 'Branch Graph',
  gitVisBranchGraphDesc:
    'Commit DAG with branch topology. Each vertical lane is a branch; dots are commits. Click branch labels to filter.',
  gitVisBranch: 'Branch',
  gitVisBranchGraphFilterHint: 'Click a branch label to filter',
```

- [ ] **Step 2: Add keys to zh-CN**

Insert 4 lines before `gitVisMockDataNote` in `zh-CN/changes.ts`:

```typescript
  gitVisBranchGraph: '分支图谱',
  gitVisBranchGraphDesc:
    '带有分支拓扑的提交有向无环图。每条垂直泳道为一个分支，圆点为提交。点击分支标签可筛选。',
  gitVisBranch: '分支',
  gitVisBranchGraphFilterHint: '点击分支标签可筛选',
```

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/en-US/changes.ts ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts
git commit -m "feat(i18n): add branch graph translation keys"
```

---

### Task 3: Implement BranchGraph Component (Core)

**Files:**
- Create: `src/app/features/git-visualization/charts/BranchGraph.tsx`
- Create: `src/app/features/git-visualization/charts/BranchGraph.test.tsx`

**Interfaces:**
- Consumes: `commitNodes`, `commitEdges`, `allBranches` from `../data/gitVisMockData`
- Consumes: `useBklitTheme` from `../hooks/useBklitTheme`
- Produces: `BranchGraph` (React.memo'ed component, no props)

- [ ] **Step 1: Write the failing tests**

Create `BranchGraph.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchGraph } from './BranchGraph';

afterEach(() => {
  cleanup();
});

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    background: '#ffffff',
    text: '#1e293b',
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'],
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

describe('BranchGraph', () => {
  it('renders commit rows', () => {
    const { container } = render(<BranchGraph />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    expect(rows.length).toBe(28);
  });

  it('renders SVG lanes container', () => {
    const { container } = render(<BranchGraph />);
    const svg = container.querySelector('.adl-branch-graph__svg');
    expect(svg).toBeTruthy();
  });

  it('renders branch labels', () => {
    const { container } = render(<BranchGraph />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    expect(labels.length).toBe(7);
  });

  it('shows tag badge for tagged commit', () => {
    const { container } = render(<BranchGraph />);
    const tags = container.querySelectorAll('.adl-branch-graph__tag');
    expect(tags.length).toBe(1);
    expect(tags[0].textContent).toBe('v1.0');
  });

  it('highlights row on hover', () => {
    const { container } = render(<BranchGraph />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    fireEvent.mouseEnter(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(true);
    fireEvent.mouseLeave(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(false);
  });

  it('filters by branch label click', () => {
    const { container } = render(<BranchGraph />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    fireEvent.click(labels[0]);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    const mainRows = [...rows].filter(r => r.getAttribute('data-branch') === 'main');
    const nonMainRows = [...rows].filter(r => r.getAttribute('data-branch') !== 'main');
    expect(mainRows.length).toBeGreaterThan(0);
    // Click again to deselect
    fireEvent.click(labels[0]);
    const rowsAfter = container.querySelectorAll('.adl-branch-graph__row--dimmed');
    expect(rowsAfter.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && pnpm exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx --reporter=verbose
```
Expected: FAIL - Module not found

- [ ] **Step 3: Implement BranchGraph component**

Create `BranchGraph.tsx`:

```typescript
import React, { useMemo, useState, useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { commitNodes, commitEdges, allBranches } from '../data/gitVisMockData';

// ── Constants ──
const LANE_WIDTH = 24;
const LANE_GAP = 8;
const ROW_HEIGHT = 36;
const NODE_RADIUS = 6;
const MERGE_NODE_SIZE = 12;

// ── Theme-aware branch colors ──
const BRANCH_COLORS_LIGHT: Record<string, string> = {
  main: '#3b82f6',
  'feature-1': '#10b981',
  'feature-2': '#f59e0b',
  'feature-3': '#8b5cf6',
  'feature-4': '#ec4899',
  'release/v1.0': '#06b6d4',
  hotfix: '#ef4444',
};

const BRANCH_COLORS_DARK: Record<string, string> = {
  main: '#60a5fa',
  'feature-1': '#34d399',
  'feature-2': '#fbbf24',
  'feature-3': '#a78bfa',
  'feature-4': '#f472b6',
  'release/v1.0': '#22d3ee',
  hotfix: '#f87171',
};

// ── Data preparation ──
interface LaneMap {
  branch: string;
  index: number;
  color: string;
}

interface RowData {
  node: typeof commitNodes[0];
  lane: LaneMap;
  parents: string[];
  isMerge: boolean;
  isHovered: boolean;
}

function assignLanes(isDark: boolean): LaneMap[] {
  return allBranches.map((branch, i) => ({
    branch,
    index: i,
    color: (isDark ? BRANCH_COLORS_DARK : BRANCH_COLORS_LIGHT)[branch] || '#94a3b8',
  }));
}

function computeParentMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of commitEdges) {
    const existing = map.get(edge.source) || [];
    existing.push(edge.target);
    map.set(edge.source, existing);
  }
  return map;
}

function getLaneX(laneIndex: number): number {
  return laneIndex * (LANE_WIDTH + LANE_GAP) + LANE_WIDTH / 2;
}

function buildRows(lanes: LaneMap[], parentMap: Map<string, string[]>): RowData[] {
  const laneIndexByBranch = new Map(lanes.map(l => [l.branch, l.index]));
  const commitById = new Map(commitNodes.map(n => [n.id, n]));

  // Create a partial ordering: children before parents (newest first)
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const parents = parentMap.get(id) || [];
    for (const p of parents) {
      visit(p);
    }
    sorted.push(id);
  }

  for (const node of commitNodes) {
    visit(node.id);
  }

  return sorted.map(id => {
    const node = commitById.get(id)!;
    const parents = parentMap.get(id) || [];
    const laneIdx = laneIndexByBranch.get(node.branch) ?? 0;
    return {
      node,
      lane: lanes[laneIdx],
      parents,
      isMerge: parents.length >= 2,
      isHovered: false,
    };
  });
}

// ── Sub-components ──

interface SvgLanesProps {
  rows: RowData[];
  lanes: LaneMap[];
  totalWidth: number;
  totalHeight: number;
  hoveredId: string | null;
}

const SvgLanes = React.memo(function SvgLanes({ rows, lanes, totalWidth, totalHeight, hoveredId }: SvgLanesProps) {
  const laneIndexByBranch = new Map(lanes.map(l => [l.branch, l.index]));
  const nodeY = (rowIndex: number) => rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  // Build a map from nodeId -> row index
  const rowIndexById = new Map<string, number>();
  rows.forEach((r, i) => rowIndexById.set(r.node.id, i));

  // Compute vertical lane lines
  const laneLines = lanes.map(l => {
    const x = getLaneX(l.index);
    // Find min/max Y for commits on this branch
    const yPositions = rows.filter(r => r.node.branch === l.branch).map((_, i) => nodeY(i));
    if (yPositions.length === 0) return null;
    return (
      <line
        key={`lane-${l.branch}`}
        x1={x} y1={yPositions[0]}
        x2={x} y2={yPositions[yPositions.length - 1]}
        stroke={l.color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.5}
      />
    );
  });

  // Build connection edges (from source to target)
  const connections: React.ReactElement[] = [];
  for (const edge of commitEdges) {
    const sourceIdx = rowIndexById.get(edge.source);
    const targetIdx = rowIndexById.get(edge.target);
    if (sourceIdx === undefined || targetIdx === undefined) continue;
    const sourceRow = rows[sourceIdx];
    const targetRow = rows[targetIdx];
    const sx = getLaneX(sourceRow.lane.index);
    const sy = nodeY(sourceIdx);
    const tx = getLaneX(targetRow.lane.index);
    const ty = nodeY(targetIdx);

    if (sourceRow.lane.index === targetRow.lane.index) {
      // Same lane - vertical line
      connections.push(
        <line
          key={`edge-${edge.source}-${edge.target}`}
          x1={sx} y1={sy}
          x2={tx} y2={ty}
          stroke={sourceRow.lane.color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      );
    } else {
      // Different lane - Bezier curve
      const midY = (sy + ty) / 2;
      connections.push(
        <path
          key={`edge-${edge.source}-${edge.target}`}
          d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
          fill="none"
          stroke={sourceRow.lane.color}
          strokeWidth={2}
          strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
          opacity={0.6}
        />
      );
    }
  }

  // Build commit nodes
  const nodes = rows.map((row, i) => {
    const x = getLaneX(row.lane.index);
    const y = nodeY(i);
    const isHovered = hoveredId === row.node.id;
    const r = isHovered ? NODE_RADIUS * 1.2 : NODE_RADIUS;

    if (row.node.tag) {
      return (
        <g key={`node-${row.node.id}`}>
          <circle cx={x} cy={y} r={r + 1} fill="none" stroke={row.lane.color} strokeWidth={2.5} />
          <circle cx={x + 14} cy={y - 8} r={8} fill={row.lane.color} opacity={0.15} />
          <text x={x + 14} y={y - 5} textAnchor="middle" fontSize={8} fill={row.lane.color} fontWeight={600}>
            {row.node.tag}
          </text>
        </g>
      );
    }

    if (row.isMerge) {
      const s = MERGE_NODE_SIZE;
      return (
        <rect
          key={`node-${row.node.id}`}
          x={x - s / 2} y={y - s / 2}
          width={s} height={s} rx={2}
          fill={row.lane.color}
          stroke="#fff"
          strokeWidth={2.5}
        />
      );
    }

    return (
      <circle
        key={`node-${row.node.id}`}
        cx={x} cy={y} r={r}
        fill={row.lane.color}
        stroke="#fff"
        strokeWidth={2.5}
      />
    );
  });

  return (
    <svg
      className="adl-branch-graph__svg"
      width={totalWidth}
      height={totalHeight}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      {laneLines}
      {connections}
      {nodes}
    </svg>
  );
});

// ── Main component ──

export const BranchGraph = React.memo(function BranchGraph() {
  const { t } = useTCopy();
  const theme = useBklitTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState<string | null>(null);

  const isDark = theme.background !== '#ffffff';
  const lanes = useMemo(() => assignLanes(isDark), [isDark]);
  const parentMap = useMemo(() => computeParentMap(), []);
  const rows = useMemo(() => buildRows(lanes, parentMap), [lanes, parentMap]);

  const totalLaneWidth = lanes.length * (LANE_WIDTH + LANE_GAP);
  const totalHeight = rows.length * ROW_HEIGHT + 8;

  const handleRowHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleLabelClick = useCallback((branch: string) => {
    setFilterBranch(prev => prev === branch ? null : branch);
  }, []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <div style={{ position: 'relative', minHeight: totalHeight }}>
        <SvgLanes
          rows={rows}
          lanes={lanes}
          totalWidth={totalLaneWidth}
          totalHeight={totalHeight}
          hoveredId={hoveredId}
        />
        <div style={{ marginLeft: totalLaneWidth + 8 }}>
          {/* Header row */}
          <div
            className="adl-branch-graph__header"
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr auto auto',
              gap: 4,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: theme.muted,
              borderBottom: `1px solid ${theme.grid}`,
            }}
          >
            <span>HASH</span>
            <span>MESSAGE</span>
            <span>AUTHOR</span>
            <span>DATE</span>
          </div>

          {/* Branch labels row */}
          {filterBranch === null && (
            <div style={{ display: 'flex', gap: 6, padding: '4px 8px 8px', flexWrap: 'wrap' }}>
              {lanes.map(l => (
                <button
                  key={l.branch}
                  className="adl-branch-graph__label"
                  onClick={() => handleLabelClick(l.branch)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: l.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    opacity: filterBranch && filterBranch !== l.branch ? 0.4 : 1,
                  }}
                  title={t.gitVisBranchGraphFilterHint}
                >
                  {l.branch}
                </button>
              ))}
            </div>
          )}

          {/* Commit rows */}
          {rows.map((row, i) => {
            const isFiltered = filterBranch !== null && filterBranch !== row.node.branch;
            return (
              <div
                key={row.node.id}
                className={`adl-branch-graph__row${hoveredId === row.node.id ? ' adl-branch-graph__row--hover' : ''}`}
                data-branch={row.node.branch}
                data-filtered={isFiltered}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr auto auto',
                  gap: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  lineHeight: ROW_HEIGHT - 8 + 'px',
                  cursor: 'default',
                  background: hoveredId === row.node.id ? theme.grid : 'transparent',
                  borderRadius: 4,
                  opacity: isFiltered ? 0.25 : 1,
                  transition: 'background 0.15s, opacity 0.15s',
                  minHeight: ROW_HEIGHT,
                }}
                onMouseEnter={() => handleRowHover(row.node.id)}
                onMouseLeave={() => handleRowHover(null)}
                title={`${row.node.hash}\n${row.node.message}\n${row.node.author} <${row.node.authorEmail}>\n${row.node.date}`}
              >
                <span style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", color: theme.text, fontSize: 11 }}>
                  {row.node.hash}
                </span>
                <span style={{
                  color: theme.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {row.node.message}
                  {row.node.tag && (
                    <span className="adl-branch-graph__tag" style={{
                      marginLeft: 8,
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: row.lane.color,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                    }}>
                      {row.node.tag}
                    </span>
                  )}
                </span>
                <span style={{ color: theme.muted }}>{row.node.author}</span>
                <span style={{ color: theme.muted, textAlign: 'right' }}>
                  {formatRelativeDate(row.node.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function formatRelativeDate(dateStr: string): string {
  const now = new Date('2026-07-18');
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && pnpm exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx
git commit -m "feat(git-vis): implement BranchGraph component with SVG lanes"
```

---

### Task 4: Integrate BranchGraph into GitVisualizationView + Add Styles

**Files:**
- Modify: `src/app/features/git-visualization/GitVisualizationView.tsx`
- Modify: `src/app/features/git-visualization/GitVisualizationView.test.tsx`
- Modify: `src/styles/regions/rightpanel/git-visualization.css`

- [ ] **Step 1: Modify GitVisualizationView.tsx**

Add the import after line 9:

```typescript
import { BranchGraph } from './charts/BranchGraph';
```

Insert a new ChartCard between line 53 (FileSunburst card) and line 54 (mock data note):

```typescript
      <ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
        <BranchGraph />
      </ChartCard>
```

- [ ] **Step 2: Update the test file**

In `GitVisualizationView.test.tsx`, in the `vi.mock('@i18n/useTCopy', ...)` mock, add these keys:

```typescript
      gitVisBranchGraph: 'Branch Graph',
      gitVisBranchGraphDesc: 'desc',
      gitVisBranch: 'Branch',
      gitVisBranchGraphFilterHint: 'Click a branch label to filter',
```

Update the test on line 116-120 from expecting 7 cards to 8:

```typescript
  it('renders 8 chart cards', { timeout: 30000 }, () => {
    const { container } = render(<GitVisualizationView />);
    const cards = container.querySelectorAll('.adl-git-vis__card');
    expect(cards.length).toBe(8);
  });
```

- [ ] **Step 3: Add CSS styles**

Append to `git-visualization.css`:

```css
/* ── Branch Graph ── */
.adl-branch-graph__row {
  transition: background 0.15s, opacity 0.15s;
  border-radius: 4px;
}

.adl-branch-graph__row--hover {
  background: var(--bg-hover, #f1f5f9);
}

.adl-branch-graph__label {
  transition: opacity 0.15s, transform 0.15s;
}

.adl-branch-graph__label:hover {
  transform: translateY(-1px);
}

.adl-branch-graph__tag {
  display: inline-block;
  vertical-align: middle;
}

.adl-branch-graph__header {
  font-family: var(--font-mono, 'Cascadia Code', monospace);
  user-select: none;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm exec vitest run src/app/features/git-visualization/ --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.tsx \
       ai-digital-life/frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx \
       ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(git-vis): integrate BranchGraph as 8th dashboard card"
```

---

### Task 5: Full Integration Verification

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && pnpm run test
```
Expected: ALL PASS (including existing tests)

- [ ] **Step 2: Run lint**

```bash
cd frontend && pnpm run lint
```
Expected: No new warnings

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Visual verification in browser**

```bash
cd frontend && pnpm run dev
```
Expected: Navigate to Changes Panel → Click Git Visualization button → See 8th card with branch graph rendering 28 commit rows, SVG lanes, branch labels, and interactive hover/filter behavior
