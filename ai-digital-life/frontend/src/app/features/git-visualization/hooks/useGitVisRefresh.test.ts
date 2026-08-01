import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGitVisRefresh } from './useGitVisRefresh';
import { useAppStore } from '@stores/slicedStore';

const CHART_ID = 'code-line-evolution';

interface Bridge {
  workspace: { gitVisCodeEvolution: ReturnType<typeof vi.fn> };
}

function setupBridge() {
  const bridge: Bridge = {
    workspace: { gitVisCodeEvolution: vi.fn() },
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
