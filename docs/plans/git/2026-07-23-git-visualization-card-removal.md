# Git 可视化区域：去除卡片悬浮感 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove floating card appearance from Git visualization sections, reorder BranchGraph, center FileSunburst.

**Architecture:** Pure CSS changes to `.adl-git-vis__card` styling (remove background/shadow/radius/hover/divider) + two small JSX adjustments in GitVisualizationView.tsx and FileSunburst.tsx.

**Tech Stack:** CSS custom properties, React 19, TypeScript

## Global Constraints

- All visual changes must work in both light and dark themes
- No changes to chart component internals or data flow
- Component structure unchanged (ChartCard wrapper stays, only its styling changes)
- Must pass existing tests after changes

---

### Task 1: Remove card styling (CSS)

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css:11-24`

- [ ] **Step 1: Edit `.adl-git-vis__card`**

Remove these properties from `.adl-git-vis__card`:
- `background: var(--bg-card)`
- `border-radius: var(--radius-lg)`
- `box-shadow: var(--shadow-sm)`
- `transition: box-shadow 0.2s`

- [ ] **Step 2: Remove `.adl-git-vis__card:hover`**

Remove the entire `:hover` rule block.

- [ ] **Step 3: Remove `.adl-git-vis__card-desc` border-top**

Remove `border-top: 1px solid var(--border-subtle)` from `.adl-git-vis__card-desc`.

Expected result after all three steps:
```css
.adl-git-vis__card {
  padding: var(--space-3) var(--space-3) var(--space-1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.adl-git-vis__card-desc {
  font-size: 0.8rem;
  color: var(--text-secondary);
  padding: var(--space-2) var(--space-1) 0;
  margin-top: var(--space-1);
}
```

---

### Task 2: Reorder BranchGraph

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx:38-51`

- [ ] **Step 1: Move BranchGraph ChartCard to position 2**

Move the `<ChartCard title={t.gitVisBranchGraph}>` block (currently last) to right after `<HeatmapCardGroup />`.

Before:
```tsx
<HeatmapCardGroup />
<ChartCard title={t.gitVisCodeLineEvo} desc={t.gitVisCodeLineEvoDesc}>
  <CodeLineEvo />
</ChartCard>
<ChartCard title={t.gitVisCommitTimeline} desc={t.gitVisCommitTimelineDesc}>
  <CommitTimeline />
</ChartCard>
<ChartCard title={t.gitVisFileSunburst} desc={t.gitVisFileSunburstDesc}>
  <FileSunburst />
</ChartCard>
<ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
  <BranchGraph />
</ChartCard>
```

After:
```tsx
<HeatmapCardGroup />
<ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
  <BranchGraph />
</ChartCard>
<ChartCard title={t.gitVisCodeLineEvo} desc={t.gitVisCodeLineEvoDesc}>
  <CodeLineEvo />
</ChartCard>
<ChartCard title={t.gitVisCommitTimeline} desc={t.gitVisCommitTimelineDesc}>
  <CommitTimeline />
</ChartCard>
<ChartCard title={t.gitVisFileSunburst} desc={t.gitVisFileSunburstDesc}>
  <FileSunburst />
</ChartCard>
```

---

### Task 3: Center FileSunburst

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx:26`

- [ ] **Step 1: Add centering style to wrapper div**

Change the wrapper div to horizontally center the `SunburstChart`:

Before:
```tsx
<div className="adl-git-vis__chart" style={{ position: 'relative' }}>
```

After:
```tsx
<div className="adl-git-vis__chart" style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
```

---

### Task 4: Verify

- [ ] **Step 1: Run frontend tests**

```bash
cd frontend && pnpm run test
```

Expected: All existing tests pass with no regressions.

- [ ] **Step 2: Run linter**

```bash
cd frontend && pnpm run lint
```

Expected: No new errors or warnings from changed files.

- [ ] **Step 3: Visual verification**

Build and verify visually:
- Cards no longer have distinct background/shadow/radius
- BranchGraph appears second (after heatmap)
- FileSunburst chart is centered in its section
- Light and dark themes both look correct
