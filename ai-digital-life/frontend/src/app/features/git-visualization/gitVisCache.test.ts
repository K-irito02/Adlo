import { describe, it, expect } from 'vitest';
import { hasGitVisWorkspaceData, hasGitVisChart, isGitVisWorkspaceLoading } from './gitVisCache';
import { GIT_VIS_CHART_IDS, CHART_IDS } from './chartIds';

const allCharts = () =>
  Object.fromEntries(GIT_VIS_CHART_IDS.map((id) => [id, {}])) as Record<string, unknown>;

describe('hasGitVisWorkspaceData', () => {
  it('is false when the workspace slot is missing', () => {
    expect(hasGitVisWorkspaceData({}, 'ws-1')).toBe(false);
    expect(hasGitVisWorkspaceData(undefined, 'ws-1')).toBe(false);
  });

  it('is false when any chart is missing (partial cache must not skip)', () => {
    const partial = allCharts();
    delete partial[CHART_IDS.HEATMAP];
    expect(hasGitVisWorkspaceData({ 'ws-1': partial }, 'ws-1')).toBe(false);
  });

  it('is true only when every chart is present', () => {
    expect(hasGitVisWorkspaceData({ 'ws-1': allCharts() }, 'ws-1')).toBe(true);
  });
});

describe('hasGitVisChart', () => {
  it('distinguishes a missing chart from a present (even falsy) one', () => {
    const data = { 'ws-1': { [CHART_IDS.HEATMAP]: null } };
    expect(hasGitVisChart(data, 'ws-1', CHART_IDS.HEATMAP)).toBe(true);
    expect(hasGitVisChart(data, 'ws-1', CHART_IDS.BRANCH_GRAPH)).toBe(false);
    expect(hasGitVisChart(data, 'ws-2', CHART_IDS.HEATMAP)).toBe(false);
  });
});

describe('isGitVisWorkspaceLoading', () => {
  it('is true when any chart of the workspace is loading', () => {
    expect(
      isGitVisWorkspaceLoading({ 'ws-1': { heatmap: false, 'branch-graph': true } }, 'ws-1'),
    ).toBe(true);
  });

  it('is false when nothing is loading or the slot is absent', () => {
    expect(isGitVisWorkspaceLoading({ 'ws-1': { heatmap: false } }, 'ws-1')).toBe(false);
    expect(isGitVisWorkspaceLoading({}, 'ws-1')).toBe(false);
    expect(isGitVisWorkspaceLoading(undefined, 'ws-1')).toBe(false);
  });
});
