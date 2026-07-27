# Branch Graph Ahead/Behind Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ahead/behind indicators to the branch graph — label bar shows `↑N ↓M` with status dot + tooltip, SVG uses hatched nodes and dashed edges for ahead commits.

**Architecture:** Backend computes ahead/behind per branch via git commands and includes in the API response. Frontend renders status in label bar and SVG.

**Tech Stack:** Node.js + Rust backends, TypeScript/React frontend, SVG patterns for hatched nodes

## Global Constraints

- Both Node.js preview service AND Rust Tauri backend must compute `branchProgress`
- `BranchProgress = { ahead: number, behind: number, mergeBase?: string }`
- Label bar shows `↑N ↓M` only when branch has remote counterpart
- Status indicator: green dot (ahead only), red dot (behind only), orange dot (diverged)
- SVG: ahead nodes use SVG pattern fill (diagonal lines); ahead edges use `strokeDasharray="2,3"`
- No new npm/cargo dependencies
- Work from: `E:\AI-DIGITAL-LIFE\SourceWorkspace`

---
## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | Modify | Add `computeBranchProgress`, include in `handleBranchGraph` response |
| `crates/types/src/lib.rs` | Modify | Add `BranchProgress` struct, extend `GitVisBranchGraph` |
| `crates/workspace/src/git/git_vis/branch_graph.rs` | Modify | Compute ahead/behind, populate `branch_progress` |
| `frontend/.../adapters/chartDataAdapters.ts` | Modify | Add `branchProgress` to `RawBranchGraph` |
| `frontend/.../charts/BranchGraph.tsx` | Modify | Label bar: text + indicator + tooltip. SVG: hatched nodes + dashed edges |
| `frontend/.../charts/BranchGraph.test.tsx` | Modify | Update tests for new features |

---

### Task 1: Node.js backend — computeBranchProgress

**Files:**
- Modify: `frontend/dev/previewWorkspaceService/gitVisualization.ts`

**Interfaces:**
- Produces: `computeBranchProgress(rootPath, branches)` → `Record<string, { ahead: number; behind: number; mergeBase?: string }>`

- [ ] **Step 1: Add `computeBranchProgress` function to `gitVisualization.ts`**

```typescript
interface BranchProgress {
  ahead: number;
  behind: number;
  mergeBase?: string;
}

async function computeBranchProgress(
  rootPath: string,
  branches: string[],
): Promise<Record<string, BranchProgress>> {
  const result: Record<string, BranchProgress> = {};
  const tasks = branches
    .filter(b => !b.startsWith('origin/') && b !== 'HEAD')
    .map(async (branch) => {
      const remote = `origin/${branch}`;
      // Check if remote tracking branch exists
      const remoteCheck = await runGit(rootPath, ['rev-parse', '--verify', remote]);
      if (!remoteCheck) {
        // Local-only branch: count commits not on any remote
        const count = (await runGit(rootPath, ['rev-list', '--count', branch, '--not', '--all'])) || '0';
        result[branch] = { ahead: parseInt(count.trim()) || 0, behind: 0 };
        return;
      }
      const [aheadRaw, behindRaw] = await Promise.all([
        runGit(rootPath, ['rev-list', '--count', `${remote}..${branch}`]),
        runGit(rootPath, ['rev-list', '--count', `${branch}..${remote}`]),
      ]);
      const mergeBase = (await runGit(rootPath, ['merge-base', branch, remote]))?.trim();
      result[branch] = {
        ahead: parseInt(aheadRaw?.trim() || '0') || 0,
        behind: parseInt(behindRaw?.trim() || '0') || 0,
        mergeBase: mergeBase || undefined,
      };
    });
  await Promise.all(tasks);
  return result;
}
```

- [ ] **Step 2: Integrate into `handleBranchGraph`**

