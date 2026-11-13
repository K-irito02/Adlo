import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import type { AppInfo, RecentWorkspaceEntry } from '@adlo/kernel';
import type { StoreState } from '../../StoreState';
import { createEditorActions } from '../editorActions';
import { clearWorkspaceCaches, dropPendingEditorText, pendingEditorTextKeys } from '../../shared';
import { externalWorkspaceId } from '../externalWorkspace';

/** 暂存缓冲是模块级的：跨用例清空，避免别的测试的键干扰 flush 计数。 */
function clearPendingTexts() {
  for (const key of pendingEditorTextKeys()) {
    const separator = key.indexOf(':');
    if (separator > 0) {
      dropPendingEditorText(key.slice(0, separator), key.slice(separator + 1));
    }
  }
}

function makeStore() {
  interface UpdateResult {
    ok: boolean;
    data?: { path: string; content: string; lastModifiedAt: number };
    error?: { code: string; message: string };
  }
  const updateFileContent = vi.fn<(...args: unknown[]) => Promise<UpdateResult>>(async () => ({
    ok: true,
    data: { path: 'notes.md', content: 'draft', lastModifiedAt: 9 },
  }));
  const readFileForWorkspace = vi.fn(async () => ({
    ok: true as const,
    data: { path: 'notes.md', content: '# outside\n', lastModifiedAt: 7 },
  }));
  vi.stubGlobal('digitalLife', {
    workspace: {
      readFileForWorkspace,
      updateFileContent,
      setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
    },
  });
  const repo: RecentWorkspaceEntry = {
    id: 'ws-1',
    path: '/repo',
    rootPath: '/repo',
    name: 'repo',
    lastOpenedAt: 1,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
  const appInfo = {
    currentWorkspace: { id: 'ws-1', path: '/repo', rootPath: '/repo' },
  } as AppInfo;
  const store = createStore<Partial<StoreState>>((set, get) => ({
    appInfo,
    recentWorkspaces: [repo],
    externalFileRoots: {},
    selectedFilePath: undefined,
    selectedFileWorkspaceId: undefined,
    fileContent: undefined,
    fileMedia: null,
    fileMediaLoading: false,
    fileOpenError: null,
    outline: [],
    dirtyEditorPaths: [],
    externalFileChange: undefined,
    fileOpNotices: [],
    openTabs: [],
    errorToasts: [],
    showToast: vi.fn(),
    reportError: vi.fn(() => 'toast-id'),
    pushFileConflictNotice: vi.fn(() => 'notice-1'),
    dismissFileOpNotice: vi.fn(),
    fetchGitStatus: vi.fn(async () => {}),
    refreshGitSnapshot: vi.fn(async () => {}),
    refreshOneWorkspaceTree: vi.fn(async () => {}),
    workspaceTrees: {},
    ...createEditorActions(set as never, () => get() as never),
  }));
  return { store, updateFileContent, readFileForWorkspace };
}

describe('openFileOutsideWorkspaces', () => {
  beforeEach(() => {
    clearPendingTexts();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearWorkspaceCaches('ws-1');
    clearPendingTexts();
  });

  it('opens the file through a hidden in-memory workspace', async () => {
    const { store, readFileForWorkspace } = makeStore();
    const id = externalWorkspaceId('E:/Downloads');

    const opened = await store.getState().openFileOutsideWorkspaces!('E:\\Downloads\\notes.md');

    const state = store.getState();
    expect(opened).toBe(true);
    expect((state.recentWorkspaces ?? []).find((entry) => entry.id === id)).toMatchObject({
      path: 'E:/Downloads',
      removedFromSidebar: true,
    });
    // 未登记任何新的可见工作区。
    expect(
      (state.recentWorkspaces ?? []).filter((entry) => !entry.removedFromSidebar),
    ).toHaveLength(1);
    // 根以 externalFileRoots 为准，不依赖会被整体替换的 recentWorkspaces。
    expect(state.externalFileRoots?.[id]).toBe('E:/Downloads');
    expect(readFileForWorkspace).toHaveBeenCalledWith('E:/Downloads', 'notes.md');
    expect(state.selectedFilePath).toBe('notes.md');
    expect(state.selectedFileWorkspaceId).toBe(id);
    expect(state.fileContent).toBe('# outside\n');
    expect((state.openTabs ?? []).map((tab) => tab.path)).toContain('notes.md');
  });

  it('rejects a non-absolute path instead of inventing a workspace root', async () => {
    const { store } = makeStore();
    const opened = await store.getState().openFileOutsideWorkspaces!('docs\\notes.md');
    expect(opened).toBe(false);
  });

  it('keeps saving to the external root after the workspace list is refreshed', async () => {
    const { store, updateFileContent } = makeStore();
    const id = externalWorkspaceId('E:/Downloads');
    const actions = store.getState();
    await actions.openFileOutsideWorkspaces!('E:/Downloads/notes.md');
    actions.noteEditorText!('notes.md', 'draft', id);
    // 模拟添加/移除工作区或 bootstrap：recentWorkspaces 被整体替换。
    store.setState({ recentWorkspaces: [] });

    await expect(store.getState().saveFile!()).resolves.toBe(true);
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'draft', 'E:/Downloads');
  });

  it('flushes an external draft through saveDirtyEditors', async () => {
    const { store, updateFileContent } = makeStore();
    const id = externalWorkspaceId('E:/Flush');
    const actions = store.getState();
    await actions.openFileOutsideWorkspaces!('E:/Flush/notes.md');
    actions.noteEditorText!('notes.md', 'draft', id);
    const { peekPendingEditorText } = await import('../editorActions');
    expect(peekPendingEditorText('notes.md', id)).toBe('draft');

    const result = await store.getState().saveDirtyEditors!();
    expect(result).toEqual({ saved: 1, failed: 0 });
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'draft', 'E:/Flush');
  });

  it('saves two same-named drafts to their owning workspaces', async () => {
    const { store, updateFileContent } = makeStore();
    const state = store.getState();
    const repo2: RecentWorkspaceEntry = {
      id: 'ws-2',
      path: '/repo2',
      rootPath: '/repo2',
      name: 'repo2',
      lastOpenedAt: 1,
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      removedFromSidebar: false,
      available: true,
    };
    store.setState({ recentWorkspaces: [...(state.recentWorkspaces ?? []), repo2] });
    store.getState().noteEditorText!('notes.md', 'A', 'ws-1');
    store.getState().noteEditorText!('notes.md', 'B', 'ws-2');

    const result = await store.getState().saveDirtyEditors!();
    expect(result).toEqual({ saved: 2, failed: 0 });
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'A', undefined);
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'B', '/repo2');
  });

  it('keeps saving to the external root after the same folder becomes a visible workspace', async () => {
    const { store, updateFileContent } = makeStore();
    const id = externalWorkspaceId('E:/Shared');
    const actions = store.getState();
    await actions.openFileOutsideWorkspaces!('E:/Shared/notes.md');
    actions.noteEditorText!('notes.md', 'draft', id);
    // 同路径目录随后被添加为可见工作区：按路径解析会命中真实工作区，必须靠 workspaceId 定向。
    const visible: RecentWorkspaceEntry = {
      id: 'ws-shared',
      path: 'E:/Shared',
      rootPath: 'E:/Shared',
      name: 'shared',
      lastOpenedAt: 2,
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      removedFromSidebar: false,
      available: true,
    };
    const hidden = (store.getState().recentWorkspaces ?? []).filter((item) => item.id === id);
    const others = (store.getState().recentWorkspaces ?? []).filter((item) => item.id !== id);
    // 可见工作区排在隐藏条目之前：只按路径解析时会先命中它，必须靠 workspaceId 定向。
    store.setState({ recentWorkspaces: [...others, visible, ...hidden] });

    const result = await store.getState().saveDirtyEditors!();
    expect(result).toEqual({ saved: 1, failed: 0 });
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'draft', 'E:/Shared');
  });

  it('writes an external draft even when its baseline cache is gone', async () => {
    const { store, updateFileContent } = makeStore();
    const id = externalWorkspaceId('E:/NoBaseline');
    const actions = store.getState();
    await actions.openFileOutsideWorkspaces!('E:/NoBaseline/notes.md');
    // 切到另一个文件，让目标不再“选中”（基线只能来自文档缓存）。
    await store.getState().openFileOutsideWorkspaces!('E:/NoBaseline/other.md');
    store.getState().noteEditorText!('notes.md', 'draft', id);
    const { scopedFileKey } = await import('../../shared');
    const { invalidateCachedFileDocument } = await import('../../cacheHelpers');
    invalidateCachedFileDocument(scopedFileKey(id, 'notes.md'));

    const result = await store.getState().saveDirtyEditors!();
    expect(result).toEqual({ saved: 1, failed: 0 });
    expect(updateFileContent).toHaveBeenCalledWith('notes.md', 'draft', 'E:/NoBaseline');
  });

  it('keeps a root that still has an unsaved draft when capping roots', async () => {
    const { store, updateFileContent } = makeStore();
    updateFileContent.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk full' },
    });
    const firstId = externalWorkspaceId('E:/Keep');
    await store.getState().openFileOutsideWorkspaces!('E:/Keep/notes.md');
    store.getState().noteEditorText!('notes.md', 'draft', firstId);

    for (let index = 0; index < 21; index += 1) {
      await store.getState().openFileOutsideWorkspaces!(`E:/Other/dir-${index}/notes.md`);
    }
    expect(store.getState().externalFileRoots?.[firstId]).toBe('E:/Keep');
  });

  it('caps tracked roots but always keeps the current one', async () => {
    const { store } = makeStore();
    for (let index = 0; index < 21; index += 1) {
      await store.getState().openFileOutsideWorkspaces!(`E:/Downloads/dir-${index}/notes.md`);
    }
    const roots = store.getState().externalFileRoots ?? {};
    expect(Object.keys(roots).length).toBeLessThanOrEqual(20);
    expect(roots[externalWorkspaceId('E:/Downloads/dir-20')]).toBe('E:/Downloads/dir-20');
  });

  it('never fakes a successful save when the external root is gone', async () => {
    const { store, updateFileContent } = makeStore();
    const id = externalWorkspaceId('E:/Gone');
    const actions = store.getState();
    await actions.openFileOutsideWorkspaces!('E:/Gone/notes.md');
    actions.noteEditorText!('notes.md', 'draft', id);
    // 模拟隐藏条目与根映射都丢失（工作区列表刷新 + 极端清理）。
    store.setState({ recentWorkspaces: [], externalFileRoots: {} });

    await expect(store.getState().saveFile!()).resolves.toBe(false);
    expect(updateFileContent).not.toHaveBeenCalled();
    // 草稿必须保留，不能被当成「过期脏标」清掉。
    const { peekPendingEditorText } = await import('../editorActions');
    expect(peekPendingEditorText('notes.md', id)).toBe('draft');
  });
});
