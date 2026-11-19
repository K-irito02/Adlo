import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createWorkspaceActions } from '../workspaceActions';

function makeStore(flush: { saved: number; failed: number }) {
  const saveDirtyEditors = vi.fn(async () => flush);
  const refreshWorkspaceTree = vi.fn(async () => {});
  const refreshOneWorkspaceTree = vi.fn(async () => {});
  const store = createStore<Record<string, unknown>>((set, get) => ({
    appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' } },
    recentWorkspaces: [{ id: 'ws-1', path: '/repo' }],
    selectedFilePath: undefined,
    selectedFileWorkspaceId: undefined,
    workspaceTrees: {},
    expandedFileTreePaths: {},
    expandedChangesTreePaths: {},
    fileChildOrder: {},
    filePreviewModeByPath: {},
    errorToasts: [],
    clearErrorToasts: vi.fn(),
    reportError: vi.fn(() => 'toast-id'),
    ...createWorkspaceActions(set as never, () => get() as never),
    saveDirtyEditors,
    refreshWorkspaceTree,
    refreshOneWorkspaceTree,
  }));
  return { store, saveDirtyEditors };
}

function bridge() {
  return (
    window as unknown as {
      digitalLife: {
        workspace: {
          renameFile: ReturnType<typeof vi.fn>;
          moveFile: ReturnType<typeof vi.fn>;
        };
      };
    }
  ).digitalLife.workspace;
}

describe('rename/move flush 草稿后再改路径', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        renameFile: vi.fn(async () => ({ ok: true, data: true })),
        moveFile: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rename 前先 flush 脏草稿', async () => {
    const { store, saveDirtyEditors } = makeStore({ saved: 1, failed: 0 });
    await (
      store.getState() as unknown as {
        renameWorkspaceFile: (p: string, n: string, wsPath?: string) => Promise<void>;
      }
    ).renameWorkspaceFile('note.txt', 'renamed.txt', '/repo');
    expect(saveDirtyEditors).toHaveBeenCalledTimes(1);
    expect(bridge().renameFile).toHaveBeenCalledWith('note.txt', 'renamed.txt', '/repo');
  });

  it('flush 失败则中止 rename，避免旧键草稿与新路径分叉', async () => {
    const { store } = makeStore({ saved: 0, failed: 1 });
    await (
      store.getState() as unknown as {
        renameWorkspaceFile: (p: string, n: string, wsPath?: string) => Promise<void>;
      }
    ).renameWorkspaceFile('note.txt', 'renamed.txt', '/repo');
    expect(bridge().renameFile).not.toHaveBeenCalled();
  });

  it('move 前同样先 flush，失败则中止', async () => {
    const okStore = makeStore({ saved: 1, failed: 0 }).store;
    await (
      okStore.getState() as unknown as {
        moveWorkspaceFile: (p: string, n: string, wsPath?: string) => Promise<void>;
      }
    ).moveWorkspaceFile('note.txt', 'dir/note.txt', '/repo');
    expect(bridge().moveFile).toHaveBeenCalledWith('note.txt', 'dir/note.txt', '/repo');

    vi.clearAllMocks();
    const failStore = makeStore({ saved: 0, failed: 1 }).store;
    await (
      failStore.getState() as unknown as {
        moveWorkspaceFile: (p: string, n: string, wsPath?: string) => Promise<void>;
      }
    ).moveWorkspaceFile('note.txt', 'dir/note.txt', '/repo');
    expect(bridge().moveFile).not.toHaveBeenCalled();
  });
});
