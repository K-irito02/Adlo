# Branch Graph Lane Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace branch-name-based lane matching with DAG-topology-based dynamic lane assignment (Gitamine algorithm).

**Architecture:** No backend changes. Add `useLaneAssignment` hook implementing top-down active-lane tracking. Modify `buildRows` and `SvgLanes` to use column indices instead of branch names. Labels derived from each column's topmost commit.

**Tech Stack:** TypeScript, React hooks, Canvas-free SVG rendering

## Global Constraints

- No backend changes — all logic in frontend hooks/components
- `nodes` use `node-N` IDs from `adaptBranchGraphData`; `edges` use `source`/`target` with those IDs
- `ColumnInfo` = `{ index: number; color: string; label: string }`
- `LaneEntry` = `{ targetHash: string; color: string }`
- Color: monotonic counter × golden-angle (137.508°), dark/light theme support
- Topological sort: DFS children-before-parents, then reverse for newest-first
- No new dependencies

---
## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `.../hooks/useLaneAssignment.ts` | Create | Core algorithm: `computeColumns()` + label derivation |
| `.../hooks/__tests__/useLaneAssignment.test.ts` | Create | Unit tests for `computeColumns()` |
| `.../charts/BranchGraph.tsx` | Modify | Integrate `useLaneAssignment`, replace `buildRows`, `SvgLanes`, label bar |
| `.../hooks/useBranchLabelDragReorder.ts` | Modify | Defer drag-reorder (accept columns, not branches) |

---

### Task 1: `useLaneAssignment` hook + tests

**Files:**
- Create: `frontend/src/app/features/git-visualization/hooks/useLaneAssignment.ts`
- Create: `frontend/src/app/features/git-visualization/hooks/__tests__/useLaneAssignment.test.ts`

**Interfaces:**
- Consumes: `CommitNode`, `CommitEdge` (from `test-fixtures/gitVisMockData`)
- Produces: `computeColumns(nodes, edges, isDark)` → `{ columnOf, columns, deriveLabels }`

- [ ] **Step 1: Create the hook file with types and `computeColumns`**

```typescript
// useLaneAssignment.ts
import { useMemo } from 'react';
import type { CommitNode, CommitEdge } from '../../../../test-fixtures/gitVisMockData';

const GOLDEN_ANGLE = 137.508;

interface LaneEntry {
  targetHash: string;
  color: string;
}

export interface ColumnInfo {
  index: number;
  color: string;
  label: string;
}

export interface LaneAssignment {
  /** node.id → { col: column index, color: CSS string } */
  columnOf: Map<string, { col: number; color: string }>;
  /** Ordered list of all columns, with labels populated */
  columns: ColumnInfo[];
}

export function computeColumns(
  nodes: CommitNode[],
  edges: CommitEdge[],
  isDark: boolean,
): LaneAssignment {
  if (nodes.length === 0) {
    return { columnOf: new Map(), columns: [] };
  }

  // Build parent map: childId → parentId[]
  const parentMap = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = parentMap.get(edge.source) || [];
    existing.push(edge.target);
    parentMap.set(edge.source, existing);
  }

  // Topological sort: children before parents, deepest first
  const visited = new Set<string>();
  const sorted: string[] = [];
  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const parents = parentMap.get(id) || [];
    for (const p of parents) dfs(p);
    sorted.push(id);
  }
  for (const node of nodes) dfs(node.id);
  sorted.reverse(); // newest first (top-to-bottom)

  // Color generator
  let colorCounter = 0;
  function nextColor(): string {
    const hue = (colorCounter * GOLDEN_ANGLE) % 360;
    const sat = isDark ? 55 : 65;
    const light = isDark ? 42 : 58;
    colorCounter++;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  const lanes: (LaneEntry | null)[] = [];
  const columnOf = new Map<string, { col: number; color: string }>();
  const columnSet = new Map<number, string>(); // colIndex → color

  for (const id of sorted) {
    // Find incoming lanes (lanes targeting this commit)
    const incoming: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] !== null && lanes[i]!.targetHash === id) {
        incoming.push(i);
      }
    }

    let col: number;
    let color: string;

    if (incoming.length === 0) {
      col = lanes.indexOf(null);
      if (col === -1) col = lanes.length;
      color = nextColor();
    } else {
      col = incoming[0]; // first-parent lane
      color = lanes[col]!.color;
    }

    // Remove incoming lanes (they converge here)
    for (const idx of incoming) lanes[idx] = null;

    // Route to parents
    const parents = parentMap.get(id) || [];
    if (parents.length > 0) {
      lanes[col] = { targetHash: parents[0], color };
      for (let i = 1; i < parents.length; i++) {
        const freeIdx = lanes.indexOf(null);
        if (freeIdx === -1) {
          lanes.push({ targetHash: parents[i], color: nextColor() });
        } else {
          lanes[freeIdx] = { targetHash: parents[i], color: nextColor() };
        }
      }
    }

    // Record
    columnOf.set(id, { col, color });
    if (!columnSet.has(col)) {
      columnSet.set(col, color);
    }

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
  }

  const columns: ColumnInfo[] = Array.from(columnSet.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, color]) => ({ index, color, label: '' }));

  return { columnOf, columns };
}

export function useLaneAssignment(
  nodes: CommitNode[],
  edges: CommitEdge[],
  isDark: boolean,
): LaneAssignment {
  return useMemo(() => {
    if (nodes.length === 0) return { columnOf: new Map(), columns: [] };
    return computeColumns(nodes, edges, isDark);
  }, [nodes, edges, isDark]);
}
```

