# Branch Graph: Tag Hover & Head Annotation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two issues in BranchGraph: (1) ref label hover indicator/scale missing, (2) "branch head" annotation appearing on every commit instead of only HEAD commits with proper priority.

**Architecture:** All changes are confined to `BranchGraph.tsx`. Two independent fixes: `renderRefLabels()` gets `data-indicator`/`data-scale` attributes; `CommitTooltipCard` gets a new `isBranchHead` prop with priority-based annotation logic. A `branchHeads` Set is computed via `useMemo` from topological order.

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest

**Design Spec:** `docs/superpowers/specs/2026-07-29-branch-graph-tag-hover-and-head-annotation-design.md`

## Global Constraints

- All text annotations use existing i18n keys (`gitVisBranchHead`, `gitVisLocalOnly`, `gitVisMerged`) — no new translations needed
- CSS already handles `data-indicator` and `data-scale` attributes — no CSS changes needed
- All existing tests must continue to pass
- Follow existing code patterns in BranchGraph.tsx

---

### Task 1: Fix ref label hover indicator/scale (Issue 1)

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:91-129`
- Test: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` (existing tests should still pass)

**Interfaces:**
- Consumes: Existing `renderRefLabels()` signature with `activeRefLabel`, `setActiveRefLabel`, `setHoveredLabel`, `t`
- Produces: Ref label buttons now have `data-indicator` and `data-scale` attributes

- [ ] **Step 1: Add `data-indicator` and `data-scale` to ref label button**

In `renderRefLabels()`, for each ref label `rl`, compute:
- `showIndicator`: true when `hoveredLabel === rl.name` (hover) OR `activeRefLabel === rl.name` (selected)
- `showScale`: true when (hovered XOR selected) — i.e., `(hoveredLabel === rl.name) !== (activeRefLabel === rl.name)`

But wait, `renderRefLabels` doesn't have access to `hoveredLabel` directly — it only receives `setHoveredLabel`. We need to pass `hoveredLabel` as an additional argument.

Change the `renderRefLabels` signature to accept `hoveredLabel`:

```typescript
function renderRefLabels(
  rls: RefLabelInfo[],
  activeRefLabel: string | null,
  setActiveRefLabel: (v: string | null) => void,
  hoveredLabel: string | null,
  setHoveredLabel: (label: string | null) => void,
  t: { gitVisLocalOnly?: string },
) {
```

Then for each ref label `rl`, compute and apply attributes:

```typescript
const showIndicator = hoveredLabel === rl.name || activeRefLabel === rl.name;
const showScale = (hoveredLabel === rl.name) !== (activeRefLabel === rl.name);
```

Apply to `<button>`:
```typescript
data-indicator={showIndicator ? 'true' : undefined}
data-scale={showScale ? 'true' : undefined}
```

- [ ] **Step 2: Update call site to pass `hoveredLabel`**

In the tag row rendering (around line 834 where `renderRefLabels` is called), add `hoveredLabel` before `setHoveredLabel`:

