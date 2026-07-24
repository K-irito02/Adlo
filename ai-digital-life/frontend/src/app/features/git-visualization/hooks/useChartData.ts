import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { CHART_IDS } from '../chartIds';
import type { TimeRangeState } from '@stores/slices/gitVisSlice';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';

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
  const activeWorkspaceTab = useAppStore((s) => s.activeWorkspaceTab);
  const wsData = useAppStore((s) => s.gitVisData[activeWorkspaceTab]);
  const wsLoading = useAppStore((s) => s.gitVisLoading[activeWorkspaceTab]);
  const wsErrors = useAppStore((s) => s.gitVisErrors[activeWorkspaceTab]);
  const wsTimeRange = useAppStore((s) => s.gitVisTimeRange[activeWorkspaceTab]);
  const setGitVisTimeRange = useAppStore((s) => s.setGitVisTimeRange);

  const chartData = wsData?.[chartId];
  const chartLoading = wsLoading?.[chartId] ?? false;
  const chartError = wsErrors?.[chartId];
  const chartTimeRange = wsTimeRange?.[chartId];

  const timeRange = chartTimeRange;

  useEffect(() => {
    if (TIME_RANGE_CHARTS.has(chartId) && !chartTimeRange && activeWorkspaceTab) {
      setGitVisTimeRange(activeWorkspaceTab, chartId, defaultTimeRange());
    }
  }, [chartId, chartTimeRange, activeWorkspaceTab, setGitVisTimeRange]);
  const setTimeRange = useCallback(
    (range: TimeRangeState) => setGitVisTimeRange(activeWorkspaceTab, chartId, range),
    [activeWorkspaceTab, chartId, setGitVisTimeRange],
  );

  return useMemo(
    () => ({
      data: chartData,
      loading: chartLoading,
      error: chartError,
      timeRange,
      setTimeRange,
      hasTimeRange: TIME_RANGE_CHARTS.has(chartId),
    }),
    [chartData, chartLoading, chartError, timeRange, setTimeRange, chartId],
  );
}
