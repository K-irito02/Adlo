# Branch Graph Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 enhancements to BranchGraph: square hover, tag badge size, column spacing, i18n, multi-select filter with SVG lane dimming.

**Architecture:** All changes contained in single component file BranchGraph.tsx + git-visualization.css + i18n changes.ts. Multi-select changes filter state model from `string | null` to `Set<string>`, flowing through both list rows and SVG lanes.

**Tech Stack:** React 19, TypeScript, CSS custom properties

## Global Constraints

- All text visible to users must use i18n keys via `t.*`
- BranchGraph.tsx uses inline styles plus CSS classes; no CSS-in-JS
- Tests must pass after each task

---

### Task 1: Add i18n keys for column headers + date format

**Files:**
- Modify: `frontend/src/app/i18n/en-US/changes.ts:133-137`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts:127-131`
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:364-367`

- [ ] **Add i18n keys to en-US**

Insert after `gitVisBranchGraphFilterHint`:

```typescript
  gitVisHash: 'HASH',
  gitVisMessage: 'MESSAGE',
  gitVisAuthor: 'AUTHOR',
  gitVisDate: 'DATE',
```

- [ ] **Add i18n keys to zh-CN**

```typescript
  gitVisHash: '哈希',
  gitVisMessage: '提交信息',
  gitVisAuthor: '作者',
  gitVisDate: '日期',
```

- [ ] **Replace hardcoded headers in BranchGraph.tsx**

Change lines 364-367 from:
```tsx
<span>HASH</span>
<span>MESSAGE</span>
<span>AUTHOR</span>
<span>DATE</span>
```
to:
```tsx
<span>{t.gitVisHash}</span>
<span>{t.gitVisMessage}</span>
<span>{t.gitVisAuthor}</span>
<span>{t.gitVisDate}</span>
```

- [ ] **Update formatRelativeDate to language-neutral format**

Change:
```typescript
if (diffDays < 1) return 'today';
if (diffDays === 1) return '1d ago';
if (diffDays < 30) return `${diffDays}d ago`;
if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
return `${Math.floor(diffDays / 365)}y ago`;
```
to:
```typescript
if (diffDays < 1) return '0d';
if (diffDays < 30) return `${diffDays}d`;
if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
return `${Math.floor(diffDays / 365)}y`;
```

- [ ] **Run tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`

Expected: 6 passed

---

### Task 2: Fix column spacing

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:355-356,387-389`

- [ ] **Update header grid template**

Change header `style`:
```tsx
gridTemplateColumns: '80px 1fr 120px 100px',
gap: 8,
```

- [ ] **Update row grid template**

Change row `style`:
```tsx
gridTemplateColumns: '80px 1fr 120px 100px',
gap: 8,
```

- [ ] **Run tests**

Run: `pnpm --dir frontend exec vitest run ...BranchGraph.test.tsx` — expected 6 passed

---

### Task 3: Reduce tag badge size

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:424-435`

- [ ] **Shrink badge styles**

Change tag badge inline style:
```tsx
padding: '1px 6px' → '0 4px'
fontSize: 10 → 9
borderRadius: 3 → 2
```

- [ ] **Run tests**

---

### Task 4: Square node hover scale

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:222-237`

- [ ] **Add scale transform to merge nodes on hover**

Current square node rendering:
```tsx
if (row.isMerge) {
  const s = MERGE_NODE_SIZE;
  return (
    <rect
      key={`node-${row.node.id}`}
      x={x - s / 2}
      y={y - s / 2}
      width={s}
      height={s}
      rx={2}
      fill={row.lane.color}
      stroke={nodeStroke}
      strokeWidth={2}
    />
  );
}
```

Replace with hover-aware rendering:
```tsx
if (row.isMerge) {
  const s = isHovered ? MERGE_NODE_SIZE * 1.2 : MERGE_NODE_SIZE;
  return (
    <rect
      key={`node-${row.node.id}`}
      x={x - s / 2}
      y={y - s / 2}
      width={s}
      height={s}
      rx={2}
      fill={row.lane.color}
      stroke={nodeStroke}
      strokeWidth={2}
    />
  );
}
```

- [ ] **Run tests**

---

