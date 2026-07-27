# Branch Graph Lane Assignment — Gitamine Algorithm Implementation

**Date**: 2026-07-27
**Status**: Draft
**Author**: AI
**Approach**: Solution B — Top-down Dynamic Lane Assignment (Gitamine-style)

## 1. Problem Statement

The current branch graph implementation assigns lanes based on `node.branch === lane.branch` string matching. The `branches[]` array order is non-deterministic (depends on `branchSet` insertion order in git log output), causing:

- Remote refs (`origin/feature/*`) appearing left of `main`
- Table rows showing feature branch commits interspersed with main branch commits
- No topological basis for lane assignment — color, position, and label are all derived from flat branch names rather than the commit DAG

## 2. Solution Overview

Replace the current branch-name-based lane assignment with a **topology-based dynamic lane assignment** algorithm. The algorithm processes commits in topological order (newest first) and assigns each commit a column index based on the DAG structure:

- The **first-parent chain** of the current HEAD continues in column 0 (leftmost)
- **Merged branches** get new columns to the right
- **Converging branches** merge when their lanes reach a shared ancestor
- Columns are **stable** — once assigned, they never shift left or right

## 3. Architecture

### 3.1 Data Flow

```
Backend (unchanged):
  handleBranchGraph / capture_branch_graph
    → { nodes: Node[], edges: Edge[], branches: string[] }

Frontend (new):
  adaptBranchGraphData(raw)              # unchanged
    → { nodes: CommitNode[], edges: CommitEdge[] }

  useLaneAssignment(nodes, edges)        # NEW — replaces assignLanes + branch→lane
    → { columnOf: Map<hash, ColumnInfo>, columns: ColumnInfo[] }

  buildRows(nodes, edges, columnOf)      # MODIFIED — uses columnOf instead of lanes
    → RowData[]  { node, column, color, parents, isMerge }

  SvgLanes(rows, columns, ...)           # MODIFIED — uses columns/column instead of lanes/lane.index

  LabelBar(columns)                      # MODIFIED — derived from columns, not branches[]
```

### 3.2 Files

| File | Change |
|------|--------|
| `frontend/.../hooks/useLaneAssignment.ts` | **New** — core algorithm |
| `frontend/.../charts/BranchGraph.tsx` | **Modified** — replace lane logic |
| `frontend/.../hooks/useBranchLabelDragReorder.ts` | **Modified** — adapt to columns (optional, may defer) |
| No backend changes | — |

## 4. Lane Assignment Algorithm

### 4.1 Data Structures

```typescript
interface LaneEntry {
  /** The commit hash this lane is currently targeting (pointing to). */
  targetHash: string;
  /** The color assigned to this lane. */
  color: string;
}

interface ColumnInfo {
  /** 0-based column index (0 = leftmost). */
  index: number;
  /** CSS color string for this column's line and nodes. */
  color: string;
  /** Display label (derived from topmost commit's branch ref). */
  label: string;
}

interface ColumnAssignment {
  /** Per-commit assignment: commit hash → column + color. */
  columnOf: Map<string, { column: number; color: string }>;
  /** Ordered list of all columns with their labels. */
  columns: ColumnInfo[];
}
```

### 4.2 Algorithm (Top-down, Newest First)

