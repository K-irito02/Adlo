import { GIT_VIS_CHART_IDS } from './chartIds';

/**
 * Shared cache-presence predicates for the session-scoped git-visualization
 * store. Both `GitVisualizationView` (workspace-level auto-refresh guard) and
 * `HeatmapCardGroup` (per-tab refresh guard) consume these so the "is it
 * cached?" decision is defined once — previously each component reimplemented
 * it (one as "object non-empty", the other as "!== undefined"), which disagreed
 * on partial data.
 *
 * Note the completeness semantics intentionally differ: a workspace refresh
 * needs EVERY chart (`hasGitVisWorkspaceData`), whereas a heatmap tab only
 * needs its own chart (`hasGitVisChart`).
 */

export function hasGitVisWorkspaceData(
  gitVisData: Record<string, Record<string, unknown>> | undefined,
  workspaceId: string,
): boolean {
  const wsData = gitVisData?.[workspaceId];
  if (!wsData) {
    return false;
  }
  return GIT_VIS_CHART_IDS.every((chartId) => wsData[chartId] !== undefined);
}

export function hasGitVisChart(
  gitVisData: Record<string, Record<string, unknown>> | undefined,
  workspaceId: string,
  chartId: string,
): boolean {
  return gitVisData?.[workspaceId]?.[chartId] !== undefined;
}

export function isGitVisWorkspaceLoading(
  gitVisLoading: Record<string, Record<string, boolean>> | undefined,
  workspaceId: string,
): boolean {
  const loading = gitVisLoading?.[workspaceId];
  return !!loading && Object.values(loading).some(Boolean);
}
