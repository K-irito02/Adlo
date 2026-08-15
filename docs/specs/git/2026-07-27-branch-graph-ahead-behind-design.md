# Branch Graph Ahead/Behind Indicators Design

**Date**: 2026-07-27
**Status**: Draft

## 1. Problem

Users need to know the progress difference between local and remote branches directly in the branch graph visualization. Currently, there is no visual indication of whether a local branch is ahead (unpushed commits), behind (unpulled remote commits), or in sync with its remote tracking branch.

## 2. Solution Overview

Add ahead/behind indicators to the branch graph in three layers:
1. **Label bar**: numeric `↑N ↓M` display with color coding and tooltip
2. **SVG lane**: hatched node pattern + dense dashed edges for ahead commits
3. **Backend**: compute ahead/behind counts and merge-base per branch

## 3. Data Types

### Rust (`adl-types`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchProgress {
    pub ahead: u32,
    pub behind: u32,
    pub merge_base: Option<String>,
}

// Append to GitVisBranchGraph
pub struct GitVisBranchGraph {
    pub nodes: Vec<GitVisBranchNode>,
    pub edges: Vec<GitVisBranchEdge>,
    pub branches: Vec<String>,
    pub branch_progress: HashMap<String, BranchProgress>,
}
```

### Node.js Preview Service

```typescript
interface BranchProgress {
  ahead: number;
  behind: number;
  mergeBase?: string;
}
// Return type extension:
return { nodes, edges, branches: sortedBranches, branchProgress };
```

### Frontend Adapter

```typescript
export interface RawBranchGraph {
  nodes: ...;
  edges: ...;
  branches: string[];
  branchProgress?: Record<string, { ahead: number; behind: number; mergeBase?: string }>;
}
```

## 4. Backend Computation

For each branch in `branches` that does NOT start with `origin/` and is not `HEAD`:

```
// 1. Check if remote counterpart exists
git rev-parse --verify origin/{name}

// 2. If exists:
ahead = git rev-list --count origin/{name}..{name}
behind = git rev-list --count {name}..origin/{name}
mergeBase = git merge-base {name} origin/{name}

// 3. If remote does not exist (local-only):
ahead = git rev-list --count {name} --not --all
behind = 0
mergeBase = null
```

Run all git commands in parallel (`Promise.all` for Node.js, `tokio::join!` for Rust).

## 5. Label Bar Display

### Text Format

```
main ↑3 ↓2
```

Show `↑N ↓M` only when the branch has a remote tracking counterpart (i.e., the branch name exists in both local and remote form).

### Status Indicator

Instead of modifying the branch color (which should remain stable for identification), add a small colored dot indicator before the branch name:

| State | Indicator | Label Example | Condition |
|-------|-----------|--------------|-----------|
| Ahead only | Green dot | `🟢 main ↑3` | ahead > 0 && behind = 0 |
| Behind only | Red dot | `🔴 main ↓2` | behind > 0 && ahead = 0 |
| Diverged | Orange dot | `🟠 main ↑3 ↓2` | ahead > 0 && behind > 0 |
| Synced | No dot | `main` | ahead = 0 && behind = 0 |
| Remote ref (origin/*) | No dot | `origin/main` | N/A |

The indicator is an inline SVG circle (4px) rendered before the label text, not an emoji.

### Tooltip (on hover)

```
「main」相对远程 origin/main:
  ↑ 领先 3 个提交（未推送）
  ↓ 落后 2 个提交（可拉取）
  同步基准: abc1234
```

### Dedup Column Support

For merged column groups (multiple columns sharing one label):
- ahead = max of all columns' ahead values
- behind = max of all columns' behind values
- mergeBase = first non-null merge base

## 6. SVG Lane Visual Feedback

### Ahead Region Determination

For each column labeled with a branch that has `branchProgress` data:
1. Look up `mergeBase` hash for that branch
2. Find the row index of the merge-base commit in the rendered rows
3. All rows ABOVE (lower index, newer) the merge-base row are "ahead" commits

### Node Style: Hatched Circle

Ahead commits use an SVG pattern fill instead of solid fill:

```tsx
// SVG <defs> (added once per unique color)
<defs>
  <pattern id={`hatch-${colorIndex}`} patternUnits="userSpaceOnUse"
           width="5" height="5" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth={1} />
  </pattern>
</defs>

// Ahead node rendering
<circle cx={x} cy={y} r={r}
  fill={`url(#hatch-${colorIndex})`}
  stroke={color} strokeWidth={2} />
```

### Edge Style: Dense Dashed

Edges where BOTH source and target nodes are in the ahead region:

```typescript
if (isSourceAhead && isTargetAhead) {
  strokeDasharray="2,3"
}
```

### Edge Cases

- If merge-base is not found (local-only branch with no remote): ALL commits are ahead → all nodes hatched, all edges dashed
- If branch is fully behind (no local-only commits): no ahead region → no hatched nodes, no dashed edges
- If column has no progress data (origin/* ref): no visual change
- If merge-base commit is not in visible rows: ahead region is computed from ALL rows, but rendering only affects visible rows. Non-visible ahead commits still use the hatched style when they scroll into view (computed from row data, not scroll position)

## 7. Files to Modify

| File | Change |
|------|--------|
| `crates/types/src/lib.rs` | Add `BranchProgress` struct, extend `GitVisBranchGraph` |
| `crates/workspace/src/git/git_vis/branch_graph.rs` | Compute ahead/behind per branch, populate `branch_progress` |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | Add `computeBranchProgress`, include in response |
| `frontend/.../adapters/chartDataAdapters.ts` | Add `branchProgress` to `RawBranchGraph` |
| `frontend/.../charts/BranchGraph.tsx` | Label bar: ahead/behind text + color + tooltip. SVG: hatched nodes + dashed edges |
| `frontend/.../charts/BranchGraph.test.tsx` | Update tests |

## 8. Testing

- Unit test: verify `computeBranchProgress` returns correct ahead/behind for known branches
- Visual: check label bar shows correct numbers and colors
- Visual: check SVG ahead nodes use hatched pattern
- Visual: check SVG ahead edges use dashed style
- Edge case: local-only branch (no remote) → all ahead
- Edge case: synced branch → no visual change
- Edge case: remote-only ref → no change
