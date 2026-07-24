import { describe, it, expect } from 'vitest';
import {
  commitNodes,
  commitEdges,
  allBranches,
  toBklitAreaData,
  generateCodeLineEvolutionData,
  toHeatmapColumns,
  generateClockHeatmapData,
  generateContributorActivityData,
  generateContributorModuleData,
} from '../../../../test-fixtures/gitVisMockData';

describe('bklit data adapters', () => {
  it('toBklitAreaData converts evolution data', () => {
    const result = toBklitAreaData(generateCodeLineEvolutionData());
    expect(result.length).toBe(40);
    expect(result[0]).toHaveProperty('date');
    expect(result[0]).toHaveProperty('added');
    expect(result[0]).toHaveProperty('deleted');
  });

  it('toHeatmapColumns converts calendar data to columns', () => {
    const result = toHeatmapColumns();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('bin');
    expect(result[0]).toHaveProperty('bins');
  });

  it('generateClockHeatmapData produces 24 columns × 7 rows with labels', () => {
    const result = generateClockHeatmapData();
    expect(result.length).toBe(24);
    expect(result[0].bins.length).toBe(7);
    expect(result[0]).toHaveProperty('columnLabel');
  });

  it('generateContributorActivityData has correct dimensions', () => {
    const result = generateContributorActivityData();
    expect(result.length).toBe(48);
    expect(result[0].bins.length).toBe(6);
  });

  it('generateContributorModuleData has correct dimensions', () => {
    const result = generateContributorModuleData();
    expect(result.length).toBe(5);
    expect(result[0].bins.length).toBe(6);
    expect(result[0]).toHaveProperty('columnLabel');
  });
});

describe('branch graph mock data', () => {
  it('has 31 commit nodes', () => {
    expect(commitNodes.length).toBe(31);
  });

  it('every node has required fields', () => {
    for (const node of commitNodes) {
      expect(node.id).toBeTruthy();
      expect(node.hash).toMatch(/^[a-z0-9]{6,7}$/);
      expect(node.branch).toBeTruthy();
      expect(node.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(node.message).toBeTruthy();
      expect(node.author).toBeTruthy();
    }
  });

  it('has edges forming a valid DAG', () => {
    expect(commitEdges.length).toBeGreaterThan(0);
    const allIds = new Set(commitNodes.map((n) => n.id));
    for (const edge of commitEdges) {
      expect(allIds.has(edge.source)).toBe(true);
      expect(allIds.has(edge.target)).toBe(true);
    }
  });

  it('has exactly 7 branches', () => {
    expect(allBranches.length).toBe(7);
    expect(allBranches).toContain('main');
  });

  it('includes at least one merge commit (2+ parents)', () => {
    const parentCount = new Map<string, number>();
    for (const edge of commitEdges) {
      parentCount.set(edge.source, (parentCount.get(edge.source) || 0) + 1);
    }
    const merges = [...parentCount.entries()].filter(([, c]) => c >= 2);
    expect(merges.length).toBeGreaterThanOrEqual(1);
  });

  it('includes an octopus merge (3+ parents)', () => {
    const parentCount = new Map<string, number>();
    for (const edge of commitEdges) {
      parentCount.set(edge.source, (parentCount.get(edge.source) || 0) + 1);
    }
    const octopus = [...parentCount.entries()].filter(([, c]) => c >= 3);
    expect(octopus.length).toBe(1);
  });

  it('includes an unmerged branch tip', () => {
    const allParents = new Set(commitEdges.map((e) => e.target));
    const unmerged = commitNodes.filter((n) => !allParents.has(n.id) && n.branch !== 'main');
    expect(unmerged.length).toBeGreaterThanOrEqual(1);
  });

  it('covers all 7 branch names', () => {
    const branchSet = new Set(commitNodes.map((n) => n.branch));
    for (const b of allBranches) {
      expect(branchSet.has(b)).toBe(true);
    }
  });
});
