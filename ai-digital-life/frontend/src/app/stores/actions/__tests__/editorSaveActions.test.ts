import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createEditorActions, handleExternalBatch } from '../editorActions';
import { clearWorkspaceCaches, dropPendingEditorText } from '../../shared';
import { setPendingChangePreviewPath } from '../../cacheHelpers';

function makeStore() {
  const reportError = vi.fn(() => 'toast-id');
  const showToast = vi.fn(() => 'toast-id');
  const refreshGitSnapshot = vi.fn(async () => {});
  const store = createStore<Record<string, unknown>>((set, get) => {
    const actions = createEditorActions(set as never, () => get() as never);
    return {
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' } },
      selectedFilePath: 'note.txt',
      fileContent: 'v1\n',
      fileLastModifiedAt: 1,
      fileMedia: null,
      fileMediaLoading: false,
      fileOpenError: null,
      outline: [],
      dirtyEditorPaths: [],
      openTabs: [],
      errorToasts: [],
      reportError,
      showToast,
      refreshGitSnapshot,
      fetchGitStatus: vi.fn(async () => {}),
      clearErrorToasts: vi.fn(),
      ...actions,
    } as unknown as Record<string, unknown>;
  });
  return { store, reportError, showToast, refreshGitSnapshot };
}

function bridge() {
  return (
    window as unknown as {
      digitalLife: {
        workspace: {
          updateFileContent: ReturnType<typeof vi.fn>;
          readFile: ReturnType<typeof vi.fn>;
          setEditorDirtyPaths: ReturnType<typeof vi.fn>;
        };
      };
    }
  ).digitalLife.workspace;
}

describe('saveFile', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('无待存内容即 no-op（不调桥）', async () => {
    const { store } = makeStore();
    const ok = await (
      store.getState() as unknown as { saveFile: () => Promise<boolean> }
    ).saveFile();
    expect(ok).toBe(true);
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
  });

  it('有草稿即落盘并清蓝点、更新基线', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (p: string, t: string) => void;
      saveFile: () => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'v2\n');
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    const ok = await state.saveFile();
    expect(ok).toBe(true);
    expect(bridge().updateFileContent).toHaveBeenCalledWith('note.txt', 'v2\n', undefined);
    const after = store.getState() as unknown as {
      fileContent: string;
      dirtyEditorPaths: string[];
      fileLastModifiedAt: number;
    };
    expect(after.fileContent).toBe('v2\n');
    expect(after.dirtyEditorPaths).toEqual([]);
    expect(after.fileLastModifiedAt).toBe(2);
  });

  it('脏而无暂存：不清盘、只清过期标记（防旧基线回写）', async () => {
    const { store } = makeStore();
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    const state = store.getState() as unknown as { saveFile: () => Promise<boolean> };
    const ok = await state.saveFile();
    expect(ok).toBe(true);
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toEqual([]);
  });

  it('失败返回 false 并上报（草稿保留）', async () => {
    const { store, reportError } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (p: string, t: string) => void;
      saveFile: () => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'v2\n');
    bridge().updateFileContent.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk gone' },
    });
    const ok = await state.saveFile();
    expect(ok).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('reconcileSelectedFile', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('磁盘内容变了就更新基线（绕过缓存）', async () => {
    const { store } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v9\n', lastModifiedAt: 9 },
    });
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    expect(bridge().readFile).toHaveBeenCalledWith('note.txt');
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v9\n');
  });

  it('内容变新且变更面板正预览该文件：重拍 diff', async () => {
    const { store } = makeStore();
    const openChangePreview = vi.fn(async () => {});
    store.setState({
      selectedChangePreviewPath: 'note.txt',
      openChangePreview,
    });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-new\n', lastModifiedAt: 9 },
    });
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    expect(openChangePreview).toHaveBeenCalledWith('note.txt');
  });

  it('变更面板没在看该文件：不重拍 diff', async () => {
    const { store } = makeStore();
    const openChangePreview = vi.fn(async () => {});
    store.setState({ selectedChangePreviewPath: 'other.txt', openChangePreview });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-new\n', lastModifiedAt: 9 },
    });
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    expect(openChangePreview).not.toHaveBeenCalled();
  });

  it('文件消失且干净则清为空状态', async () => {
    const { store } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    const after = store.getState() as unknown as {
      fileContent: string | undefined;
      fileOpenError: { code: string } | null;
    };
    expect(after.fileContent).toBeUndefined();
    expect(after.fileOpenError?.code).toBe('NOT_FOUND');
  });
});

