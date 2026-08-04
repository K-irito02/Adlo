import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGitVisRefresh } from './useGitVisRefresh';
import { CHART_LOADING_MIN_VISIBLE_MS } from '@stores/actions/gitVisActions';
import { useAppStore } from '@stores/slicedStore';
import { resolveRollingRange } from '../timeRangeUtils';

const CHART_ID = 'code-line-evolution';

interface Bridge {
  workspace: {
    gitVisCodeEvolution: ReturnType<typeof vi.fn>;
    gitVisCommitStats: ReturnType<typeof vi.fn>;
    gitVisBranchGraph: ReturnType<typeof vi.fn>;
    gitVisFileHotspots: ReturnType<typeof vi.fn>;
    gitVisContributorModules: ReturnType<typeof vi.fn>;
  };
}

function setupBridge() {
  const bridge: Bridge = {
    workspace: {
      gitVisCodeEvolution: vi.fn(),
      gitVisCommitStats: vi.fn(),
      gitVisBranchGraph: vi.fn(),
      gitVisFileHotspots: vi.fn(),
      gitVisContributorModules: vi.fn(),
    },
  };
  (window as unknown as { digitalLife: unknown }).digitalLife = bridge;
  return bridge;
}

function setRange(workspaceId: string) {
  act(() => {
    useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
      preset: 'custom',
      since: '2026-07-01',
      until: '2026-07-31',
    });
  });
}

function deferred() {
  let resolve!: (v: { ok: boolean; data: unknown }) => void;
  const promise = new Promise<{ ok: boolean; data: unknown }>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  setupBridge();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Reset the git-vis slices to a clean state between tests (leave the rest of
  // the store untouched).
  useAppStore.setState((s) => ({
    ...s,
    gitVisData: {},
    gitVisLoading: {},
    gitVisErrors: {},
    gitVisTimeRange: {},
  }));
});

describe('useGitVisRefresh latest-wins', () => {
  it('commits only the newest per-chart refresh when results resolve out of order', async () => {
    const workspaceId = 'ws-1';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const first = deferred();
    const second = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = result.current.refreshChart(CHART_ID);
      p2 = result.current.refreshChart(CHART_ID);
    });

    // Second (newest) resolves first.
    second.resolve({
      ok: true,
      data: { days: [{ date: '2026-07-02', additions: 9, deletions: 1 }] },
    });
    await act(async () => {
      await p2;
    });

    // First (superseded) resolves later with stale data — must be dropped.
    first.resolve({
      ok: true,
      data: { days: [{ date: '2026-07-01', additions: 1, deletions: 1 }] },
    });
    await act(async () => {
      await p1;
    });

    const state = useAppStore.getState();
    const stored = state.gitVisData[workspaceId]?.[CHART_ID] as {
      days: { date: string; additions: number }[];
    };
    expect(stored).toEqual({
      days: [{ date: '2026-07-02', additions: 9, deletions: 1 }],
    });
    // Loading must be false after the newest request settles.
    expect(state.gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
  });

  it('keeps loading true while a request is in flight and clears it on completion', async () => {
    const workspaceId = 'ws-1';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const d = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockReturnValueOnce(d.promise);

    let p: Promise<void> | undefined;
    act(() => {
      p = result.current.refreshChart(CHART_ID);
    });
    // The hook defers store mutations past the current render cycle
    // (await Promise.resolve()), so flush microtasks before asserting loading.
    await act(async () => {});
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    d.resolve({ ok: true, data: { days: [] } });
    await act(async () => {
      await p;
    });
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
  });

  it('keeps the loading state visible for the minimum duration even when the fetch resolves instantly', async () => {
    vi.useFakeTimers();
    const workspaceId = 'ws-min-duration';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockResolvedValueOnce({ ok: true, data: { days: [] } });

    let p: Promise<void> | undefined;
    act(() => {
      p = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    // The fetch resolved immediately, but loading must stay true until the
    // minimum visible duration elapses so the "loading" label actually paints
    // (otherwise React batches loading on/off into a single frame).
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS - 50);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
    await act(async () => {
      await p;
    });
  });

  it('does not clear loading for an older request while a newer request is in flight (hold re-check)', async () => {
    vi.useFakeTimers();
    const workspaceId = 'ws-toctou';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const a = deferred();
    const b = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);

    let pa: Promise<void> | undefined;
    let pb: Promise<void> | undefined;
    act(() => {
      pa = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});

    // Resolve A while it is still the latest request → its finally enters the
    // min-duration hold (200ms) with loading still true.
    a.resolve({ ok: true, data: { days: [{ date: '2026-07-02', additions: 9, deletions: 1 }] } });
    await act(async () => {});

    // A newer request B starts while A is holding loading visible.
    act(() => {
      pb = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    // A's hold expires: its seq is now stale (B superseded it), so it must NOT
    // clear the loading flag that B's in-flight fetch still owns.
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    // B completes and clears loading after its own min-duration.
    b.resolve({ ok: true, data: { days: [{ date: '2026-07-03', additions: 3, deletions: 1 }] } });
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
    await act(async () => {
      await pa;
      await pb;
    });
  });

  it('propagates fetch failures so the caller can reset UI state', async () => {
    const workspaceId = 'ws-1';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockResolvedValueOnce({
      ok: false,
      error: { message: 'boom' },
    } as never);

    await expect(result.current.refreshChart(CHART_ID)).rejects.toThrow('boom');
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
  });

  it('never leaves loading stuck when a bridge is missing before sequencing', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = null;
    const { result } = renderHook(() => useGitVisRefresh('ws-1', '/repo'));
    await expect(result.current.refreshChart(CHART_ID)).resolves.toBeUndefined();
    expect(useAppStore.getState().gitVisLoading['ws-1']?.[CHART_ID]).toBeFalsy();
  });
});

