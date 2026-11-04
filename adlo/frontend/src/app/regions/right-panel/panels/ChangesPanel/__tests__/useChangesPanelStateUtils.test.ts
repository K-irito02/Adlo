import { describe, expect, it, vi } from 'vitest';
import type { RecentWorkspaceEntry } from '@adlo/kernel';
import { refreshAllChanges } from '../useChangesPanelStateUtils';

function ws(id: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

describe('refreshAllChanges', () => {
  it('只刷新已展开的工作区且使用 silent', async () => {
    const refresh = vi.fn(async () => {});
    const setRefreshingAll = vi.fn();
    const workspaces = [ws('ws-1', '/a'), ws('ws-2', '/b'), ws('ws-3', '/c')];
    await refreshAllChanges(workspaces, new Set(['ws-1', 'ws-3']), setRefreshingAll, refresh);
    expect(refresh).toHaveBeenCalledWith('ws-1', '/a', { silent: true });
    expect(refresh).toHaveBeenCalledWith('ws-3', '/c', { silent: true });
    expect(refresh).not.toHaveBeenCalledWith('ws-2', '/b', { silent: true });
    expect(setRefreshingAll).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshingAll).toHaveBeenLastCalledWith(false);
  });

  it('无可刷新工作区时不调用 setRefreshingAll', async () => {
    const refresh = vi.fn();
    const setRefreshingAll = vi.fn();
    await refreshAllChanges([ws('ws-1', '/a')], new Set(), setRefreshingAll, refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshingAll).not.toHaveBeenCalled();
  });
});
