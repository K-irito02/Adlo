# Branch Tooltip Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix branch info display in CommitTooltipCard — pass `refs` through adapter, fix `branch` priority, enrich branch section with progress/remote/tag data.

**Architecture:** Rust backend fix (1 line logic change in `branch_graph.rs`) + frontend adapter fix (1 line mapping in `chartDataAdapters.ts`) + CommitTooltipCard enhancement + CSS addition.

**Tech Stack:** Rust (adl-types, adl-workspace), TypeScript/React (frontend)

**Global Constraints:**
- All existing tests must pass (115 baseline)
- `refs` must be passed through `adaptBranchGraphData` as-is from `RawBranchGraph`
- `branch` assignment must prefer local (non-origin/upstream) refs over remote ones
- Emoji not allowed in production code (use text labels)
- All new CSS classes use `adl-branch-graph__tooltip-` prefix

---

### Task 1: Fix Rust backend `branch` priority

**Files:**
- Modify: `ai-digital-life/crates/workspace/src/git/git_vis/branch_graph.rs:43-69`

**Interfaces:**
- Consumes: (none — self-contained change)
- Produces: `GitVisBranchNode.branch` now prefers local refs over remote ones

- [ ] **Step 1: Understand the current logic**

Read `branch_graph.rs` lines 43-69. The current assignment logic:
```rust
if branch.is_empty() {
    branch = r2.to_string();
}
```
This sets `branch` to the FIRST non-tag, non-HEAD ref. If `origin/main` comes before `feature-x`, `branch = "origin/main"`.

- [ ] **Step 2: Change branch assignment to prefer local refs**

Replace the single `if branch.is_empty()` with a conditional that overrides remote refs with local ones:

```rust
if branch.is_empty() {
    branch = r2.to_string();
} else if !r2.starts_with("origin/") && !r2.starts_with("upstream/")
    && (branch.starts_with("origin/") || branch.starts_with("upstream/"))
{
    branch = r2.to_string();
}
```

This logic:
- If `branch` is empty: set it (original behavior)
- If `branch` is already set to a remote ref AND current ref is a local ref: override
- If `branch` is already a local ref: keep it (no change)
- If current ref is also remote: keep original (first remote wins)

- [ ] **Step 3: Verify Rust compiles**

Run: `cargo build --package adl-workspace`
Expected: Build succeeds without warnings

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/crates/workspace/src/git/git_vis/branch_graph.rs
git commit -m "fix(branch-graph): prefer local refs over remote for node.branch"
```

---

### Task 2: Fix frontend adapter `refs` mapping

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts:227-237`

**Interfaces:**
- Consumes: `RawBranchGraph.nodes[i].refs` (already in type)
- Produces: `CommitNode.refs` populated (was previously missing)

- [ ] **Step 1: Read the current mapping code**

In `chartDataAdapters.ts`, the `adaptBranchGraphData` function maps `raw.nodes` to `CommitNode[]`:
```typescript
const nodes = raw.nodes.map((n, i) => ({
  id: `node-${i}`,
  hash: n.hash,
  shortHash: n.shortHash ?? n.hash.substring(0, 7),
  branch: n.branch,
  date: n.date,
  message: n.message,
  author: n.author,
  authorEmail: n.authorEmail,
  tag: n.tag,
  // refs is MISSING
}));
```

- [ ] **Step 2: Add `refs` mapping**

Add `refs: n.refs,` after `tag: n.tag,`:
```typescript
const nodes = raw.nodes.map((n, i) => ({
  id: `node-${i}`,
  hash: n.hash,
  shortHash: n.shortHash ?? n.hash.substring(0, 7),
  branch: n.branch,
  date: n.date,
  message: n.message,
  author: n.author,
  authorEmail: n.authorEmail,
  tag: n.tag,
  refs: n.refs,
}));
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `pnpm --dir ai-digital-life/frontend run test -- --run src/app/features/git-visualization`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts
git commit -m "fix(branch-graph): pass refs field through adaptBranchGraphData"
```

---

### Task 3: Enhance CommitTooltipCard branch section

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**Interfaces:**
- Consumes: `CommitTooltipCardProps` gains `branchProgress`, `tag`
- Produces: Branch section shows primary+branch progress + local refs + remote refs + tag