- [ ] **Step 2: Write unit tests**

```typescript
// __tests__/useLaneAssignment.test.ts
import { describe, it, expect } from 'vitest';
import { computeColumns } from '../useLaneAssignment';
import type { CommitNode, CommitEdge } from '../../../../../test-fixtures/gitVisMockData';

const isDark = true;

function node(id: string, overrides: Partial<CommitNode> = {}): CommitNode {
  return { id, hash: id, shortHash: id, branch: '', date: '', message: '', author: '', authorEmail: '', ...overrides };
}

function edge(source: string, target: string): CommitEdge {
  return { source, target };
}

describe('computeColumns', () => {
  it('handles empty nodes', () => {
    const result = computeColumns([], [], isDark);
    expect(result.columnOf.size).toBe(0);
    expect(result.columns).toEqual([]);
  });

  it('handles single root commit', () => {
    const nodes = [node('a')];
    const result = computeColumns(nodes, [], isDark);
    expect(result.columnOf.get('a')).toEqual({ col: 0, color: expect.any(String) });
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].index).toBe(0);
  });

  it('assigns linear commits to same column', () => {
    const nodes = [node('c'), node('b'), node('a')];
    const edges = [edge('c', 'b'), edge('b', 'a')];
    const result = computeColumns(nodes, edges, isDark);
    expect(result.columnOf.get('c')!.col).toBe(0);
    expect(result.columnOf.get('b')!.col).toBe(0);
    expect(result.columnOf.get('a')!.col).toBe(0);
    expect(result.columns).toHaveLength(1);
  });

  it('assigns merge second-parent to new column', () => {
    // M (merge, parents: A, B)
    const nodes = [node('m'), node('a'), node('b')];
    const edges = [edge('m', 'a'), edge('m', 'b')];
    const result = computeColumns(nodes, edges, isDark);
    expect(result.columnOf.get('m')!.col).toBe(0);
    expect(result.columnOf.get('a')!.col).toBe(0);
    expect(result.columnOf.get('b')!.col).toBe(1);
    expect(result.columns).toHaveLength(2);
  });

  it('handles octopus merge (3+ parents)', () => {
    const nodes = [node('m'), node('a'), node('b'), node('c')];
    const edges = [edge('m', 'a'), edge('m', 'b'), edge('m', 'c')];
    const result = computeColumns(nodes, edges, isDark);
    expect(result.columnOf.get('m')!.col).toBe(0);
    expect(result.columnOf.get('a')!.col).toBe(0);
    expect(result.columnOf.get('b')!.col).toBe(1);
    expect(result.columnOf.get('c')!.col).toBe(2);
    expect(result.columns).toHaveLength(3);
  });

  it('converges two branches at common ancestor', () => {
    // B→A, C→A (B and C both point to A)
    const nodes = [node('b'), node('c'), node('a')];
    const edges = [edge('b', 'a'), edge('c', 'a')];
    const result = computeColumns(nodes, edges, isDark);
    // B gets col=0, C gets col=1, A inherits first incoming (col=0)
    expect(result.columnOf.get('b')!.col).toBe(0);
    expect(result.columnOf.get('c')!.col).toBe(1);
    expect(result.columnOf.get('a')!.col).toBe(0);
  });

  it('handles complex graph: merge then converge', () => {
    // M (merge, parents: A, F3)
    // A → Z
    // F3 → F2 → Z
    const nodes = [node('m'), node('f3'), node('f2'), node('a'), node('z')];
    const edges = [
      edge('m', 'a'), edge('m', 'f3'),
      edge('a', 'z'),
      edge('f3', 'f2'), edge('f2', 'z'),
    ];
    const result = computeColumns(nodes, edges, isDark);
    expect(result.columnOf.get('m')!.col).toBe(0);
    expect(result.columnOf.get('a')!.col).toBe(0);
    expect(result.columnOf.get('f3')!.col).toBe(1);
    expect(result.columnOf.get('f2')!.col).toBe(1);
    // Both lanes converge at Z; Z inherits first-parent lane (col=0)
    expect(result.columnOf.get('z')!.col).toBe(0);
  });

  it('produces stable colors for same topology', () => {
    const nodes = [node('m'), node('a'), node('b')];
    const edges = [edge('m', 'a'), edge('m', 'b')];
    const r1 = computeColumns(nodes, edges, isDark);
    const r2 = computeColumns(nodes, edges, isDark);
    expect(r1.columnOf.get('m')!.color).toBe(r2.columnOf.get('m')!.color);
    expect(r1.columnOf.get('b')!.color).toBe(r2.columnOf.get('b')!.color);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/hooks/__tests__/useLaneAssignment.test.ts 2>&1
```

