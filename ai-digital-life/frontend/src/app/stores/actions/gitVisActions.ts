import type { DigitalLifeBridge } from '@shared/ipc/digital-life';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { CHART_IDS } from '../../features/git-visualization/GitVisualizationView';
import { computeLoadPhases } from './workspaceLoadOrder';

const HEATMAP_TABS = [
  CHART_IDS.HEATMAP,
  CHART_IDS.BRANCH_GRAPH,
  CHART_IDS.FILE_SUNBURST,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
] as const;

function getChartEndpoints(chartId: string): string[] {
  return chartId === CHART_IDS.HEATMAP ? [CHART_IDS.HEATMAP] : [chartId];
}

function debugLog(msg: string, ...args: unknown[]): void {
  if (typeof console !== 'undefined' && (console as { debug?: typeof console.log }).debug) {
    console.debug(`[ADL-GIT-VIS] ${msg}`, ...args);
  }
}

export async function fetchChartData(
  bridge: DigitalLifeBridge,
  workspaceId: string,
  rootPath: string,
  chartId: string,
  since?: string,
  until?: string,
): Promise<unknown> {
  debugLog('fetchChartData', { workspaceId, chartId, since, until });
  const t0 = performance.now();

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

  const elapsed = performance.now() - t0;
  if (result.ok) {
    debugLog('fetchChartData OK', { workspaceId, chartId, elapsed: `${elapsed.toFixed(0)}ms` });
    return result.data;
  } else {
    debugLog('fetchChartData ERROR', { workspaceId, chartId, error: result.error.message });
    throw new Error(result.error.message);
  }
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
  debugLog('refreshWorkspace', { workspaceId });
  for (const chartId of HEATMAP_TABS) {
    setLoading(chartId, true);
    setError(chartId, undefined);
    try {
      const tr = timeRanges[chartId] || {};
      const data = await fetchChartData(bridge, workspaceId, rootPath, chartId, tr.since, tr.until);
      setData(chartId, data);
    } catch (e) {
      setError(chartId, e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(chartId, false);
    }
  }
}

export function determinePhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  workspacePaths: Array<{ id: string; rootPath: string }>,
): {
  high: Array<{ id: string; rootPath: string }>;
  medium: Array<{ id: string; rootPath: string }>;
  low: Array<{ id: string; rootPath: string }>;
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

  debugLog('determinePhases', {
    high: phases.priority.map(w => w.id),
    medium: phases.deferred.map(w => w.id),
    low: phases.natural.map(w => w.id),
  });

  const lookup = new Map(workspacePaths.map(w => [w.id, w]));
  const resolve = (entries: RecentWorkspaceEntry[]) =>
    entries.map(e => lookup.get(e.id)!).filter(Boolean);

  return {
    high: resolve(phases.priority),
    medium: resolve(phases.deferred),
    low: resolve(phases.natural),
  };
}
