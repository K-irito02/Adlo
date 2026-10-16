import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createBrowserCleanupActions } from '../browserCleanupActions';
import {
  setPendingEditorText,
  scopedFileKey,
  peekPendingEditorTextByKey,
} from '../../cacheHelpers';

function makeStore(flush: { saved: number; failed: number } = { saved: 0, failed: 0 }) {
  const saveDirtyEditors = vi.fn(async () => flush);
  const showToast = vi.fn(() => 'toast-id');
  const cleanupRemovedWorkspaceTree = vi.fn();
  const store = createStore<Record<string, unknown>>((set, get) => {
    const actions = createBrowserCleanupActions(set as never, () => get() as never);
    return {
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo1' } },
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo1' },
        { id: 'ws-2', path: '/repo2' },
      ],
      errorToasts: [],
      reportError: vi.fn(() => 'toast-id'),
      showToast,
      saveDirtyEditors,
      clearErrorToasts: vi.fn(),
      ...actions,
      // 真实实现依赖大量切片状态，此处只测 flush→drop→移除链，用 mock 覆盖重型清理。
      ...({ cleanupRemovedWorkspaceTree } as Record<string, unknown>),
    } as unknown as Record<string, unknown>;
  });
  return { store, saveDirtyEditors, showToast, cleanupRemovedWorkspaceTree };
}

describe('removeWorkspaceFromSidebar 先 flush 后丢弃 (P4 L3)', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: { removeFromSidebar: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bridge() {
    return (
      window as unknown as {
        digitalLife: { workspace: { removeFromSidebar: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.workspace;
  }

  it('移除非当前工作区：先 flush，丢弃其暂存', async () => {
    bridge().removeFromSidebar.mockResolvedValue({
      ok: true,
      data: [{ id: 'ws-1', path: '/repo1' }],
    });
    const { store, saveDirtyEditors } = makeStore();
    setPendingEditorText(scopedFileKey('ws-2', 'old.txt'), 'draft\n');
    await (
      store.getState() as unknown as { removeWorkspaceFromSidebar: (id: string) => Promise<void> }
    ).removeWorkspaceFromSidebar('ws-2');
    expect(saveDirtyEditors).toHaveBeenCalledTimes(1);
    expect(peekPendingEditorTextByKey(scopedFileKey('ws-2', 'old.txt'))).toBeUndefined();
    expect(bridge().removeFromSidebar).toHaveBeenCalledWith('ws-2');
  });

  it('flush 失败：toast 说明后仍丢弃（工作区已不在）', async () => {
    bridge().removeFromSidebar.mockResolvedValue({
      ok: true,
      data: [{ id: 'ws-1', path: '/repo1' }],
    });
    const { store, showToast } = makeStore({ saved: 0, failed: 1 });
    setPendingEditorText(scopedFileKey('ws-2', 'old.txt'), 'draft\n');
    await (
      store.getState() as unknown as { removeWorkspaceFromSidebar: (id: string) => Promise<void> }
    ).removeWorkspaceFromSidebar('ws-2');
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'warning');
    expect(peekPendingEditorTextByKey(scopedFileKey('ws-2', 'old.txt'))).toBeUndefined();
  });
});