Expected: Tests fail because `useLaneAssignment.ts` doesn't exist yet.

- [ ] **Step 4: Create `useLaneAssignment.ts` with the implementation from Step 1**

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/hooks/__tests__/useLaneAssignment.test.ts 2>&1
```

Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/hooks/useLaneAssignment.ts
git add ai-digital-life/frontend/src/app/features/git-visualization/hooks/__tests__/useLaneAssignment.test.ts
git commit -m "feat(branch-graph): add computeColumns lane assignment algorithm"
```

---

### Task 2: Integrate `useLaneAssignment` into `BranchGraph.tsx`

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**Interfaces:**
- Consumes: `computeColumns` and `LaneAssignment` from Task 1
- Produces: Working branch graph with column-based rendering

- [ ] **Step 1: Replace `assignLanes` and related types**

Remove these from the file:
```typescript
interface LaneMap {
  branch: string;
  index: number;
  color: string;
}

function assignLanes(branches: string[], isDark: boolean): LaneMap[] {
  return branches.map((branch, i) => ({
    branch,
    index: i,
    color: getBranchColor(branch, isDark),
  }));
}
```

Add import:
```typescript
import { useLaneAssignment } from '../hooks/useLaneAssignment';
import type { ColumnInfo } from '../hooks/useLaneAssignment';
```

- [ ] **Step 2: Update `RowData` interface**

```typescript
interface RowData {
  node: CommitNode;
  column: number;      // was: lane: LaneMap
  color: string;       // was: lane.color
  parents: string[];
  isMerge: boolean;
}
```