describe('reconcileSelectedFileAfterWorkspaceSwitch（事项5）', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function seedSwitch(
    store: ReturnType<typeof makeStore>['store'],
    opts: {
      currentId: string;
      currentPath: string;
      selectedWsId: string | undefined;
      listed: { id: string; path: string }[];
    },
  ) {
    store.setState({
      appInfo: { currentWorkspace: { id: opts.currentId, path: opts.currentPath } },
      selectedFileWorkspaceId: opts.selectedWsId,
      recentWorkspaces: opts.listed.map((w) => ({
        ...w,
        removedFromSidebar: false,
        available: true,
      })),
    });
  }

  function switchAction(store: ReturnType<typeof makeStore>['store']) {
    return store.getState() as unknown as {
      reconcileSelectedFileAfterWorkspaceSwitch: () => Promise<void>;
    };
  }

  it('源工作区已移除 + 新上下文无此文件 → 清空为空（无错误卡）', async () => {
    const { store } = makeStore();
    seedSwitch(store, {
      currentId: 'ws-new',
      currentPath: '/new',
      selectedWsId: 'ws-old',
      listed: [{ id: 'ws-new', path: '/new' }],
    });
    bridge().readFile.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
    await switchAction(store).reconcileSelectedFileAfterWorkspaceSwitch();
    const after = store.getState() as unknown as {
      selectedFilePath?: string;
      fileContent?: string;
      fileOpenError: null;
    };
    expect(bridge().readFile).toHaveBeenCalledWith('note.txt');
    expect(after.selectedFilePath).toBeUndefined();
    expect(after.fileContent).toBeUndefined();
    expect(after.fileOpenError).toBeNull();
  });

  it('源工作区已移除 + 新上下文有此文件 → 内容更新并归属新工作区', async () => {
    const { store } = makeStore();
    seedSwitch(store, {
      currentId: 'ws-new',
      currentPath: '/new',
      selectedWsId: 'ws-old',
      listed: [{ id: 'ws-new', path: '/new' }],
    });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-new\n', lastModifiedAt: 9 },
    });
    await switchAction(store).reconcileSelectedFileAfterWorkspaceSwitch();
    const after = store.getState() as unknown as {
      selectedFilePath?: string;
      selectedFileWorkspaceId?: string;
      fileContent?: string;
    };
    expect(after.selectedFilePath).toBe('note.txt');
    expect(after.selectedFileWorkspaceId).toBe('ws-new');
    expect(after.fileContent).toBe('v-new\n');
  });

  it('有未存草稿 → 保持不动（不读盘）', async () => {
    const { store } = makeStore();
    seedSwitch(store, {
      currentId: 'ws-new',
      currentPath: '/new',
      selectedWsId: 'ws-old',
      listed: [{ id: 'ws-new', path: '/new' }],
    });
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    await switchAction(store).reconcileSelectedFileAfterWorkspaceSwitch();
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
  });

  it('源仍在侧栏 → 走常规对账（读盘保鲜，不断选中）', async () => {
    const { store } = makeStore();
    store.setState({
      selectedFileWorkspaceId: 'ws-1',
      recentWorkspaces: [{ id: 'ws-1', path: '/repo', removedFromSidebar: false, available: true }],
    });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v1\n', lastModifiedAt: 1 },
    });
    await switchAction(store).reconcileSelectedFileAfterWorkspaceSwitch();
    expect(bridge().readFile).toHaveBeenCalledWith('note.txt');
    expect((store.getState() as unknown as { selectedFilePath: string }).selectedFilePath).toBe(
      'note.txt',
    );
  });
});