```
Input: commits sorted by topological order (children before parents), top-to-bottom.
       edges = [{from: childHash, to: parentHash}]

lanes: (LaneEntry | null)[] = []   // active lanes tracking which hash each column targets

for each commit c in topo order (from newest to oldest):
    // Step 1: Find incoming lanes — columns currently targeting this commit
    incoming = lanes
        .map((l, idx) => l !== null && l.targetHash === c.hash ? idx : -1)
        .filter(idx => idx !== -1)

    // Step 2: Determine column and color
    if incoming.length === 0:
        col = lanes.indexOf(null)  // first free slot
        if col === -1: col = lanes.length  // append
        color = nextColor()  // see §4.3
    else:
        col = incoming[0]  // first incoming lane's index (corresponds to first-parent)
        color = lanes[col]!.color  // inherit color

    // Step 3: Remove all incoming lanes (they converge at this commit)
    for each idx in incoming:
        lanes[idx] = null

    // Step 4: Assign parent targets
    parents = edges.filter(e => e.from === c.hash).map(e => e.to)
    if parents.length === 0:
        lanes[col] = null  // root commit, column ends
    else:
        lanes[col] = { targetHash: parents[0], color }  // first-parent continues
        for each extraParent p in parents[1:]:
            freeIdx = lanes.indexOf(null)
            if freeIdx === -1: freeIdx = lanes.length
            lanes[freeIdx] = { targetHash: p, color: nextColor() }

    // Step 5: Record assignment
    columnOf.set(c.hash, { column: col, color: color })

    // Step 6: Trim trailing nulls
    while lanes.length > 0 && lanes[lanes.length - 1] === null:
        lanes.pop()
```

### 4.3 Color Assignment

Colors are assigned by a monotonic counter (deterministic per algorithm run). Since the algorithm produces the same column order for the same graph topology, colors are consistent across sessions. Adjacent columns get visually distinct hues through golden-angle spacing.

```typescript
let colorCounter = 0;  // reset at start of each algorithm run

function nextColor(): string {
  // Deterministic golden-angle hue from a monotonic counter.
  // Adjacent columns always differ by ~137.5°, ensuring visual separation.
  const hue = (colorCounter * GOLDEN_ANGLE) % 360;
  const saturation = isDark ? 55 : 65;
  const lightness = isDark ? 42 : 58;
  colorCounter++;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
```

## 5. Label Derivation

For each column, its label is the **branch name** of the **topmost commit** in that column:

```typescript
function deriveColumnLabels(
  columns: ColumnInfo[],
  nodes: CommitNode[],
  columnOf: Map<string, { column: number; color: string }>
): void {
  // Find the topmost commit per column (lowest index in topo order = newest)
  const topCommitPerColumn = new Map<number, CommitNode>();
  for (const node of nodes) {
    const col = columnOf.get(node.hash)?.column;
    if (col === undefined) continue;
    if (!topCommitPerColumn.has(col)) {
      topCommitPerColumn.set(col, node);  // first encountered = newest
    }
  }

  for (const col of columns) {
    const top = topCommitPerColumn.get(col.index);
    col.label = top?.branch || `#${top?.shortHash || col.index}`;
  }
}
```

Priority order for label text when top commit has multiple refs:
1. `HEAD -> branchName` (current branch) — use `branchName`
2. Local branch ref (no `origin/` prefix) — use as-is
3. Remote tracking ref (`origin/...`) — use as-is
4. No branch ref — use short hash

## 6. Component Changes

### 6.1 `BranchGraph.tsx`

| Section | Current | New |
|---------|---------|-----|
| Lanes computation | `assignLanes(previewOrder, isDark)` | `useLaneAssignment(nodes, edges, isDark)` |
| Rows computation | `buildRows(nodes, edges, lanes)` | `buildRows(nodes, edges, columnOf)` |
| `SvgLanes` invoke | `lanes={lanes}` | `columns={columns}` |
| Label bar | `lanes.map(l => button)` | `columns.map(c => button)` |
| Label filter | `filterBranches: Set<string>` | `filterBranches: Set<number>` (column indices) |
| `visibleRows` | `rows.slice(0, visibleCount)` | unchanged |

### 6.2 `buildRows` — new signature

```typescript
function buildRows(
  nodes: CommitNode[],
  edges: CommitEdge[],
  columnOf: Map<string, { column: number; color: string }>
): RowData[] {
  // ...topological sort unchanged...
  return sorted.map(id => {
    const node = commitById.get(id)!;
    const colInfo = columnOf.get(id) ?? { column: 0, color: '#888' };
    const parents = parentMap.get(id) || [];
    return {
      node,
      column: colInfo.column,
      color: colInfo.color,
      parents,
      isMerge: parents.length >= 2,
    };
  });
}
```

### 6.3 `SvgLanes` — column-based rendering

```typescript
interface ColumnInfo {
  index: number;
  color: string;
  label: string;
}

