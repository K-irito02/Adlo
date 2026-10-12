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
  const setGitVisStale = useAppStore((s) => s.setGitVisStale);

  // Per-chart request sequence: a refresh only commits its result if it is the
  // latest request for that chart. Rapid time-range changes therefore always
  // land on the newest selection instead of being swallowed by an in-flight
  // refresh of a superseded range. Keys are workspace-scoped so switching
  // workspaces never bumps another workspace's in-flight sequence.
  const latestRequestSeqRef = useRef<Record<string, number>>({});
  // Workspace-level sequence: a stale-triggered refresh can overlap a first
  // visit load (e.g. a commit lands while the initial fetch is still in
  // flight). The superseded round must not clear the newer round's loading
  // flags or overwrite its data, so every round's callbacks bail out once a
  // newer workspace refresh has started. Keyed per workspace so switching A→B
  // never supersedes A's still-valid in-flight round.
  const workspaceSeqRef = useRef<Record<string, number>>({});
  // Charts with a per-chart refresh currently in flight. A workspace refresh
  // must not clear the loading flag of such a chart, otherwise it would
  // prematurely end the per-chart request's visible loading state.
  const inflightChartKeysRef = useRef<Set<string>>(new Set());
  const seqKeyFor = useCallback((chartId: string) => `${workspaceId}:${chartId}`, [workspaceId]);

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
    const seq = (workspaceSeqRef.current[workspaceId] =
      (workspaceSeqRef.current[workspaceId] ?? 0) + 1);
    const isSuperseded = () => workspaceSeqRef.current[workspaceId] !== seq;
    // Settlement ledger for THIS round: tracks chart fetches that failed here,
    // independent of store gating (an error suppressed because the range changed
    // mid-flight still counts as an incomplete round for staleness purposes).
    const failedCharts = new Set<string>();
    // Snapshot the git head this round is fetching for. A commit that lands
    // while the round is in flight marks the workspace stale again — settling
    // must not clear that newer mark with pre-commit data.
    const snapshotAtStart = useAppStore.getState().gitSnapshots[workspaceId];
    const headAtStart = snapshotAtStart?.head;
    const branchAtStart = snapshotAtStart?.branch;
    await refreshWorkspace(
      bridge,
      workspaceId,
      rootPath,
      resolvedTimeRanges,
      (chartId, loading) => {
        if (isSuperseded()) {
          return;
        }
        // Setting loading=true is always safe (workspace owns it). Clearing
        // must be gated on the stored range only: a midnight rollover changes
        // the resolved bounds but not the stored range, and no newer request is
        // coming to clear the spinner, so loading must still be cleared there.
        // A per-chart refresh that started while this workspace fetch was
        // settling still owns its chart's loading flag — skip clearing it.
        const clearable =
          loading ||
          (isRangeStillCurrent(chartId) && !inflightChartKeysRef.current.has(seqKeyFor(chartId)));
        if (clearable) {
          setLoading(workspaceId, chartId, loading);
        }
      },
      (chartId, error) => {
        if (error) {
          failedCharts.add(chartId);
        }
        if (!isSuperseded() && isResolvedBoundsCurrent(chartId)) {
          setError(workspaceId, chartId, error);
        }
      },
      (chartId, data) => {
        if (!isSuperseded() && isResolvedBoundsCurrent(chartId)) {
          setData(workspaceId, chartId, data);
        }
      },
    );
    // A full workspace refresh settles every chart, so this is the point where
    // the workspace's staleness mark (set by a commit/branch change) is
    // resolved. Clear it only when no chart of THIS round failed AND the git
    // head did not move underneath the round (a commit mid-flight already
    // re-marked stale with pre-commit data in hand). Per-chart refreshes
    // deliberately never clear it, and a superseded round never decides for
    // the newer one.
    const snapshotAtEnd = useAppStore.getState().gitSnapshots[workspaceId];
    const gitUnchangedDuringRound =
      snapshotAtEnd?.head === headAtStart && snapshotAtEnd?.branch === branchAtStart;
    if (!isSuperseded() && failedCharts.size === 0 && gitUnchangedDuringRound) {
      setGitVisStale(workspaceId, false);
    }
  }, [workspaceId, rootPath, setLoading, setError, setData, setGitVisStale, seqKeyFor]);

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
      inflightChartKeysRef.current.add(key);
      const startedAt = performance.now();
      let pendingError: unknown;
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
        // Clear any error a concurrent workspace refresh may have written for
        // this chart while this request was in flight — the fresh data now wins.
        setError(workspaceId, chartId, undefined);
      } catch (e) {
        if (latestRequestSeqRef.current[key] === seq) {
          setError(workspaceId, chartId, e instanceof Error ? e.message : String(e));
          pendingError = e;
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
            inflightChartKeysRef.current.delete(key);
          }
        }
      }
      // Surface the failure only if this request is still the latest — a
      // superseded request's error is irrelevant to the current selection and
      // would otherwise reject a caller that already moved on to a newer fetch.
      if (pendingError !== undefined && latestRequestSeqRef.current[key] === seq) {
        throw pendingError;
      }
    },
    [workspaceId, rootPath, seqKeyFor, setLoading, setError, setData],
  );

  return { refreshWorkspace: handleRefreshWorkspace, refreshChart: handleRefreshChart } as const;
}