- [ ] **Step 3: Update `buildRows` signature and logic**

```typescript
function buildRows(
  nodes: CommitNode[],
  edges: CommitEdge[],
  columnOf: Map<string, { col: number; color: string }>,
): RowData[] {
  const commitById = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = computeParentMap(edges);

  const visited = new Set<string>();
  const sorted: string[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const parents = parentMap.get(id) || [];
    for (const p of parents) visit(p);
    sorted.push(id);
  }
  for (const node of nodes) visit(node.id);
  sorted.reverse();

  if (columnOf.size === 0) return [];

  return sorted.map((id) => {
    const node = commitById.get(id)!;
    const parents = parentMap.get(id) || [];
    const cinfo = columnOf.get(id) ?? { col: 0, color: '#888' };
    return {
      node,
      column: cinfo.col,
      color: cinfo.color,
      parents,
      isMerge: parents.length >= 2,
    };
  });
}
```

- [ ] **Step 4: Update `SvgLanes` props and implementation**

```typescript
interface SvgLanesProps {
  rows: RowData[];
  columns: ColumnInfo[];            // was: lanes: LaneMap[]
  edges: CommitEdge[];
  totalWidth: number;
  totalHeight: number;
  hoveredId: string | null;
  nodeStroke: string;
  filterBranches: Set<string>;     // keeps branch-name strings for compatibility
  hoveredBranch: string | null;
}
```

Lane lines (was `laneLines`):
```typescript
const columnLines = columns.map((col) => {
  const x = getLaneX(col.index);
  const yPositions = rows
    .map((r, i) => (r.column === col.index ? i : -1))
    .filter((i) => i !== -1)
    .map((i) => nodeY(i));
  if (yPositions.length === 0) return null;
  const laneDimmed =
    filterBranches.size > 0 && !filterBranches.has(col.label) && col.label !== hoveredBranch;
  return (
    <line
      key={`col-${col.index}`}
      x1={x} y1={yPositions[0]} x2={x} y2={yPositions[yPositions.length - 1]}
      stroke={col.color}
      strokeWidth={3} strokeLinecap="round"
      opacity={laneDimmed ? 0.1 : 0.5}
    />
  );
});
```

Edge rendering update — replace `sourceRow.lane.index === targetRow.lane.index` with `sourceRow.column === targetRow.column`:
```typescript
const sx = getLaneX(sourceRow.column);
const sy = nodeY(sourceIdx);
const tx = getLaneX(targetRow.column);
const ty = nodeY(targetIdx);

if (sourceRow.column === targetRow.column) {
  // straight line — same as before, just use .column
  connections.push(
    <line key={`edge-${edge.source}-${edge.target}`}
      x1={sx} y1={sy} x2={tx} y2={ty}
      stroke={sourceRow.color}
      strokeWidth={2.5} strokeLinecap="round"
      opacity={edgeDimmed ? 0.1 : 1}
    />
  );
} else {
  // curve — same structure, different column values
  const midY = (sy + ty) / 2;
  connections.push(
    <path
      key={`edge-${edge.source}-${edge.target}`}
      d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
      fill="none" stroke={sourceRow.color}
      strokeWidth={2}
      strokeDasharray={sourceIdx > targetIdx ? '4,3' : 'none'}
      opacity={edgeDimmed ? 0.1 : 0.6}
    />
  );
}
```

