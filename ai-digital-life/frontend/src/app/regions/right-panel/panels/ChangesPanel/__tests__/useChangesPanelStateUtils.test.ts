import { describe, expect, it, vi } from 'vitest';
import { refreshAllChanges } from '../useChangesPanelStateUtils';

describe('refreshAllChanges', () => {
  it('只刷新已展开的工作区且使用 silent', async () => {
    const refresh = vi.fn(async () => {});
    const setRefreshingAll = vi.fn();
    const ws = [
      { id: 'ws-1', path: '/a' },
      { id: 'ws-2', path: '/b' },
      { id: 'ws-3', path: '/c' },
    ] as any[];
    await refreshAllChanges(ws, new Set(['ws-1', 'ws-3']), setRefreshingAll, refresh);
    expect(refresh).toHaveBeenCalledWith('ws-1', '/a', { silent: true });
    expect(refresh).toHaveBeenCalledWith('ws-3', '/c', { silent: true });
    expect(refresh).not.toHaveBeenCalledWith('ws-2', '/b', { silent: true });
    expect(setRefreshingAll).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshingAll).toHaveBeenLastCalledWith(false);
  });

  it('无可刷新工作区时不调用 setRefreshingAll', async () => {
    const refresh = vi.fn();
    const setRefreshingAll = vi.fn();
    await refreshAllChanges(
      [{ id: 'ws-1', path: '/a' }] as any[],
      new Set(),
      setRefreshingAll,
      refresh,
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshingAll).not.toHaveBeenCalled();
  });
});
