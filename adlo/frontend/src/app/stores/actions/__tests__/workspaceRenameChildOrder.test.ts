import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import { createWorkspaceActions } from '../workspaceActions';
import { childOrderKey } from '@features/file-tree/childOrder';
import type { RecentWorkspaceEntry } from '@shared/ipc';

const WS_PATH = 'C:/ws/a';

function workspaceEntry(id: string, path: string): RecentWorkspaceEntry {
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

function makeStore() {
  let actions: ReturnType<typeof createWorkspaceActions> | undefined;
  const refreshOneWorkspaceTree = vi.fn(async () => {});
  const store = createStore<Record<string, unknown>>((set, get) => {
    actions = createWorkspaceActions(set as never, () => get() as never);
    return {
      appInfo: {},
      recentWorkspaces: [workspaceEntry('ws-a', WS_PATH)],
      // 文件树未加载：改名仍需搬运目录顺序（从变更面板改名的真实路径）。
      workspaceTrees: {},
      expandedFileTreePaths: {},
      expandedChangesTreePaths: {},
      filePreviewModeByPath: {},
      fileChildOrder: {
        [childOrderKey(WS_PATH, '')]: ['src', 'docs'],
        [childOrderKey(WS_PATH, 'src')]: ['b.ts', 'a.ts'],
      },
      errorToasts: [],
      clearErrorToasts: vi.fn(),
      reportError: vi.fn(() => 'toast'),
      ...actions,
      saveDirtyEditors: vi.fn(async () => ({ saved: 0, failed: 0 })),
      refreshOneWorkspaceTree,
      refreshWorkspaceTree: vi.fn(async () => {}),
    };
  });
  if (!actions) {
    throw new Error('workspace actions were not created');
  }
  return { store, actions };
}

describe('renameWorkspaceFile 搬运目录顺序（文件树未缓存）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('workspaceTrees 为空时仍迁移 fileChildOrder 的键与父级名字', async () => {
    vi.stubGlobal('digitalLife', {
      workspace: {
        renameFile: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
    const { store, actions } = makeStore();

    await actions.renameWorkspaceFile('src', 'lib', WS_PATH);

    expect(store.getState().fileChildOrder).toEqual({
      [childOrderKey(WS_PATH, '')]: ['lib', 'docs'],
      [childOrderKey(WS_PATH, 'lib')]: ['b.ts', 'a.ts'],
    });
  });
});