Node rendering update — replace `row.lane.index` and `row.lane.color` with `row.column` and `row.color`:
```typescript
const x = getLaneX(row.column);
const nodeDimmed =
  filterBranches.size > 0 &&
  !filterBranches.has(row.node.branch) &&
  row.node.branch !== hoveredBranch;

// Tag nodes
if (row.node.tag) {
  return (
    <g key={`node-${row.node.id}`} opacity={nodeDimmed ? 0.1 : 1}>
      <circle cx={x} cy={y} r={r + 1} fill="none" stroke={row.color} strokeWidth={2.5} />
      <circle cx={x + 14} cy={y - 8} r={8} fill={row.color} opacity={0.15} />
      <text x={x + 14} y={y - 5} textAnchor="middle" fontSize={8} fill={row.color} fontWeight={600}>
        {row.node.tag}
      </text>
    </g>
  );
}

// Merge nodes
if (row.isMerge) {
  return (
    <rect key={`node-${row.node.id}`}
      x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2}
      fill={row.color} stroke={nodeStroke} strokeWidth={2}
      opacity={nodeDimmed ? 0.1 : 1}
    />
  );
}

// Normal nodes
return (
  <circle key={`node-${row.node.id}`}
    cx={x} cy={y} r={r}
    fill={row.color} stroke={nodeStroke} strokeWidth={2}
    opacity={nodeDimmed ? 0.1 : 1}
  />
);
```

- [ ] **Step 5: Update BranchGraph component body**

Replace lane-related computations:

```typescript
// BEFORE (remove these):
const branches = useMemo(() => adapted?.allBranches ?? [], [adapted]);
const { previewOrder, ... } = useBranchLabelDragReorder(branches, () => {});
const lanes = useMemo(() => assignLanes(previewOrder, isDark), [previewOrder, isDark]);
const rows = useMemo(() => {
  if (!adapted) return [];
  return buildRows(adapted.nodes, adapted.edges, lanes);
}, [adapted, lanes]);
```

```typescript
// AFTER:
const { columnOf, columns } = useLaneAssignment(
  adapted?.nodes ?? [],
  adapted?.edges ?? [],
  isDark,
);

const rows = useMemo(() => {
  if (!adapted) return [];
  return buildRows(adapted.nodes, adapted.edges, columnOf);
}, [adapted, columnOf]);
```

Label bar — derive labels from columns (find topmost commit per column):
```typescript
// After rows are computed, derive labels for each column
const columnsWithLabels = useMemo(() => {
  if (rows.length === 0) return columns;
  const topCommitPerCol = new Map<number, string>();
  for (const row of rows) {
    if (!topCommitPerCol.has(row.column)) {
      topCommitPerCol.set(row.column, row.node.branch || row.node.shortHash);
    }
  }
  return columns.map(c => ({
    ...c,
    label: topCommitPerCol.get(c.index) ?? `#${c.index}`,
  }));
}, [columns, rows]);
```

Update `totalLaneWidth` calculation:
```typescript
const totalLaneWidth = columns.length * (LANE_WIDTH + LANE_GAP);
```

Update `SvgLanes` invocation:
```tsx
<SvgLanes
  rows={visibleRows}
  columns={columnsWithLabels}    // was: lanes={lanes}
  edges={adapted?.edges ?? []}
  totalWidth={totalLaneWidth}
  totalHeight={totalHeight}
  hoveredId={hoveredId}
  nodeStroke={nodeStroke}
  filterBranches={filterBranches}
  hoveredBranch={hoveredLabel}
/>
```

- [ ] **Step 6: Update label bar rendering**

```tsx
<div ref={tagRowRef} className="adl-branch-graph__tag-row" onWheel={handleTagRowWheel}>
  {columnsWithLabels.map((col) => {
    const isSelected = filterBranches.has(col.label);
    const isHovered = hoveredLabel === col.label;
    const showIndicator = isSelected || isHovered;
    const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
    return (
      <div
        key={`col-${col.index}`}
        className="adl-branch-graph__label-drag"
        data-branch-drag-id={col.label}
        style={{ opacity: 1 }}
      >
        <button
          className="adl-branch-graph__label"
          data-indicator={showIndicator ? 'true' : undefined}
          data-scale={showScale ? 'true' : undefined}
          onClick={() => handleLabelClick(col.label)}
          onMouseEnter={() => setHoveredLabel(col.label)}
          onMouseLeave={() => setHoveredLabel(null)}
          style={{
            padding: '2px 8px',
            borderRadius: 0,
            background: col.color,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            opacity: filterBranches.size === 0 || filterBranches.has(col.label) ? 1 : 0.4,
          }}
        >
          <span className="adl-branch-graph__label-text" title={col.label}>
            {col.label}
          </span>
        </button>
      </div>
    );
  })}