describe('useGitVisRefresh workspace vs per-chart loading ownership', () => {
  it('does not clear a per-chart request loading when a workspace refresh settles during its flight', async () => {
    vi.useFakeTimers();
    const workspaceId = 'ws-race';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    act(() => {
      useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
        preset: 'custom',
        since: '2026-07-01',
        until: '2026-07-31',
      });
    });

    const perChart = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    // First gitVisCodeEvolution call (per-chart refresh) stays in flight; the
    // workspace refresh's own call resolves.
    bridge.workspace.gitVisCodeEvolution.mockReturnValueOnce(perChart.promise);
    bridge.workspace.gitVisCodeEvolution.mockResolvedValue({ ok: true, data: { days: [] } });
    bridge.workspace.gitVisCommitStats.mockResolvedValue({
      ok: true,
      data: {
        dailyCommits: [],
        hourlyDistribution: [],
        contributorActivity: [],
        commitTimeline: [],
      },
    });
    bridge.workspace.gitVisBranchGraph.mockResolvedValue({
      ok: true,
      data: { nodes: [], edges: [], branches: [] },
    });
    bridge.workspace.gitVisFileHotspots.mockResolvedValue({
      ok: true,
      data: { tree: { children: [] }, files: [] },
    });
    bridge.workspace.gitVisContributorModules.mockResolvedValue({
      ok: true,
      data: { matrix: [], allPaths: [] },
    });

    // Per-chart refresh starts first and remains in flight.
    let perChartP: Promise<void> | undefined;
    act(() => {
      perChartP = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    // A workspace refresh starts while the per-chart request is in flight. Its
    // fetches settle and it enters the 200ms hold — when the hold expires it
    // must NOT clear the per-chart chart's loading flag (still owned by the
    // in-flight per-chart request).
    let workspaceP: Promise<void> | undefined;
    act(() => {
      workspaceP = result.current.refreshWorkspace();
    });
    await act(async () => {});
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(true);

    // The per-chart request completes and clears its own loading.
    perChart.resolve({
      ok: true,
      data: { days: [{ date: '2026-07-02', additions: 1, deletions: 0 }] },
    });
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
    await act(async () => {
      await perChartP;
      await workspaceP;
    });
    vi.useRealTimers();
  });

  it('does not reject a superseded request error that was superseded during its hold', async () => {
    vi.useFakeTimers();
    const workspaceId = 'ws-m2';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const a = deferred();
    const b = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);

    let pa: Promise<void> | undefined;
    act(() => {
      pa = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});

    // A fails while it is still the latest request → the error is recorded and
    // A enters the min-duration hold with loading still visible.
    a.resolve({ ok: false, error: { message: 'boom' } } as never);
    await act(async () => {});
    expect(useAppStore.getState().gitVisErrors[workspaceId]?.[CHART_ID]).toBe('boom');

    // B supersedes A while A is holding loading visible.
    let pb: Promise<void> | undefined;
    act(() => {
      pb = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});

    // After A's hold, A is superseded — its error must NOT reject the caller
    // (the success path already returns silently when superseded).
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    await expect(pa).resolves.toBeUndefined();

    b.resolve({ ok: true, data: { days: [] } });
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    await act(async () => {
      await pb;
    });
    vi.useRealTimers();
  });

  it('ignores an error from a request that was already superseded when it failed', async () => {
    vi.useFakeTimers();
    const workspaceId = 'ws-m2b';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);

    const a = deferred();
    const b = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);

    let pa: Promise<void> | undefined;
    let pb: Promise<void> | undefined;
    act(() => {
      pa = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});
    // B supersedes A before A's fetch settles.
    act(() => {
      pb = result.current.refreshChart(CHART_ID);
    });
    await act(async () => {});

    // A fails after being superseded: its error must NOT be recorded and its
    // promise must resolve (an irrelevant stale failure never reaches callers).
    a.resolve({ ok: false, error: { message: 'boom' } } as never);
    await act(async () => {});
    await expect(pa).resolves.toBeUndefined();
    expect(useAppStore.getState().gitVisErrors[workspaceId]?.[CHART_ID]).toBeUndefined();

    b.resolve({ ok: true, data: { days: [] } });
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    await act(async () => {
      await pb;
    });
    vi.useRealTimers();
  });
});

