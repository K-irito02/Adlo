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
    const nodes = [node('b'), node('c'), node('a')];
    const edges = [edge('b', 'a'), edge('c', 'a')];
    const result = computeColumns(nodes, edges, isDark);
    expect(result.columnOf.get('b')!.col).toBe(0);
    expect(result.columnOf.get('c')!.col).toBe(1);
    expect(result.columnOf.get('a')!.col).toBe(0);
  });

  it('handles complex graph: merge then converge', () => {
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
