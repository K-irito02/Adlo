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
  columnOf: Map<string, { col: number; color: string }>;
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

  const parentMap = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = parentMap.get(edge.source) || [];
    existing.push(edge.target);
    parentMap.set(edge.source, existing);
  }

  // Kahn's algorithm for topological sort (newest first, input-order stable)
  const inDegree = new Map<string, number>();
  for (const node of nodes) inDegree.set(node.id, 0);
  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) queue.push(node.id);
  }
  const sorted: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    sorted.push(id);
    const parents = parentMap.get(id) || [];
    for (const p of parents) {
      const remaining = inDegree.get(p)! - 1;
      inDegree.set(p, remaining);
      if (remaining === 0) queue.push(p);
    }
  }

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
  const columnSet = new Map<number, string>();

  for (const id of sorted) {
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
      col = incoming[0];
      color = lanes[col]!.color;
    }

    for (const idx of incoming) lanes[idx] = null;

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

    columnOf.set(id, { col, color });
    if (!columnSet.has(col)) {
      columnSet.set(col, color);
    }

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