After computing `sortedBranches`, add:
```typescript
const branchProgress = await computeBranchProgress(rootPath, sortedBranches);
return { nodes, edges, branches: sortedBranches, branchProgress };
```

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/dev/previewWorkspaceService/gitVisualization.ts
git commit -m "feat(branch-graph): add computeBranchProgress for ahead/behind data"
```

---

### Task 2: Rust backend — BranchProgress types + computation

**Files:**
- Modify: `crates/types/src/lib.rs`
- Modify: `crates/workspace/src/git/git_vis/branch_graph.rs`

**Interfaces:**
- Produces: `BranchProgress` struct, branch_progress in `GitVisBranchGraph`, ahead/behind computation

- [ ] **Step 1: Add `BranchProgress` to `adl-types`**

In `crates/types/src/lib.rs`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchProgress {
    pub ahead: u32,
    pub behind: u32,
    pub merge_base: Option<String>,
}
```

Extend `GitVisBranchGraph`:
```rust
pub struct GitVisBranchGraph {
    pub nodes: Vec<GitVisBranchNode>,
    pub edges: Vec<GitVisBranchEdge>,
    pub branches: Vec<String>,
    pub branch_progress: HashMap<String, BranchProgress>,
}
```

- [ ] **Step 2: Compute ahead/behind in `capture_branch_graph`**

After computing `branch_set`, before the sort:

```rust
use tokio::task::JoinSet;
use std::collections::HashMap;

let mut branch_progress: HashMap<String, BranchProgress> = HashMap::new();
let mut bg = root.to_path_buf();

// For each local branch, compute ahead/behind
let local_branches: Vec<String> = branch_set.iter()
    .filter(|b| !b.starts_with("origin/") && b.as_str() != "HEAD")
    .cloned().collect();

let mut js = JoinSet::new();
for branch in &local_branches {
    let remote = format!("origin/{}", branch);
    let bg_clone = bg.clone();
    let branch_name = branch.clone();
    
    js.spawn(async move {
        let remote_ok = super::super::git_helpers::run_git_with_timeout(
            &bg_clone, &["rev-parse", "--verify", &remote]
        ).await;
        
        if remote_ok.is_none() {
            let count = super::super::git_helpers::run_git_with_timeout(
                &bg_clone, &["rev-list", "--count", &branch_name, "--not", "--all"]
            ).await.unwrap_or_default().trim().parse::<u32>().unwrap_or(0);
            return (branch_name, BranchProgress { ahead: count, behind: 0, merge_base: None });
        }
        
        let (a, b, mb) = tokio::join!(
            super::super::git_helpers::run_git_with_timeout(&bg_clone, &["rev-list", "--count", &format!("{remote}..{branch_name}")]),
            super::super::git_helpers::run_git_with_timeout(&bg_clone, &["rev-list", "--count", &format!("{branch_name}..{remote}")]),
            super::super::git_helpers::run_git_with_timeout(&bg_clone, &["merge-base", &branch_name, &remote]),
        );
        
        (branch_name, BranchProgress {
            ahead: a.unwrap_or_default().trim().parse().unwrap_or(0),
            behind: b.unwrap_or_default().trim().parse().unwrap_or(0),
            merge_base: mb.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        })
    });
}

while let Some(res) = js.join_next().await {
    if let Ok((name, progress)) = res {
        branch_progress.insert(name, progress);
    }
}
```

Then include in the return:
```rust
Ok(GitVisBranchGraph { nodes, edges, branches: branch_set, branch_progress })
```

- [ ] **Step 3: Verify compilation**

```bash
cd ai-digital-life && cargo check 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add crates/types/src/lib.rs crates/workspace/src/git/git_vis/branch_graph.rs
git commit -m "feat(branch-graph): add BranchProgress types and Rust computation"
```

---

### Task 3: Frontend adapter types