- [ ] **Step 1: Add `branchProgress` and `tag` to CommitTooltipCardProps**

Find the interface (around line 79-87). Add `branchProgress` and `tag`:
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
}
```

- [ ] **Step 2: Update `uniqueRefs` computation**

The current filter removes `origin/` refs entirely. Change to separate local vs remote:
```typescript
const localRefs = refs.filter(
  (r) => r !== branch && !r.startsWith('origin/') && !r.startsWith('upstream/'),
);
const remoteRefs = refs.filter(
  (r) => r !== branch && (r.startsWith('origin/') || r.startsWith('upstream/')),
);
```

- [ ] **Step 3: Replace the branch section JSX**

Replace the current branch section (lines starting with `{(branch || uniqueRefs.length > 0) && (`) with:
```tsx
{(branch || localRefs.length > 0 || remoteRefs.length > 0 || tag) && (
  <>
    <hr className="adl-branch-graph__tooltip-divider" />
    <div className="adl-branch-graph__tooltip-branches">
      <div className="adl-branch-graph__tooltip-branches-label">分支</div>
      <div className="adl-branch-graph__tooltip-branches-list">
        {/* Primary branch with ahead/behind */}
        {branch && (
          <span className="adl-branch-graph__tooltip-branch-badge adl-branch-graph__tooltip-branch-badge--primary">
            {branch}
            {branchProgress && (branchProgress.ahead > 0 || branchProgress.behind > 0) && (
              <span className="adl-branch-graph__tooltip-branch-progress">
                {branchProgress.ahead > 0 && <span>↑{branchProgress.ahead}</span>}
                {branchProgress.behind > 0 && <span>↓{branchProgress.behind}</span>}
              </span>
            )}
          </span>
        )}
        {/* Additional local branches */}
        {localRefs.map((ref) => (
          <span key={ref} className="adl-branch-graph__tooltip-branch-badge">{ref}</span>
        ))}
        {/* Remote tracking branches */}
        {remoteRefs.length > 0 && localRefs.length > 0 && <br />}
        {remoteRefs.map((ref) => (
          <span key={ref} className="adl-branch-graph__tooltip-remote-badge">{ref}</span>
        ))}
      </div>
      {/* Tag */}
      {tag && (
        <div className="adl-branch-graph__tooltip-tag-row">
          <span className="adl-branch-graph__tooltip-tag-badge">{tag}</span>
        </div>
      )}
    </div>
  </>
)}
```

- [ ] **Step 4: Pass `branchProgress` and `tag` to CommitTooltipCard**

In the row render, update the CommitTooltipCard call (around line 800-812):

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
/>
```

- [ ] **Step 5: Run tests**

Run: `pnpm --dir ai-digital-life/frontend run test -- --run src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "feat(branch-graph): enrich tooltip branch section with progress, remote refs, tag"
```

---

### Task 4: Add CSS for new branch elements

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`

- [ ] **Step 1: Add CSS for progress, remote badge, and tag row**

Find the existing `adl-branch-graph__tooltip-branch-badge--primary` block in CSS. Add after it:

```css
.adl-branch-graph__tooltip-branch-progress {
  display: inline-flex;
  gap: 3px;
  margin-left: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  vertical-align: middle;
}

.adl-branch-graph__tooltip-remote-badge {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
  white-space: nowrap;
  opacity: 0.7;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.adl-branch-graph__tooltip-tag-row {
  margin-top: 6px;
}

.adl-branch-graph__tooltip-tag-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--tag-bg, var(--bg-hover));
  color: var(--tag-fg, var(--text-secondary));
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm --dir ai-digital-life/frontend run test -- --run src/app/features/git-visualization`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "style(branch-graph): add CSS for tooltip branch progress, remote badge, tag"
```

---

### Task 5: Run full test suite and verify

- [ ] **Step 1: Run all git-visualization tests**

Run: `pnpm --dir ai-digital-life/frontend run test -- --run src/app/features/git-visualization`
Expected: 115+ tests pass

- [ ] **Step 2: Check that the `refs` test fixture data matches production**

Read `frontend/src/test-fixtures/gitVisMockData.ts` — verify that `CommitNode` entries include `refs` field with expected data.

- [ ] **Step 3: Final verify Rust compiles**

Run: `cargo build --package adl-workspace`
Expected: No warnings
