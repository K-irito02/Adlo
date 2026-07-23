import { useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { CHART_IDS } from '../chartIds';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';

const TIME_RANGE_CHARTS = new Set<string>([
  CHART_IDS.HEATMAP,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
]);

export function useChartData(chartId: string): {
  data: unknown;
  loading: boolean;
  error: string | undefined;
  timeRange: TimeRangeState | undefined;
  setTimeRange: (range: TimeRangeState) => void;
  hasTimeRange: boolean;
} {
  const { activeWorkspaceTab, gitVisData, gitVisLoading, gitVisErrors, gitVisTimeRange } =
    useAppStore(
      useShallow((s) => ({
        activeWorkspaceTab: s.activeWorkspaceTab,
        gitVisData: s.gitVisData,
        gitVisLoading: s.gitVisLoading,
        gitVisErrors: s.gitVisErrors,
        gitVisTimeRange: s.gitVisTimeRange,
      })),
    );

  const setGitVisTimeRange = useAppStore((s) => s.setGitVisTimeRange);

  return useMemo(() => {
    const wsData = gitVisData[activeWorkspaceTab] || {};
    const wsLoading = gitVisLoading[activeWorkspaceTab] || {};
    const wsErrors = gitVisErrors[activeWorkspaceTab] || {};
    const wsTimeRange = gitVisTimeRange[activeWorkspaceTab] || {};

    return {
      data: wsData[chartId],
      loading: wsLoading[chartId] ?? false,
      error: wsErrors[chartId],
      timeRange: wsTimeRange[chartId],
      setTimeRange: (range: TimeRangeState) =>
        setGitVisTimeRange(activeWorkspaceTab, chartId, range),
      hasTimeRange: TIME_RANGE_CHARTS.has(chartId),
    };
  }, [
    activeWorkspaceTab,
    chartId,
    gitVisData,
    gitVisLoading,
    gitVisErrors,
    gitVisTimeRange,
    setGitVisTimeRange,
  ]);
}
