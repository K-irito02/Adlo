import { useCallback, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import {
  CHART_LOADING_MIN_VISIBLE_MS,
  fetchChartData,
  holdLoadingForMin,
  refreshWorkspace,
} from '@stores/actions/gitVisActions';
import { getBridge } from '@stores/slices/githubSliceHelpers';
import { resolveTimeRangeForFetch } from '../timeRangeUtils';

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
    // Re-resolve relative presets (week/month/year) against today so a refresh
    // never reuses a stale absolute `until` captured when the preset was chosen.
    const resolvedTimeRanges: Record<string, { since?: string; until?: string }> = {};
    for (const [chartId, range] of Object.entries(latestTimeRanges)) {
      resolvedTimeRanges[chartId] = resolveTimeRangeForFetch(range);
    }
    // Guard: a workspace refresh must not overwrite a newer per-chart refresh
    // that changed the time range while the workspace fetch was in flight.
    // Compare the snapshot range against the current one before committing.
    // The resolved bounds are compared too so a midnight rollover (which changes
    // the rolling preset's effective since/until without changing the stored
    // range) also invalidates an in-flight request.
    const isRangeStillCurrent = (chartId: string) => {
      const currentRanges = useAppStore.getState().gitVisTimeRange[workspaceId] || {};
      const snap = latestTimeRanges[chartId];
      const current = currentRanges[chartId];
      return snap === current || JSON.stringify(snap) === JSON.stringify(current);
    };
    const isResolvedBoundsCurrent = (chartId: string) => {
      if (!isRangeStillCurrent(chartId)) {
        return false;
      }
      const currentRanges = useAppStore.getState().gitVisTimeRange[workspaceId] || {};
      const snap = latestTimeRanges[chartId];
      const current = currentRanges[chartId];
      if (current && snap) {
        const snapResolved = resolvedTimeRanges[chartId];
        const currentResolved = resolveTimeRangeForFetch(current);
        return JSON.stringify(snapResolved) === JSON.stringify(currentResolved);
      }
      return true;
    };
    await refreshWorkspace(
      bridge,
      workspaceId,
      rootPath,
      resolvedTimeRanges,
      (chartId, loading) => {
        // Setting loading=true is always safe (workspace owns it). Clearing
        // must be gated on the stored range only: a midnight rollover changes
        // the resolved bounds but not the stored range, and no newer request is
        // coming to clear the spinner, so loading must still be cleared there.
        if (loading || isRangeStillCurrent(chartId)) {
          setLoading(workspaceId, chartId, loading);
        }
      },
      (chartId, error) => {
        if (isResolvedBoundsCurrent(chartId)) {
          setError(workspaceId, chartId, error);
        }
      },
      (chartId, data) => {
        if (isResolvedBoundsCurrent(chartId)) {
          setData(workspaceId, chartId, data);
        }
      },
    );
  }, [workspaceId, rootPath, setLoading, setError, setData]);

  // Per-chart request sequence: a refresh only commits its result if it is the
  // latest request for that chart. Rapid time-range changes therefore always
  // land on the newest selection instead of being swallowed by an in-flight
  // refresh of a superseded range. Keys are workspace-scoped so switching
  // workspaces never bumps another workspace's in-flight sequence.
  const latestRequestSeqRef = useRef<Record<string, number>>({});
  const seqKeyFor = useCallback((chartId: string) => `${workspaceId}:${chartId}`, [workspaceId]);
  const handleRefreshChart = useCallback(
    async (chartId: string) => {
      const bridge = getBridge();
      if (!bridge) {
        return;
      }
      const key = seqKeyFor(chartId);
      const seq = (latestRequestSeqRef.current[key] ?? 0) + 1;
      latestRequestSeqRef.current[key] = seq;
      // Defer store mutations past the current render cycle
      await Promise.resolve();
      setError(workspaceId, chartId, undefined);
      setLoading(workspaceId, chartId, true);
      const startedAt = performance.now();
      try {
        const latestTimeRanges = useAppStore.getState().gitVisTimeRange[workspaceId] || {};
        const tr = latestTimeRanges[chartId];
        const bounds = tr ? resolveTimeRangeForFetch(tr) : { since: undefined, until: undefined };
        const data = await fetchChartData(
          bridge,
          workspaceId,
          rootPath,
          chartId,
          bounds.since,
          bounds.until,
        );
        if (latestRequestSeqRef.current[key] !== seq) {
          return; // superseded by a newer refresh
        }
        setData(workspaceId, chartId, data);
      } catch (e) {
        if (latestRequestSeqRef.current[key] === seq) {
          setError(workspaceId, chartId, e instanceof Error ? e.message : String(e));
          throw e; // surface the failure so the caller can reset its UI state
        }
      } finally {
        if (latestRequestSeqRef.current[key] === seq) {
          // Hold the loading state visible long enough to paint even when the
          // fetch resolves instantly (React may otherwise batch loading on/off
          // into a single frame and the "loading" label never appears). Note the
          // hold also delays an error rejection by up to the same amount, since
          // callers see the rejection only after this finally block settles.
          await holdLoadingForMin(startedAt, CHART_LOADING_MIN_VISIBLE_MS);
          // Re-check the sequence after the wait: a newer request may have
          // started while this one was holding loading visible. Only the newest
          // request may clear the flag, otherwise the newer in-flight fetch
          // would lose its loading indicator in a rapid tab-switch burst.
          if (latestRequestSeqRef.current[key] === seq) {
            setLoading(workspaceId, chartId, false);
          }
        }
      }
    },
    [workspaceId, rootPath, seqKeyFor, setLoading, setError, setData],
  );

  return { refreshWorkspace: handleRefreshWorkspace, refreshChart: handleRefreshChart } as const;
}
