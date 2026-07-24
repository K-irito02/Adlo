import type { DigitalLifeBridge } from '@shared/ipc/digital-life';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { CHART_IDS } from '../../features/git-visualization/chartIds';
import { computeLoadPhases } from './workspaceLoadOrder';

export const HEATMAP_TABS = [
  CHART_IDS.HEATMAP,
  CHART_IDS.BRANCH_GRAPH,
  CHART_IDS.FILE_SUNBURST,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
] as const;
export async function fetchChartData(
  bridge: DigitalLifeBridge,
  workspaceId: string,
  rootPath: string,
  chartId: string,
  since?: string,
  until?: string,
): Promise<unknown> {
  let result;
  switch (chartId) {
    case CHART_IDS.HEATMAP:
      result = await bridge.workspace.gitVisCommitStats(rootPath, since, until);
      break;
    case CHART_IDS.BRANCH_GRAPH:
      result = await bridge.workspace.gitVisBranchGraph(rootPath);
      break;
    case CHART_IDS.FILE_SUNBURST:
      result = await bridge.workspace.gitVisFileSunburst(rootPath);
      break;
    case CHART_IDS.CODE_LINE_EVO:
      result = await bridge.workspace.gitVisCodeEvolution(rootPath, since, until);
      break;
    case CHART_IDS.COMMIT_TIMELINE:
      result = await bridge.workspace.gitVisCommitStats(rootPath, since, until);
      break;
    default:
      throw new Error(`Unknown chart ID: ${chartId}`);
  }

  if (result.ok) {
    return result.data;
  }
  throw new Error(result.error.message);
}

export async function refreshWorkspace(
  bridge: DigitalLifeBridge,
  workspaceId: string,
  rootPath: string,
  timeRanges: Record<string, { since?: string; until?: string }>,
  setLoading: (chartId: string, loading: boolean) => void,
  setError: (chartId: string, error: string | undefined) => void,
  setData: (chartId: string, data: unknown) => void,
): Promise<void> {
  // Clear errors before fetching
  for (const chartId of HEATMAP_TABS) {
    setError(chartId, undefined);
  }

  // Fetch all charts in parallel
  const results = await Promise.allSettled(
    HEATMAP_TABS.map(async (chartId) => {
      const tr = timeRanges[chartId] || {};
      try {
        const data = await fetchChartData(
          bridge,
          workspaceId,
          rootPath,
          chartId,
          tr.since,
          tr.until,
        );
        return { chartId, data };
      } catch (e) {
        throw { chartId, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      setData(result.value.chartId, result.value.data);
    } else {
      const rejected = result.reason as { chartId: string; error: string };
      setError(rejected.chartId, rejected.error);
    }
  }
}

export function determinePhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  workspacePaths: { id: string; rootPath: string }[],
): {
  high: { id: string; rootPath: string }[];
  medium: { id: string; rootPath: string }[];
  low: { id: string; rootPath: string }[];
} {
  const toEntry = (w: { id: string; rootPath: string }): RecentWorkspaceEntry => ({
    id: w.id,
    path: w.rootPath,
    rootPath: w.rootPath,
    name: '',
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  });

  const phases = computeLoadPhases(
    priorityIds,
    deferredIds,
    naturalOrder,
    workspacePaths.map(toEntry),
  );

  const lookup = new Map(workspacePaths.map((w) => [w.id, w]));
  const resolve = (entries: RecentWorkspaceEntry[]) =>
    entries.map((e) => lookup.get(e.id)!).filter(Boolean);

  return {
    high: resolve(phases.priority),
    medium: resolve(phases.deferred),
    low: resolve(phases.natural),
  };
}