describe('useGitVisRefresh relative preset re-resolution', () => {
  it('re-resolves a week preset against today instead of reusing the stale stored until', async () => {
    const workspaceId = 'ws-1';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    setRange(workspaceId);
    act(() => {
      useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
        preset: 'week',
        since: '2026-07-01',
        until: '2026-07-08',
      });
    });

    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockResolvedValueOnce({
      ok: true,
      data: { days: [] },
    });
    await act(async () => {
      await result.current.refreshChart(CHART_ID);
    });

    const expected = resolveRollingRange('week');
    const [rootPath, since, until] = bridge.workspace.gitVisCodeEvolution.mock.calls[0];
    expect(rootPath).toBe('/repo');
    expect([since, until]).toEqual([expected.since, expected.until]);
    expect(until).not.toBe('2026-07-08');
  });

  it('re-resolves relative presets for every chart during a workspace refresh', async () => {
    const workspaceId = 'ws-1';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));
    act(() => {
      useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
        preset: 'month',
        since: '2026-06-01',
        until: '2026-06-30',
      });
    });

    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCommitStats.mockResolvedValue({
      ok: true,
      data: {
        dailyCommits: [],
        hourlyDistribution: [],
        contributorActivity: [],
        commitTimeline: [],
      },
    });
    bridge.workspace.gitVisBranchGraph.mockResolvedValue({
      ok: true,
      data: { nodes: [], edges: [], branches: [] },
    });
    bridge.workspace.gitVisFileHotspots.mockResolvedValue({
      ok: true,
      data: { tree: { children: [] }, files: [] },
    });
    bridge.workspace.gitVisCodeEvolution.mockResolvedValue({ ok: true, data: { days: [] } });
    bridge.workspace.gitVisContributorModules.mockResolvedValue({
      ok: true,
      data: { matrix: [], allPaths: [] },
    });

    await act(async () => {
      await result.current.refreshWorkspace();
    });

    const expected = resolveRollingRange('month');
    const codeCall = bridge.workspace.gitVisCodeEvolution.mock.calls[0];
    expect(codeCall).toBeTruthy();
    expect([codeCall[1], codeCall[2]]).toEqual([expected.since, expected.until]);
  });

  it('drops a workspace refresh whose resolved bounds went stale during the fetch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 23, 59, 0));
    const workspaceId = 'ws-2';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));

    // A relative preset whose resolved bounds depend on "now".
    act(() => {
      useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
        preset: 'week',
        since: '2026-07-01',
        until: '2026-07-08',
      });
    });

    const d = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockReturnValueOnce(d.promise);
    bridge.workspace.gitVisCommitStats.mockResolvedValueOnce({
      ok: true,
      data: {
        dailyCommits: [],
        hourlyDistribution: [],
        contributorActivity: [],
        commitTimeline: [],
      },
    });
    bridge.workspace.gitVisBranchGraph.mockResolvedValueOnce({
      ok: true,
      data: { nodes: [], edges: [], branches: [] },
    });
    bridge.workspace.gitVisFileHotspots.mockResolvedValueOnce({
      ok: true,
      data: { tree: { children: [] }, files: [] },
    });
    bridge.workspace.gitVisContributorModules.mockResolvedValueOnce({
      ok: true,
      data: { matrix: [], allPaths: [] },
    });

    let p: Promise<void> | undefined;
    act(() => {
      p = result.current.refreshWorkspace();
    });
    await act(async () => {});

    // Roll the clock past midnight while the fetch is in flight. The stored
    // range is unchanged, but the resolved bounds now differ — this is exactly
    // the "midnight rollover" case the resolved-bounds guard must catch.
    vi.setSystemTime(new Date(2026, 7, 4, 0, 1, 0));

    d.resolve({
      ok: true,
      data: { days: [{ date: '2026-07-01', additions: 5, deletions: 0 }] },
    });
    // Loading is held visible for at least CHART_LOADING_MIN_VISIBLE_MS even
    // after the fetch settles, so advance the fake timer to let it clear.
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    await act(async () => {
      await p;
    });
    vi.useRealTimers();

    // The in-flight result was fetched for a superseded window and must not
    // overwrite the (empty) data slot of the current selection.
    const stored = useAppStore.getState().gitVisData[workspaceId]?.[CHART_ID];
    expect(stored).toBeUndefined();
  });

  it('still clears loading when a midnight rollover only changed the resolved bounds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 23, 59, 0));
    const workspaceId = 'ws-3';
    const { result } = renderHook(() => useGitVisRefresh(workspaceId, '/repo'));

    act(() => {
      useAppStore.getState().setGitVisTimeRange(workspaceId, CHART_ID, {
        preset: 'week',
        since: '2026-07-01',
        until: '2026-07-08',
      });
    });

    const d = deferred();
    const bridge = (window as unknown as { digitalLife: Bridge }).digitalLife;
    bridge.workspace.gitVisCodeEvolution.mockReturnValueOnce(d.promise);
    bridge.workspace.gitVisCommitStats.mockResolvedValueOnce({
      ok: true,
      data: {
        dailyCommits: [],
        hourlyDistribution: [],
        contributorActivity: [],
        commitTimeline: [],
      },
    });
    bridge.workspace.gitVisBranchGraph.mockResolvedValueOnce({
      ok: true,
      data: { nodes: [], edges: [], branches: [] },
    });
    bridge.workspace.gitVisFileHotspots.mockResolvedValueOnce({
      ok: true,
      data: { tree: { children: [] }, files: [] },
    });
    bridge.workspace.gitVisContributorModules.mockResolvedValueOnce({
      ok: true,
      data: { matrix: [], allPaths: [] },
    });

    let p: Promise<void> | undefined;
    act(() => {
      p = result.current.refreshWorkspace();
    });
    await act(async () => {});

    vi.setSystemTime(new Date(2026, 7, 4, 0, 1, 0));

    d.resolve({
      ok: true,
      data: { days: [{ date: '2026-07-01', additions: 5, deletions: 0 }] },
    });
    // Loading is held visible for at least CHART_LOADING_MIN_VISIBLE_MS even
    // after the fetch settles, so advance the fake timer to let it clear.
    await vi.advanceTimersByTimeAsync(CHART_LOADING_MIN_VISIBLE_MS + 50);
    await act(async () => {
      await p;
    });
    vi.useRealTimers();

    // The stale data must be dropped, but loading must not stay stuck: no newer
    // request is coming, so the workspace refresh still owns clearing it.
    expect(useAppStore.getState().gitVisData[workspaceId]?.[CHART_ID]).toBeUndefined();
    expect(useAppStore.getState().gitVisLoading[workspaceId]?.[CHART_ID]).toBe(false);
  });
});