describe('prefetchChangePreviewForWorkspace（事项4 hover 预取）', () => {
  beforeEach(() => {
    setPendingChangePreviewPath(undefined);
    vi.stubGlobal('digitalLife', {
      workspace: {
        getChangePreviewForWorkspace: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setPendingChangePreviewPath(undefined);
  });

  function prefetchBridge() {
    return (
      window as unknown as {
        digitalLife: {
          workspace: { getChangePreviewForWorkspace: ReturnType<typeof vi.fn> };
        };
      }
    ).digitalLife.workspace.getChangePreviewForWorkspace;
  }

  function seedWorkspace(store: ReturnType<typeof makeStore>['store']) {
    store.setState({
      recentWorkspaces: [{ id: 'ws-1', path: '/repo', removedFromSidebar: false, available: true }],
    });
  }

  function prefetchAction(store: ReturnType<typeof makeStore>['store']) {
    return store.getState() as unknown as {
      prefetchChangePreviewForWorkspace: (
        workspacePath: string,
        relativePath: string,
      ) => Promise<void>;
    };
  }

  function previewData(path: string) {
    return {
      path,
      changeKind: 'modified',
      status: 'modified',
      baseExists: true,
      currentExists: true,
      baseContent: 'base\n',
      currentContent: 'current\n',
    } as never;
  }

  it('未缓存 → 拉取并写缓存，重复调用不再调桥', async () => {
    const { store } = makeStore();
    seedWorkspace(store);
    const rel = `hover-${Date.now()}.md`;
    prefetchBridge().mockResolvedValue({ ok: true, data: previewData(rel) });
    await prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', rel);
    await prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', rel);
    expect(prefetchBridge()).toHaveBeenCalledTimes(1);
    expect(prefetchBridge()).toHaveBeenCalledWith('/repo', rel);
  });

  it('加载中 → 不调桥', async () => {
    const { store } = makeStore();
    seedWorkspace(store);
    store.setState({ changePreviewLoading: true });
    await prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', 'any.md');
    expect(prefetchBridge()).not.toHaveBeenCalled();
  });

  it('用户请求在途（pending）→ 不调桥', async () => {
    const { store } = makeStore();
    seedWorkspace(store);
    setPendingChangePreviewPath('other.md');
    await prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', 'any.md');
    expect(prefetchBridge()).not.toHaveBeenCalled();
  });

  it('拉取失败 → 不抛错、不写缓存（下次仍会重试）', async () => {
    const { store } = makeStore();
    seedWorkspace(store);
    const rel = `hover-fail-${Date.now()}.md`;
    prefetchBridge().mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
    await expect(
      prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', rel),
    ).resolves.toBeUndefined();
    prefetchBridge().mockResolvedValue({ ok: true, data: previewData(rel) });
    await prefetchAction(store).prefetchChangePreviewForWorkspace('/repo', rel);
    expect(prefetchBridge()).toHaveBeenCalledTimes(2);
  });
});

describe('markExternalFileChange 方案A 跟手', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.useFakeTimers();
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('干净文件外部变更：防抖后自动重读（静默无 toast，P4 F7）', async () => {
    const { store, showToast, refreshGitSnapshot } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-ext\n', lastModifiedAt: 2 },
    });
    (
      store.getState() as unknown as {
        markExternalFileChange: (e: { path: string; lastModifiedAt: number }) => void;
      }
    ).markExternalFileChange({ path: 'note.txt', lastModifiedAt: 2 });
    expect(bridge().readFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).toHaveBeenCalledWith('note.txt');
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v-ext\n');
    expect(showToast).not.toHaveBeenCalled();
    expect(refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/repo', { silent: true });
  });

  it('脏文件外部变更：提示一次但不覆盖草稿（P4 F7）', async () => {
    const { store, showToast } = makeStore();
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-ext\n', lastModifiedAt: 2 },
    });
    (
      store.getState() as unknown as {
        markExternalFileChange: (e: { path: string; lastModifiedAt: number }) => void;
      }
    ).markExternalFileChange({ path: 'note.txt', lastModifiedAt: 2 });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'warning');
    await vi.advanceTimersByTimeAsync(500);
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
  });

  it('外部变更不打蓝点（脏点只属于用户输入，防自动保存回写覆盖）', async () => {
    const { store } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-ext\n', lastModifiedAt: 2 },
    });
    (
      store.getState() as unknown as {
        markExternalFileChange: (e: { path: string; lastModifiedAt: number }) => void;
      }
    ).markExternalFileChange({ path: 'note.txt', lastModifiedAt: 2 });
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toEqual([]);
    expect(
      (store.getState() as unknown as { externalFileChange: { path: string } | undefined })
        .externalFileChange?.path,
    ).toBe('note.txt');
    await vi.advanceTimersByTimeAsync(500);
  });

  it('自写回声（mtime 一致）直接忽略', async () => {
    const { store, showToast } = makeStore();
    (
      store.getState() as unknown as {
        markExternalFileChange: (e: { path: string; lastModifiedAt: number }) => void;
      }
    ).markExternalFileChange({ path: 'note.txt', lastModifiedAt: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('非选中文件：不重读不提示，只跟手 git', async () => {
    const { store, showToast, refreshGitSnapshot } = makeStore();
    (
      store.getState() as unknown as {
        markExternalFileChange: (e: { path: string; lastModifiedAt: number }) => void;
      }
    ).markExternalFileChange({ path: 'other.txt', lastModifiedAt: 5 });
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(refreshGitSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('handleExternalBatch 批次跟手（Tauri 主通道）', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.useFakeTimers();
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('命中选中文件：调度重载 + git 跟手', async () => {
    const { store, refreshGitSnapshot } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v-batch\n', lastModifiedAt: 3 },
    });
    handleExternalBatch(() => store.getState() as never, { changed: ['note.txt'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).toHaveBeenCalledWith('note.txt');
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v-batch\n');
    expect(refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/repo', { silent: true });
  });

  it('未命中选中文件：只跟手 git，不重读', async () => {
    const { store, refreshGitSnapshot } = makeStore();
    handleExternalBatch(() => store.getState() as never, { changed: ['other.txt'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect(refreshGitSnapshot).toHaveBeenCalledTimes(1);
  });

  it('空批次：什么都不做', async () => {
    const { store, refreshGitSnapshot } = makeStore();
    handleExternalBatch(() => store.getState() as never, { changed: [], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect(refreshGitSnapshot).not.toHaveBeenCalled();
  });
});

describe('跨工作区定向 (P4 F1/F14)', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    clearWorkspaceCaches('ws-2');
    dropPendingEditorText('ws-1');
    dropPendingEditorText('ws-2');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('选中非当前工作区文件：保存写进所属工作区', async () => {
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo1' } },
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo1' },
        { id: 'ws-2', path: '/repo2' },
      ],
      selectedFilePath: 'a.txt',
      selectedFileWorkspaceId: 'ws-2',
    });
    const state = store.getState() as unknown as {
      noteEditorText: (p: string, t: string, ws?: string) => void;
      saveFile: () => Promise<boolean>;
    };
    state.noteEditorText('a.txt', 'cross\n', 'ws-2');
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'a.txt', content: 'cross\n', lastModifiedAt: 7 },
    });
    const ok = await state.saveFile();
    expect(ok).toBe(true);
    expect(bridge().updateFileContent).toHaveBeenCalledWith('a.txt', 'cross\n', '/repo2');
  });

  it('跨工作区对账：经所属工作区重读', async () => {
    const { store } = makeStore();
    store.setState({
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo1' } },
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo1' },
        { id: 'ws-2', path: '/repo2' },
      ],
      selectedFilePath: 'a.txt',
      selectedFileWorkspaceId: 'ws-2',
      fileContent: 'old\n',
    });
    const readForWorkspace = vi.fn(async () => ({
      ok: true,
      data: { path: 'a.txt', content: 'new\n', lastModifiedAt: 8 },
    }));
    (
      window as unknown as {
        digitalLife: { workspace: { readFileForWorkspace: unknown } };
      }
    ).digitalLife.workspace.readFileForWorkspace = readForWorkspace;
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    expect(readForWorkspace).toHaveBeenCalledWith('/repo2', 'a.txt');
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('new\n');
    expect(bridge().readFile).not.toHaveBeenCalled();
  });
});

describe('saveDirtyEditors 计数语义 (P4 F4/F14)', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('只计真写盘；失败计数；过期标记清理不计', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (p: string, t: string) => void;
      saveDirtyEditors: () => Promise<{ saved: number; failed: number }>;
    };
    state.noteEditorText('a.txt', 'A\n');
    state.noteEditorText('b.txt', 'B\n');
    bridge().updateFileContent.mockImplementation(async (path: string) =>
      path === 'a.txt'
        ? { ok: true, data: { path, content: 'A\n', lastModifiedAt: 1 } }
        : { ok: false, error: { code: 'IO_ERROR', message: 'boom' } },
    );
    store.setState({ dirtyEditorPaths: ['a.txt', 'b.txt', 'stale.txt'] });
    const result = await state.saveDirtyEditors();
    expect(result).toEqual({ saved: 1, failed: 1 });
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toEqual(['b.txt']);
  });
});

describe('reconcileSelectedFile 草稿优先', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.stubGlobal('digitalLife', {
      workspace: {
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('文件消失但有草稿则保留并警告', async () => {
    const { store, showToast } = makeStore();
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    bridge().readFile.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
    await (
      store.getState() as unknown as { reconcileSelectedFile: () => Promise<void> }
    ).reconcileSelectedFile();
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'warning');
  });
});
