import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { fetchChartData, refreshWorkspace } from '@stores/actions/gitVisActions';
import { getBridge } from '@stores/slices/githubSliceHelpers';

export function useGitVisRefresh(workspaceId: string, rootPath: string) {
  const setLoading = useAppStore((s) => s.setGitVisLoading);
  const setError = useAppStore((s) => s.setGitVisError);
  const setData = useAppStore((s) => s.setGitVisData);
  const timeRanges = useAppStore(
    useShallow(
      (s) =>
        s.gitVisTimeRange[workspaceId] ||
        ({} as Record<string, { since?: string; until?: string }>),
    ),
  );

  const handleRefreshWorkspace = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      return;
    }
    await refreshWorkspace(
      bridge,
      workspaceId,
      rootPath,
      timeRanges,
      (chartId, loading) => setLoading(workspaceId, chartId, loading),
      (chartId, error) => setError(workspaceId, chartId, error),
      (chartId, data) => setData(workspaceId, chartId, data),
    );
  }, [workspaceId, rootPath, timeRanges, setLoading, setError, setData]);

  const handleRefreshChart = useCallback(
    async (chartId: string) => {
      const bridge = getBridge();
      if (!bridge) {
        return;
      }
      setLoading(workspaceId, chartId, true);
      setError(workspaceId, chartId, undefined);
      try {
        const tr = timeRanges[chartId];
        const data = await fetchChartData(
          bridge,
          workspaceId,
          rootPath,
          chartId,
          tr?.since,
          tr?.until,
        );
        setData(workspaceId, chartId, data);
      } catch (e) {
        setError(workspaceId, chartId, e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(workspaceId, chartId, false);
      }
    },
    [workspaceId, rootPath, timeRanges, setLoading, setError, setData],
  );

  return { refreshWorkspace: handleRefreshWorkspace, refreshChart: handleRefreshChart } as const;
}