interface RowData {
  node: CommitNode;
  column: number;        // was: lane: LaneMap
  color: string;         // was: lane.color
  parents: string[];
  isMerge: boolean;
}
```

Lane lines:
```typescript
const columnLines = columns.map(col => {
  const x = getLaneX(col.index);
  const yPositions = rows
    .map((r, i) => r.column === col.index ? i : -1)
    .filter(i => i !== -1)
    .map(i => nodeY(i));
  if (yPositions.length === 0) return null;
  return <line key={`col-${col.index}`} x1={x} y1={yPositions[0]}
               x2={x} y2={yPositions[yPositions.length-1]}
               stroke={col.color} ... />;
});
```

Edges:
```typescript
if (row.column === parentRow.column) {
  // straight vertical line
} else {
  // bezier curve between columns
}
```

## 7. Edge Cases

| Case | Handling |
|------|----------|
| **Root commit** (no parents) | `lanes[col] = null` — column ends, no continuation |
| **Linear history** | All commits → col 0, straight line |
| **Merge commit** (2 parents) | First parent continues col 0, second gets new column |
| **Octopus merge** (3+ parents) | First parent continues, each extra parent → new column |
| **Branch point** (shared ancestor) | Multiple incoming lanes converge → all removed → only first-parent continues |
| **Orphan branch** (never merged) | Gets new column at tip, persists through ancestry to branch point |
| **Converging lanes** (two branches with same ancestor) | Both lanes target same hash → both removed → first-parent continues |
| **Detached HEAD** | No `HEAD -> Branch` ref; algorithm uses pure topology, unaffected |
| **Empty repo** | `columns=[]`, `rows=[]`, renders placeholder |
| **Single commit** | `columns=[{index:0}]`, `rows=[{column:0}]` |
| **Tag-only commit** | No branch ref → label falls back to short hash |

## 8. Testing Strategy

### 8.1 Unit Tests (new file: `useLaneAssignment.test.ts`)

| Test case | Input | Expected |
|-----------|-------|----------|
| Linear 3 commits | A→B→C | All col=0 |
| Simple merge | M(parents:A,B), A→Z, B→Z | M col=0, A col=0, Z col=0; B col=1 |
| Octopus merge | M(parents:A,B,C) | A col=0, B col=1, C col=2 |
| Orphan branch | A→B (no merge) | A col=0, B col=1 (or col depends on other branches) |
| Converging ancestry | B→A, C→A (two lanes point to A) | A gets first incoming lane's col, other lane removed |
| Empty nodes | [] | columns=[], rows=[] |
| Single node | [A] | A col=0, columns=[{index:0}] |

### 8.2 Visual Regression Tests

- Compare branch graph rendering before/after on the same repo data
- Verify lane lines are straight (no gaps or drift)
- Verify label text matches expected branch names
- Verify filter behavior (click label → dim unrelated commits)

### 8.3 Manual Testing Checklist

1. Open branch graph on the main repo (1142 commits, 27 branches)
2. Verify `main` is the leftmost column
3. Verify `origin/feature/phase-2-missing-features` column is to the right of `main`
4. Scroll to bottom — verify column lines persist through entire history
5. Check a merge commit — verify incoming curve from right column
6. Check a branch point — verify right column ends at convergence
7. Verify labels appear for each column (at least the ones with named refs)
8. Verify drag-and-drop reorder still works (or is gracefully disabled)

## 9. Rollout Plan

1. Implement `useLaneAssignment` hook with algorithm
2. Modify `buildRows` and `SvgLanes` to use column-based data
3. Update label derivation and label bar
4. Remove `assignLanes` function and branch→lane mapping
5. Run unit tests
6. Run visual tests
7. Manual verification on target repo
8. Remove diagnostic logs

## 10. Future Enhancements (not in scope)

- Pin-to-left / column reorder persistence (Solution C L0-L1)
- Remote ref visual distinction (italic/icon) (Solution C L3)
- "Show Current Branch Only" toggle
- Ghost branch indicators on hover