</div>
```

Remove `useBranchLabelDragReorder` call and its imports (the drag-reorder hook is incompatible with column-based assignment; we remove it to avoid the dead code warning and re-introduce it later as a UX enhancement):
```typescript
// Remove:
import { useBranchLabelDragReorder } from '../hooks/useBranchLabelDragReorder';
// And remove the hook invocation and its dependent props.

// Also remove this code (no longer needed since columns are derived, not ordered by user):
// {isDragging && ghostLabel && createPortal(...)}
```

Remove `handleTagRowWheel` if `tagRowRef` is no longer used with drag-reorder. Keep it — the tag row still needs horizontal scroll support.

- [ ] **Step 7: Update table row rendering**

Replace `row.lane.color` with `row.color` in the table section:
```tsx
{row.node.tag && (
  <span className="adl-branch-graph__tag"
    style={{ ... background: row.color, ... }}>
    {row.node.tag}
  </span>
)}
```

- [ ] **Step 8: Run existing tests to verify no regressions**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose 2>&1
```

- [ ] **Step 9: Check TypeScript compilation**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit 2>&1
```

- [ ] **Step 10: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "feat(branch-graph): integrate column-based lane assignment"
```

---

### Task 3: Cleanup and remove dead code

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`
- Modify: `frontend/src/app/features/git-visualization/hooks/useBranchLabelDragReorder.ts` (optional)

- [ ] **Step 1: Remove unused code from BranchGraph.tsx**

Remove these artifacts:
- `import { useBranchLabelDragReorder } from '../hooks/useBranchLabelDragReorder';`
- `import type { LaneMap } from ...` (if still referenced after `assignLanes` removal)
- The `assignLanes` function
- The `useBranchLabelDragReorder` hook call and destructured variables
- The `isDragging && ghostLabel && createPortal(...)` JSX block
- The `lanes` variable from `SvgLanes` (already removed in Task 2)

Verify no more references:
```bash
cd ai-digital-life/frontend && grep -n "assignLanes\|LaneMap\|useBranchLabelDragReorder\|draggedBranchId\|ghostLabel\|isDragging\|cursorPosition" src/app/features/git-visualization/charts/BranchGraph.tsx
```

- [ ] **Step 2: Remove unused `filterBranches`-related label matching** (the filter now uses `col.label`, not `lane.branch`, so the old `node.branch`-based dimming code in table rows still works via `row.node.branch`)

Verify `row.node.branch` references in table row dimming still use `node.branch` (which comes from the backend) — no change needed here.

- [ ] **Step 3: Remove diagnostic console.log probes** (if any remain)

```bash
cd ai-digital-life/frontend && grep -n "console.log\|console.warn\|console.error" src/app/features/git-visualization/charts/BranchGraph.tsx
```

If any [ADL-DEBUG] logs remain, remove them.

- [ ] **Step 4: Run full test suite**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose 2>&1
```

- [ ] **Step 5: TypeScript check**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/git-visualization/
git commit -m "chore(branch-graph): remove dead code, clean up"
```

---

## Rollout & Verification

1. **Restart dev server** to pick up the updated `BranchGraph.tsx` component.
2. **Open branch graph** and verify:
   - `main` is leftmost lane column
   - Feature branch columns appear to the right in merge order
   - All commits have correct lane lines (no gaps)
   - Merge edges curve correctly between columns
   - Branch labels match expected names
   - Filter by label click still works
   - Scroll down: lane lines continue correctly
   - Scroll up: new commits at top get correct columns
3. **DevTools check**: no React errors or warnings
4. **Run `pnpm run lint`** to check for lint errors