**Files:**
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`

- [ ] **Step 1: Add `branchProgress` to `RawBranchGraph`**

```typescript
export interface RawBranchGraph {
  nodes: ...;
  edges: ...;
  branches: string[];
  branchProgress?: Record<string, { ahead: number; behind: number; mergeBase?: string }>;
}
```

Also expose the type for use in the component:
```typescript
export interface BranchProgressEntry {
  ahead: number;
  behind: number;
  mergeBase?: string;
}
```

- [ ] **Step 2: Pass through in `adaptBranchGraphData`**

```typescript
export function adaptBranchGraphData(raw: RawBranchGraph): {
  nodes: CommitNode[];
  edges: CommitEdge[];
  allBranches: string[];
  branchProgress?: Record<string, { ahead: number; behind: number; mergeBase?: string }>;
} {
  return {
    nodes, edges, allBranches: raw.branches,
    branchProgress: raw.branchProgress,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts
git commit -m "feat(branch-graph): add branchProgress to frontend types"
```

---

### Task 4: Frontend label bar — ahead/behind text + indicator + tooltip

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

**Interfaces:**
- Consumes: `adapted.branchProgress` from Task 3

- [ ] **Step 1: Add ahead/behind data to ColumnInfo**

In the `columnsWithLabels` useMemo, after computing labels, merge with `branchProgress`:

```typescript
// After dedup grouping and before return:
const progress = adapted?.branchProgress ?? {};
const labeledWithProgress = labeled.map(c => ({
  ...c,
  branchProgress: progress[c.label],
}));
```

Add a new interface:
```typescript
interface LabelColumnInfo extends ColumnInfo {
  branchProgress?: { ahead: number; behind: number; mergeBase?: string };
  filterCols: number[];
}
```

- [ ] **Step 2: Update label bar rendering**

Each label button shows:
```tsx
{col.branchProgress && (col.branchProgress.ahead > 0 || col.branchProgress.behind > 0) && (
  <span className="adl-branch-graph__label-progress" style={{ fontSize: 10, marginLeft: 2 }}>
    {col.branchProgress.ahead > 0 && `↑${col.branchProgress.ahead}`}
    {col.branchProgress.ahead > 0 && col.branchProgress.behind > 0 && ' '}
    {col.branchProgress.behind > 0 && `↓${col.branchProgress.behind}`}
  </span>
)}
```

- [ ] **Step 3: Add status indicator dot**

Before the label text, add an inline SVG circle:
```tsx
{col.branchProgress && (col.branchProgress.ahead > 0 || col.branchProgress.behind > 0) && (
  <svg width="6" height="6" style={{ marginRight: 3, flexShrink: 0 }}>
    <circle cx="3" cy="3" r="3" fill={
      col.branchProgress.ahead > 0 && col.branchProgress.behind === 0 ? '#22c55e' :
      col.branchProgress.behind > 0 && col.branchProgress.ahead === 0 ? '#ef4444' :
      '#f59e0b'
    } />
  </svg>
)}
```

- [ ] **Step 4: Add tooltip**

Use the existing `title` attribute on the label `<span>`:
```typescript
const tooltipText = col.branchProgress
  ? `${col.label} — ↑${col.branchProgress.ahead} ahead, ↓${col.branchProgress.behind} behind${col.branchProgress.mergeBase ? ` (merge-base: ${col.branchProgress.mergeBase})` : ''}`
  : col.label;
```

```tsx
<span title={tooltipText}>
  {col.label}
</span>
```

- [ ] **Step 5: Update tests**

Update `BranchGraph.test.tsx` — the mock data doesn't have `branchProgress`, so existing tests should pass without changes (branchProgress defaults to `undefined`/`{}`). Add a new test:

```typescript
it('shows ahead indicator for branch with progress', () => {
  const dataWithProgress = {
    ...mockData,
    branchProgress: { main: { ahead: 3, behind: 1, mergeBase: 'abc1234' } },
  };
  const { container } = render(<BranchGraph data={dataWithProgress} />);
  expect(container.querySelector('.adl-branch-graph__label-progress')?.textContent).toContain('↑3');
  expect(container.querySelector('.adl-branch-graph__label-progress')?.textContent).toContain('↓1');
});
```

- [ ] **Step 6: TypeScript check + tests**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit 2>&1
npx vitest run --reporter=verbose src/app/features/git-visualization/ 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx
git commit -m "feat(branch-graph): add ahead/behind label indicators"
```

---

### Task 5: Frontend SVG — hatched nodes + dashed edges

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**Interfaces:**
- Consumes: `columnOf`, `columnsWithLabels` with `branchProgress` from Task 4

- [ ] **Step 1: Build a map of ahead commit IDs**

In the component body (after `columnsWithLabels`), compute which rows are ahead:

```typescript
// For each column with a merge-base, find rows that are ahead (above merge-base)
const aheadRows = useMemo(() => {
  const ahead = new Set<number>();
  const progress = adapted?.branchProgress ?? {};
  for (const col of columnsWithLabels) {
    const bp = (col as any).branchProgress as (typeof progress)[string] | undefined;
    if (!bp?.mergeBase) continue;
    // Find row index of merge-base commit
    const mbRow = visibleRows.findIndex(r => r.node.hash.startsWith(bp.mergeBase!));
    if (mbRow === -1) continue;
    // All rows above (lower index) merge-base are ahead
    for (let i = 0; i < mbRow; i++) {
      if ((col as any).filterCols?.includes(rows[i].column)) {
        ahead.add(i);
      }
    }
  }
  return ahead;
}, [columnsWithLabels, rows, visibleRows, adapted?.branchProgress]);
```

- [ ] **Step 2: Add SVG `<defs>` for hatched patterns**

In the component's return, inside the SVG element or before the column lines:

```tsx
{/* SVG defs for hatched patterns — one per column color */}
<defs>
  {columns.map((col, idx) => (
    <pattern key={`hatch-${idx}`} id={`hatch-${idx}`}
      patternUnits="userSpaceOnUse" width="5" height="5"
      patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke={col.color} strokeWidth={1} />
    </pattern>
  ))}
</defs>
```

- [ ] **Step 3: Modify node rendering**

In `SvgLanes`, add `aheadRows` prop and modify node rendering:

```typescript
// Before rendering each node, check if it's an ahead row:
const rowGlobalIdx = rows.indexOf(row); // actual index in full rows array
const isNodeAhead = aheadRows.has(rowGlobalIdx);
```

For ahead nodes (circles, rectangles):
```typescript
if (isNodeAhead) {
  fill = `url(#hatch-${col.colorIndex})`;  // use pattern fill instead of solid
}
```

- [ ] **Step 4: Modify edge rendering**

For edges where BOTH source and target are ahead:
```typescript
const isSourceAhead = aheadRows.has(sourceIdx);
const isTargetAhead = aheadRows.has(targetIdx);
const isEdgeAhead = isSourceAhead && isTargetAhead;
```

```typescript
strokeDasharray={isEdgeAhead ? '2,3' : (sourceIdx > targetIdx ? '4,3' : 'none')}
```

- [ ] **Step 5: TypeScript check + tests**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit 2>&1
npx vitest run --reporter=verbose src/app/features/git-visualization/ 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "feat(branch-graph): add hatched SVG nodes and dashed edges for ahead commits"
```

---

## Verification

1. Restart dev server
2. Open branch graph — verify label bar shows `↑N ↓M` for branches with remote counterparts
3. Verify status dot colors (green/red/orange)
4. Hover a label — verify tooltip shows ahead/behind details
5. Verify SVG nodes for ahead commits show hatched pattern (diagonal lines)
6. Verify edges between ahead commits use dense dashed lines
7. Verify nodes/edges for synced commits remain unchanged (solid fill, solid lines)
8. Scroll up/down — verify ahead styling persists correctly