### Task 5: Multi-select filter + SVG lane dimming

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` (multiple sections)
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

- [ ] **Change filter state from single to Set**

Replace:
```typescript
const [filterBranch, setFilterBranch] = useState<string | null>(null);
```
with:
```typescript
const [filterBranches, setFilterBranches] = useState<Set<string>>(new Set());
```

Replace `handleLabelClick`:
```typescript
const handleLabelClick = useCallback((branch: string) => {
  setFilterBranch((prev) => (prev === branch ? null : branch));
}, []);
```
with:
```typescript
const handleLabelClick = useCallback((branch: string) => {
  setFilterBranches((prev) => {
    const next = new Set(prev);
    if (next.has(branch)) next.delete(branch);
    else next.add(branch);
    return next;
  });
}, []);
```

- [ ] **Update tag row rendering**

Replace `filterBranch === l.branch` with `filterBranches.has(l.branch)` in the lambda. Replace `filterBranch === null` with `filterBranches.size === 0`.

Key changes:
```typescript
const isSelected = filterBranches.has(l.branch);
// ...
opacity: filterBranches.size === 0 || filterBranches.has(l.branch) ? 1 : 0.4,
```

- [ ] **Update list row dimming logic**

Replace:
```typescript
const isFiltered = filterBranch !== null && filterBranch !== row.node.branch;
```
with:
```typescript
const isFiltered = filterBranches.size > 0 && !filterBranches.has(row.node.branch);
```

- [ ] **Pass filterBranches to SvgLanes**

Add prop to `SvgLanesProps`:
```typescript
interface SvgLanesProps {
  // ...existing props
  filterBranches: Set<string>;
  hoveredBranch: string | null;
}
```

Add to SvgLane rendering — lane lines filtering:
```typescript
const laneDimmed = filterBranches.size > 0 && !filterBranches.has(l.branch) && l.branch !== hoveredBranch;
// ...
opacity={laneDimmed ? 0.1 : 0.5}
```

Add to SvgLane nodes — node filtering:
```typescript
const nodeDimmed = filterBranches.size > 0 && !filterBranches.has(row.node.branch) && row.node.branch !== hoveredBranch;
// ...
opacity={nodeDimmed ? 0.1 : 1}
```

Update JSX call:
```tsx
<SvgLanes
  ...
  filterBranches={filterBranches}
  hoveredBranch={hoveredLabel}
/>
```

- [ ] **Update test for multi-select behavior**

Modify filter test section — click a label, check data attributes, click another label to add, verify both selected, click to deselect.

```typescript
it('filters by branch label multi-select', () => {
  const { container } = render(<BranchGraph />);
  const labels = container.querySelectorAll('.adl-branch-graph__label');

  // Click first label to select
  fireEvent.click(labels[0]);
  const branch0 = labels[0].textContent;
  let visibleBars = container.querySelectorAll('.adl-branch-graph__label-bar[data-visible="true"]');
  expect(visibleBars.length).toBe(1);

  // Click second label to add to selection
  fireEvent.click(labels[1]);
  const branch1 = labels[1].textContent;
  visibleBars = container.querySelectorAll('.adl-branch-graph__label-bar[data-visible="true"]');
  expect(visibleBars.length).toBe(2);

  // Verify row dimming: rows matching EITHER branch should be full opacity
  const rows = container.querySelectorAll('.adl-branch-graph__row');
  [...rows].forEach((r) => {
    const rowBranch = r.getAttribute('data-branch');
    const shouldDim = rowBranch !== branch0 && rowBranch !== branch1;
    expect((r as HTMLElement).style.opacity).toBe(shouldDim ? '0.25' : '1');
  });

  // Click first label again to deselect
  fireEvent.click(labels[0]);
  visibleBars = container.querySelectorAll('.adl-branch-graph__label-bar[data-visible="true"]');
  expect(visibleBars.length).toBe(1);

  // Click second label to deselect — show all
  fireEvent.click(labels[1]);
  expect(container.querySelector('.adl-branch-graph__label-bar[data-visible="true"]')).toBeNull();
});
```

Also update the existing filter test to match multi-select behavior (only click once, verify dimming, click again to clear).

- [ ] **Run tests**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/BranchGraph.test.tsx`

Expected: 6+ passed (7 if new test added, 6 if existing test updated in-place)
