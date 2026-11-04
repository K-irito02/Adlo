import { describe, it, expect } from 'vitest';
import { computeBranchOwnership } from './branchOwnership';
import type { CommitNode, CommitEdge } from '../types/gitGraph';

function node(id: string, overrides: Partial<CommitNode> = {}): CommitNode {
  return {
    id,
    hash: id,
    shortHash: id,
    branch: '',
    date: '',
    message: '',
    author: '',
    authorEmail: '',
    refs: [],
    ...overrides,
  };
}

function edge(source: string, target: string): CommitEdge {
  return { source, target };
}

describe('computeBranchOwnership', () => {
  it('handles empty input', () => {
    expect(computeBranchOwnership([], [], []).size).toBe(0);
  });

  it('owns the single commit by its branch', () => {
    const nodes = [node('a1', { refs: ['main'] })];
    const owner = computeBranchOwnership(nodes, [], ['main']);
    expect(owner.get('a1')).toBe('main');
  });

  it('linear main→model-settings: shared spine owned by main, new commits by model-settings', () => {
    const nodes = [
      node('m1'),
      node('m2'),
      node('m3', { refs: ['main', 'origin/main'] }),
      node('s1'),
      node('s2', { refs: ['model-settings'] }),
    ];
    // model-settings (s2 → s1 → m3 → m2 → m1), main tip = m3 (pushed, has origin/main)
    const edges = [edge('s2', 's1'), edge('s1', 'm3'), edge('m3', 'm2'), edge('m2', 'm1')];
    const branches = ['model-settings', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('m1')).toBe('main');
    expect(owner.get('m2')).toBe('main');
    expect(owner.get('m3')).toBe('main');
    expect(owner.get('s1')).toBe('model-settings');
    expect(owner.get('s2')).toBe('model-settings');
  });

  it('independent branches: shared ancestor goes to main (spine), side commits to feature', () => {
    const nodes = [node('z'), node('a1', { refs: ['main'] }), node('f1', { refs: ['feature-1'] })];
    // main spine: a1 → z
    const edges = [edge('a1', 'z'), edge('f1', 'z')];
    const branches = ['feature-1', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('z')).toBe('main');
    expect(owner.get('a1')).toBe('main');
    expect(owner.get('f1')).toBe('feature-1');
  });

  it('mainline spine is not stolen by a short side branch forked nearby', () => {
    const nodes = [
      node('x'),
      node('y1'),
      node('y2', { refs: ['main'] }),
      node('z1', { refs: ['release'] }),
    ];
    // release forks from x (1 commit), main advanced y1 → y2 on top of x.
    // BFS-wise the release tip is CLOSER to x than the main tip is — but x is
    // on main's first-parent spine, so it must stay owned by main.
    const edges = [edge('y1', 'x'), edge('y2', 'y1'), edge('z1', 'x')];
    const branches = ['release', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('x')).toBe('main');
    expect(owner.get('y1')).toBe('main');
    expect(owner.get('y2')).toBe('main');
    expect(owner.get('z1')).toBe('release');
  });

  it('merge commit: main owns the merge + its base, feature owns only its own commit', () => {
    // main at z, feature f forks from z, feature merged back into main → m.
    // Git-faithful parent order: merge commit m lists main-side parent (z) first.
    const nodes = [node('z'), node('f', { refs: ['feature'] }), node('m', { refs: ['main'] })];
    const edges = [edge('m', 'z'), edge('m', 'f'), edge('f', 'z')];
    const branches = ['feature', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('m')).toBe('main');
    expect(owner.get('z')).toBe('main');
    expect(owner.get('f')).toBe('feature');
  });

  it('merged feature commits stay on the feature branch (nearest non-mainline tip)', () => {
    // main: z → m (merge of feature b1), main tip m.
    // feature: z → f1 → f2 (tip). b1/b2 are NOT on main's first-parent spine,
    // so the nearest branch tip (feature) owns them.
    const nodes = [
      node('z'),
      node('m', { refs: ['main'] }),
      node('f1'),
      node('f2', { refs: ['feature'] }),
    ];
    const edges = [edge('m', 'z'), edge('m', 'f2'), edge('f2', 'f1'), edge('f1', 'z')];
    const branches = ['feature', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('m')).toBe('main');
    expect(owner.get('z')).toBe('main');
    expect(owner.get('f1')).toBe('feature');
    expect(owner.get('f2')).toBe('feature');
  });

  it('excludes remote-tracking refs from ownership', () => {
    const nodes = [node('r1', { refs: ['origin/only-remote'] }), node('shared')];
    const edges = [edge('r1', 'shared')];
    const branches = ['origin/only-remote'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('r1')).toBeUndefined();
    expect(owner.get('shared')).toBeUndefined();
  });

  it('does not treat tags as branch owners', () => {
    const nodes = [node('c2', { refs: ['main', 'v1.0'] }), node('c1')];
    const edges = [edge('c2', 'c1')];
    const branches = ['main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('c2')).toBe('main');
    expect(owner.get('c1')).toBe('main');
  });

  it('non-spine commits reachable only from main fall back to main (orphaned merge parents)', () => {
    // main merged an already-deleted branch: second parent of the merge is
    // reachable from main but from no existing tip → main owns it.
    const nodes = [node('z'), node('dead', { refs: [] }), node('m', { refs: ['main'] })];
    const edges = [edge('m', 'z'), edge('m', 'dead'), edge('dead', 'z')];
    const branches = ['main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('m')).toBe('main');
    expect(owner.get('dead')).toBe('main');
    expect(owner.get('z')).toBe('main');
  });

  it('spine barrier: a fast-forwarding branch never crosses the mainline spine', () => {
    // main: base → mm (mm merged a since-deleted branch whose commits are the
    // second parent `dead`). model-settings fast-forwards on top of mm. Without
    // the spine barrier, model-settings' BFS would walk the entire spine and
    // claim the orphaned `dead` as its own.
    const nodes = [
      node('base'),
      node('dead', { refs: [] }),
      node('mm', { refs: ['main'] }),
      node('s1'),
      node('s2', { refs: ['model-settings'] }),
    ];
    // git-faithful parents: mm's first parent is base, second is dead.
    const edges = [
      edge('mm', 'base'),
      edge('mm', 'dead'),
      edge('dead', 'base'),
      edge('s1', 'mm'),
      edge('s2', 's1'),
    ];
    const branches = ['model-settings', 'main'];
    const owner = computeBranchOwnership(nodes, edges, branches);
    expect(owner.get('mm')).toBe('main');
    expect(owner.get('base')).toBe('main');
    expect(owner.get('dead')).toBe('main'); // orphan → falls back to main
    expect(owner.get('s1')).toBe('model-settings');
    expect(owner.get('s2')).toBe('model-settings');
  });

  it('real-repo shape: a 36-commit fast-forward branch owns exactly its own commits', () => {
    // Mirrors the real SourceWorkspace repo: main at merge (with an orphaned
    // merge second-parent `orphan`), and model-settings fast-forwards with 36
    // commits on top. Every model-settings commit must be owned by
    // model-settings and the orphan must stay on main.
    const nodes: CommitNode[] = [
      node('base', { refs: ['main'] }),
      node('orphan', { refs: [] }),
      node('merge', { refs: ['main'] }),
    ];
    const edges: CommitEdge[] = [
      edge('merge', 'base'),
      edge('merge', 'orphan'),
      edge('orphan', 'base'),
    ];
    let prev = 'merge';
    for (let i = 1; i <= 36; i += 1) {
      const id = `s${String(i).padStart(2, '0')}`;
      nodes.push(node(id, i === 36 ? { refs: ['model-settings'] } : {}));
      edges.push(edge(id, prev));
      prev = id;
    }
    const owner = computeBranchOwnership(nodes, edges, ['model-settings', 'main']);
    expect(owner.get('base')).toBe('main');
    expect(owner.get('merge')).toBe('main');
    expect(owner.get('orphan')).toBe('main');
    for (let i = 1; i <= 36; i += 1) {
      expect(owner.get(`s${String(i).padStart(2, '0')}`)).toBe('model-settings');
    }
  });
});
