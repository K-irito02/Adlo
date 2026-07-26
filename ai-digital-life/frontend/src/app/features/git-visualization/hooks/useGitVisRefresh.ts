import { useCallback, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { fetchChartData, refreshWorkspace } from '@stores/actions/gitVisActions';
import { getBridge } from '@stores/slices/githubSliceHelpers';

export function useGitVisRefresh(workspaceId: string, rootPath: string) {
  const setLoading = useAppStore((s) => s.setGitVisLoading);
  const setError = useAppStore((s) => s.setGitVisError);
  const setData = useAppStore((s) => s.setGitVisData);

  const handleRefreshWorkspace = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      return;
    }
    const latestTimeRanges = useAppStore.getState().gitVisTimeRange[workspaceId] || {};
    await refreshWorkspace(
      bridge,
      workspaceId,
      rootPath,
      latestTimeRanges,
      (chartId, loading) => setLoading(workspaceId, chartId, loading),
      (chartId, error) => setError(workspaceId, chartId, error),
      (chartId, data) => setData(workspaceId, chartId, data),
    );
  }, [workspaceId, rootPath, setLoading, setError, setData]);

  const pendingRef = useRef<Set<string>>(new Set());
  const handleRefreshChart = useCallback(
    async (chartId: string) => {
      if (pendingRef.current.has(chartId)) {
        return;
      }
      pendingRef.current.add(chartId);
      const bridge = getBridge();
      if (!bridge) {
        pendingRef.current.delete(chartId);
        return;
      }
      // Defer store mutations past the current render cycle
      await Promise.resolve();
      setError(workspaceId, chartId, undefined);
      try {
        const latestTimeRanges = useAppStore.getState().gitVisTimeRange[workspaceId] || {};
        const tr = latestTimeRanges[chartId];
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
        pendingRef.current.delete(chartId);
      }
    },
    [workspaceId, rootPath, setError, setData],
  );

  return { refreshWorkspace: handleRefreshWorkspace, refreshChart: handleRefreshChart } as const;
}
