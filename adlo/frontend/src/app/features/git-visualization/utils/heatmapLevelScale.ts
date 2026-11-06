import { buildHeatmapLevelResolver, type HeatmapLevelResolver } from '@/components/charts/heatmap';
import type { HeatmapTab } from '@stores/slices/uiSliceTypes';
import type { RawCommitStats, RawContributorModules } from '../adapters/chartDataAdapters';
import type { ModuleTreeNode } from '../moduleTreeUtils';
import { childrenToHeatmapColumns, getChildrenAtPath } from '../moduleTreeUtils';

export interface HeatmapLevelInput {
  tab: HeatmapTab;
  commitStats?: RawCommitStats;
  contributorModules?: RawContributorModules['matrix'];
  moduleTree: ModuleTreeNode | null;
  moduleDrillPath: readonly string[];
  since?: string;
  until?: string;
}

/** Parses a `YYYY-MM` / `YYYY-M` value into a comparable month index. */
function monthIndex(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [year, month] = value.split('-');
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
    return null;
  }
  return parsedYear * 12 + (parsedMonth - 1);
}

/**
 * Counts the cells that are actually visible in the active heatmap tab.
 *
 * Calendar/activity counts are clipped to the same year / `since…until` window
 * the chart renders, so a stale dataset kept after a failed range refresh
 * cannot compute thresholds from cells the chart has already filtered out.
 */
export function collectHeatmapLevelCounts(input: HeatmapLevelInput): number[] {
  const { tab, commitStats, contributorModules, moduleTree, moduleDrillPath, since, until } = input;

  if (tab === 'calendar') {
    const year = since && since.length >= 4 ? Number.parseInt(since.substring(0, 4), 10) : NaN;
    return (commitStats?.dailyCommits ?? [])
      .filter((day) => !Number.isFinite(year) || Number(day.date.substring(0, 4)) === year)
      .map((day) => day.count);
  }

  if (tab === 'clock') {
    return (commitStats?.hourlyDistribution ?? []).map((slot) => slot.count);
  }

  if (tab === 'activity') {
    const sinceMonth = monthIndex(since);
    const untilMonth = monthIndex(until);
    return (commitStats?.contributorActivity ?? []).flatMap((contributor) =>
      contributor.periods
        .filter((period) => {
          const periodMonth = monthIndex(period.period);
          if (periodMonth == null) {
            return false;
          }
          return (
            (sinceMonth == null || periodMonth >= sinceMonth) &&
            (untilMonth == null || periodMonth <= untilMonth)
          );
        })
        .map((period) => period.count),
    );
  }

  if (!moduleTree || !contributorModules) {
    return [];
  }
  const children = getChildrenAtPath(moduleTree, [...moduleDrillPath]);
  if (children.length === 0) {
    return [];
  }
  return childrenToHeatmapColumns(children, contributorModules).columns.flatMap((column) =>
    column.bins.map((bin) => bin.count),
  );
}

export function resolveHeatmapLevelResolver(input: HeatmapLevelInput): HeatmapLevelResolver {
  return buildHeatmapLevelResolver(collectHeatmapLevelCounts(input));
}
