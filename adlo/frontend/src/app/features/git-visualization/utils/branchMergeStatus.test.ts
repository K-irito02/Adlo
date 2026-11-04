import { describe, it, expect } from 'vitest';
import { computeMergedBranches } from './branchMergeStatus';
import { commitNodes, commitEdges, allBranches } from '../../../../test-fixtures/gitVisMockData';

describe('computeMergedBranches', () => {
  it('marks branches whose tips are reachable from the mainline as merged', () => {
    const merged = computeMergedBranches(commitNodes, commitEdges, allBranches);
    // feature-1 tip (b8) is an octopus-merge parent of main's a14;
    // hotfix tip (h2) is a first-parent ancestor of main's a15 via a14.
    expect(merged.has('feature-1')).toBe(true);
    expect(merged.has('hotfix')).toBe(true);
  });

  it('never marks branches with commits unreachable from mainline as merged', () => {
    const merged = computeMergedBranches(commitNodes, commitEdges, allBranches);
    // feature-2/3/4 and release/v1.0 are not ancestors of the mainline tip.
    expect(merged.has('feature-2')).toBe(false);
    expect(merged.has('feature-3')).toBe(false);
    expect(merged.has('feature-4')).toBe(false);
    expect(merged.has('release/v1.0')).toBe(false);
  });

  it('never reports the mainline itself as merged', () => {
    const merged = computeMergedBranches(commitNodes, commitEdges, allBranches);
    expect(merged.has('main')).toBe(false);
  });

  it('marks a branch fast-forward absorbed onto the mainline spine as merged', () => {
    // a8 sits on main's first-parent spine (a3 → a7 → a8 → a10).
    // An archived branch whose tip is a8 is fully merged: no exclusive commits.
    const nodes = commitNodes.map((n) =>
      n.id === 'a8' ? { ...n, refs: [...(n.refs ?? []), 'archived'] } : n,
    );
    const branches = [...allBranches, 'archived'];
    const merged = computeMergedBranches(nodes, commitEdges, branches);
    expect(merged.has('archived')).toBe(true);
  });

  it('ignores remote-tracking refs and HEAD as branches', () => {
    const nodes = commitNodes.map((n) =>
      n.id === 'a15' ? { ...n, refs: ['main', 'origin/main', 'HEAD'] } : n,
    );
    const branches = ['main', 'origin/main', 'HEAD'];
    const merged = computeMergedBranches(nodes, commitEdges, branches);
    expect(merged.has('origin/main')).toBe(false);
    expect(merged.has('main')).toBe(false);
  });

  it('returns an empty set when there are no local branches', () => {
    const merged = computeMergedBranches(commitNodes, commitEdges, []);
    expect(merged.size).toBe(0);
  });

  it('returns an empty set when only the mainline exists', () => {
    const merged = computeMergedBranches(commitNodes, commitEdges, ['main']);
    expect(merged.size).toBe(0);
  });

  it('returns an empty set when the mainline tip is unknown', () => {
    // main has no refs anywhere → mainline tips empty → nothing can be merged.
    const nodes = commitNodes.filter((n) => n.id !== 'a15');
    const branches = ['main', 'feature-1'];
    const merged = computeMergedBranches(nodes, commitEdges, branches);
    expect(merged.size).toBe(0);
  });

  it('handles an empty node/edge graph', () => {
    const merged = computeMergedBranches([], [], allBranches);
    expect(merged.size).toBe(0);
  });
});