```typescript
{col.refsLabels &&
  renderRefLabels(
    col.refsLabels,
    activeRefLabel,
    setActiveRefLabel,
    hoveredLabel,
    setHoveredLabel,
    t,
  )}
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `pnpm --dir frontend run test -- BranchGraph`
Expected: All existing tests PASS.

---

### Task 2: Compute branchHeads set and pass isBranchHead to CommitTooltipCard

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**Interfaces:**
- Consumes: `adapted.nodes` (CommitNode[] with `branch` and `id` fields), `sortedIds` (string[] in topological order)
- Produces: `branchHeads: Set<string>` — set of node IDs that are the HEAD (tip) of their branch

- [ ] **Step 1: Add `isBranchHead` to CommitTooltipCardProps**

Add the new prop:

```typescript
interface CommitTooltipCardProps {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  branch: string;
  refs: string[];
  branchProgress?: { ahead: number; behind: number; mergeBase?: string };
  tag?: string;
  isBranchHead?: boolean;  // NEW: true when this commit is the tip of its branch
}
```

Destructure it in the component:

```typescript
const CommitTooltipCard = React.memo(function CommitTooltipCard({
  hash,
  message,
  author,
  authorEmail,
  date,
  branch,
  refs,
  branchProgress,
  tag,
  isBranchHead,
}: CommitTooltipCardProps) {
```

- [ ] **Step 2: Compute `branchHeads` via useMemo**

After the `useLaneAssignment` call and before `rows`, add:

```typescript
// Branch head detection: first occurrence of each branch in topological order = HEAD
// See design spec for annotation priority system
const branchHeads = useMemo(() => {
  const heads = new Set<string>();
  if (!adapted) return heads;
  const seenBranch = new Set<string>();
  for (const id of sortedIds) {
    const node = adapted.nodes.find((n) => n.id === id);
    if (!node || !node.branch) continue;
    if (!seenBranch.has(node.branch)) {
      seenBranch.add(node.branch);
      heads.add(id);
    }
  }
  return heads;
}, [adapted, sortedIds]);
```

- [ ] **Step 3: Pass `isBranchHead` to CommitTooltipCard at render site**

In the `CommitTooltipCard` usage (around line 1046), add:

```typescript
<CommitTooltipCard
  hash={row.node.hash}
  message={row.node.message}
  author={row.node.author}
  authorEmail={row.node.authorEmail}
  date={row.node.date}
  branch={row.node.branch}
  refs={row.node.refs ?? []}
  branchProgress={adapted?.branchProgress?.[row.node.branch]}
  tag={row.node.tag}
  isBranchHead={branchHeads.has(row.node.id)}
/>
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend run test -- BranchGraph`
Expected: All tests PASS.

---

### Task 3: Implement annotation priority logic in CommitTooltipCard

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:222-234`

**Interfaces:**
- Consumes: `isBranchHead`, `branchProgress`, `localRefs`, `branch` from props
- Produces: Correct single annotation shown in the tooltip card

- [ ] **Step 1: Replace the annotation ternary with priority logic**

Replace lines 222-234 (the primary branch badge annotation block):

Old code:
```typescript
{branch && (
  <span className="adl-branch-graph__tooltip-branch-badge adl-branch-graph__tooltip-branch-badge--primary">
    {displayBranch}
    {localRefs.length > 0
      ? ` (${t.gitVisMerged})`
      : ` (${t.gitVisBranchHead ?? 'branch head'})`}
    {branchProgress && (branchProgress.ahead > 0 || branchProgress.behind > 0) && (
      <span className="adl-branch-graph__tooltip-branch-progress">
        {branchProgress.ahead > 0 && <span>↑{branchProgress.ahead}</span>}
        {branchProgress.behind > 0 && <span>↓{branchProgress.behind}</span>}
      </span>
    )}
  </span>
)}
```

New code with priority system:
```typescript
{branch && (
  <span className="adl-branch-graph__tooltip-branch-badge adl-branch-graph__tooltip-branch-badge--primary">
    {displayBranch}
    {(() => {
      // Annotation priority system (see design spec):
      // Priority 1: isBranchHead + local-only (branchProgress exists, no mergeBase) → "仅本地"
      // Priority 2: localRefs.length > 0                                          → "已合并"
      // Priority 3: isBranchHead + has remote tracking                            → "分支头"
      // Priority 4: neither                                                       → no annotation
      if (isBranchHead && branchProgress && !branchProgress.mergeBase) {
        return ` (${t.gitVisLocalOnly})`;
      }
      if (localRefs.length > 0) {
        return ` (${t.gitVisMerged})`;
      }
      if (isBranchHead) {
        return ` (${t.gitVisBranchHead ?? 'branch head'})`;
      }
      return '';
    })()}
    {branchProgress && (branchProgress.ahead > 0 || branchProgress.behind > 0) && (
      <span className="adl-branch-graph__tooltip-branch-progress">
        {branchProgress.ahead > 0 && <span>↑{branchProgress.ahead}</span>}
        {branchProgress.behind > 0 && <span>↓{branchProgress.behind}</span>}
      </span>
    )}
  </span>
)}
```

- [ ] **Step 2: Run tests**

Run: `pnpm --dir frontend run test -- BranchGraph`
Expected: Tests may fail if they check for old "branch head" text in tooltip.

---

### Task 4: Update tests for annotation behavior

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

- [ ] **Step 1: Add mock `branchProgress` to mockData for branch head testing**

The test currently has `mockData` without `branchProgress`. Add it to distinguish branch head scenarios:

```typescript
const mockData: RawBranchGraph = {
  nodes: commitNodes.map((n, i) => ({
    hash: n.hash,
    shortHash: n.hash.substring(0, 7),
    parentHashes: [],
    branch: n.branch,
    date: n.date,
    message: n.message,
    author: n.author,
    authorEmail: n.authorEmail,
    tag: n.tag,
    refs: [],
  })),
  edges: commitEdges.map((e) => ({
    from: `node-${nodeIdToIndex.get(e.source)}`,
    to: `node-${nodeIdToIndex.get(e.target)}`,
  })),
  branches: allBranches,
};
```

- [ ] **Step 2: Update existing tooltip test to check for new annotation behavior**

The existing tooltip test at line 117 checks that the tooltip card content contains hash, message, author, email. It still should — just update the test to also verify annotation text behavior.

Update the "renders tooltip card content on row hover" test: add a check that branch annotation is NOT present for a non-HEAD commit. The first row in mock data is the newest commit (a15, main) which IS the HEAD of main. We can check it shows "branch head" or use a different row.

Add a new test verifying annotation:

```typescript
it('shows correct annotation priority in tooltip card', async () => {
  const dataWithProgress = {
    ...mockData,
    branchProgress: {
      main: { ahead: 0, behind: 0, mergeBase: 'abc1234' },
      'feature-1': { ahead: 2, behind: 0, mergeBase: 'def5678' },
    },
  };
  const { container } = render(<BranchGraph data={dataWithProgress} />);
  const rows = container.querySelectorAll('.adl-branch-graph__row');

  // Row 0 = newest commit (main HEAD) → should show "branch head"
  fireEvent.mouseEnter(rows[0]);
  const infoBtn0 = await vi.waitFor(() => {
    const btn = rows[0].querySelector('.adl-branch-graph__info-btn');
    expect(btn).toBeTruthy();
    return btn;
  });
  fireEvent.mouseEnter(infoBtn0!);
  await vi.waitFor(
    () => {
      const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
      expect(tooltip).toBeTruthy();
      expect(tooltip!.textContent).toContain('branch head');
    },
    { timeout: 2000 },
  );

  // Row 1 = second newest commit (non-HEAD on main) → should NOT show any annotation
  fireEvent.mouseEnter(rows[1]);
  const infoBtn1 = await vi.waitFor(() => {
    const btn = rows[1].querySelector('.adl-branch-graph__info-btn');
    expect(btn).toBeTruthy();
    return btn;
  });
  fireEvent.mouseEnter(infoBtn1!);
  await vi.waitFor(
    () => {
      const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
      expect(tooltip).toBeTruthy();
      // Should not contain "branch head" for non-HEAD commits
      expect(tooltip!.textContent).not.toContain('branch head');
      expect(tooltip!.textContent).not.toContain('merged');
      expect(tooltip!.textContent).not.toContain('local only');
    },
    { timeout: 2000 },
  );
});
```

- [ ] **Step 3: Run all tests**

Run: `pnpm --dir frontend run test -- BranchGraph`
Expected: All tests PASS.

---

### Task 5: Add test for local-only branch annotation

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

- [ ] **Step 1: Add test for local-only priority**

```typescript
it('shows local-only annotation for local-only branch heads', async () => {
  const dataWithLocalOnly = {
    ...mockData,
    branchProgress: {
      'heatmap-chart-generalization': { ahead: 0, behind: 0 }, // no mergeBase = local-only
    },
  };
  const { container } = render(<BranchGraph data={dataWithLocalOnly} />);
  const rows = container.querySelectorAll('.adl-branch-graph__row');

  // Find the row for the heatmap-chart-generalization branch head
  // In mock data, find the commit that is the head of this branch
  const headRow = [...rows].find(
    (r) => r.getAttribute('data-branch') === 'heatmap-chart-generalization',
  );
  expect(headRow).toBeTruthy();

  fireEvent.mouseEnter(headRow!);
  const infoBtn = await vi.waitFor(() => {
    const btn = headRow!.querySelector('.adl-branch-graph__info-btn');
    expect(btn).toBeTruthy();
    return btn;
  });
  fireEvent.mouseEnter(infoBtn!);
  await vi.waitFor(
    () => {
      const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
      expect(tooltip).toBeTruthy();
      expect(tooltip!.textContent).toContain('local only');
    },
    { timeout: 2000 },
  );
});
```

Note: This test assumes the mock data contains a commit with branch `heatmap-chart-generalization`. If it doesn't, we need to either use an existing branch with no mergeBase or add one to the mock data.

Alternatively, test with a branch that has `branchProgress` without `mergeBase` in the existing mock data. Looking at `mockData`, the allBranches list determines what branches exist. We can add `branchProgress` for any existing branch without a mergeBase.

- [ ] **Step 2: Run all tests**

Run: `pnpm --dir frontend run test -- BranchGraph`
Expected: All tests PASS.

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm --dir frontend run test`
Expected: All tests PASS.

- [ ] **Step 2: Run linter**

Run: `npx eslint .` in `frontend/` directory
Expected: No new errors.