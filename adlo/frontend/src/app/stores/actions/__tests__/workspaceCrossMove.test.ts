import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import { createWorkspaceActions } from '../workspaceActions';

interface CrossBridge {
  moveFileAcross: ReturnType<typeof vi.fn>;
  copyFileAcross: ReturnType<typeof vi.fn>;
  reorderSidebar: ReturnType<typeof vi.fn>;
}

let bridge: CrossBridge;

function makeStore() {
  let actions: ReturnType<typeof createWorkspaceActions> | undefined;
  const saveDirtyEditors = vi.fn(async () => ({ saved: 1, failed: 0 }));
  const refreshOneWorkspaceTree = vi.fn(async () => {});
  const refreshWorkspaceTree = vi.fn(async () => {});
  const store = createStore<Record<string, unknown>>((set, get) => {
    actions = createWorkspaceActions(set as never, () => get() as never);
    return {
      appInfo: {},
      recentWorkspaces: [
        { id: 'ws-a', path: '/a' },
        { id: 'ws-b', path: '/b' },
      ],
      errorToasts: [],
      clearErrorToasts: vi.fn(),
      reportError: vi.fn(() => 'toast'),
      ...actions,
      saveDirtyEditors,
      refreshOneWorkspaceTree,
      refreshWorkspaceTree,
    };
  });
  if (!actions) {
    throw new Error('workspace actions were not created');
  }
  return { store, actions, saveDirtyEditors, refreshOneWorkspaceTree, refreshWorkspaceTree };
}

const input = {
  sourceWorkspacePath: '/a',
  sourceRelativePath: 'notes/a.txt',
  targetWorkspacePath: '/b',
  targetRelativePath: 'docs/a.txt',
};

describe('跨工作区移动 / 复制 / 侧栏排序', () => {
  beforeEach(() => {
    bridge = {
      moveFileAcross: vi.fn(async () => ({ ok: true, data: true })),
      copyFileAcross: vi.fn(async () => ({ ok: true, data: true })),
      reorderSidebar: vi.fn(async () => ({ ok: true, data: [{ id: 'ws-b' }, { id: 'ws-a' }] })),
    };
    vi.stubGlobal('digitalLife', { workspace: bridge });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('跨区移动前 flush 草稿，成功后刷新源/目标两棵树', async () => {
    const { actions, saveDirtyEditors, refreshOneWorkspaceTree } = makeStore();

    const ok = await actions.moveWorkspaceFileAcross(input);

    expect(ok).toBe(true);
    expect(saveDirtyEditors).toHaveBeenCalledTimes(1);
    expect(refreshOneWorkspaceTree).toHaveBeenCalledWith('ws-a', '/a', { silent: true });
    expect(refreshOneWorkspaceTree).toHaveBeenCalledWith('ws-b', '/b', { silent: true });
  });

  it('跨区移动失败返回 false，不刷新树', async () => {
    bridge.moveFileAcross.mockResolvedValueOnce({
      ok: false,
      error: { code: 'IO', message: 'target already exists' },
    });
    const { actions, refreshOneWorkspaceTree } = makeStore();

    const ok = await actions.moveWorkspaceFileAcross(input);

    expect(ok).toBe(false);
    expect(refreshOneWorkspaceTree).not.toHaveBeenCalled();
  });

  it('跨区复制成功后只刷新目标工作区', async () => {
    const { actions, refreshOneWorkspaceTree, refreshWorkspaceTree } = makeStore();

    const ok = await actions.copyWorkspaceFileAcross(input);

    expect(ok).toBe(true);
    expect(refreshOneWorkspaceTree).toHaveBeenCalledWith('ws-b', '/b', { silent: true });
    expect(refreshOneWorkspaceTree).not.toHaveBeenCalledWith('ws-a', '/a', { silent: true });
    expect(refreshWorkspaceTree).not.toHaveBeenCalled();
  });

  it('侧栏排序写入接口返回的最新列表', async () => {
    const { store, actions } = makeStore();

    await actions.reorderSidebarWorkspaces(['ws-b', 'ws-a']);

    expect(bridge.reorderSidebar).toHaveBeenCalledWith(['ws-b', 'ws-a']);
    expect(store.getState().recentWorkspaces).toEqual([{ id: 'ws-b' }, { id: 'ws-a' }]);
  });
});
