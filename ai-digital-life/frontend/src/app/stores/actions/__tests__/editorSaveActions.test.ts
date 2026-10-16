import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createEditorActions, handleExternalBatch } from '../editorActions';
import { clearWorkspaceCaches } from '../../shared';

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

describe('markExternalFileChange 方案A 跟手', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
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

  it('干净文件外部变更：防抖后自动重读（一次 toast）', async () => {
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
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(refreshGitSnapshot).toHaveBeenCalledWith('ws-1', '/repo', { silent: true });
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

  it('脏文件外部变更：提示但不覆盖草稿', async () => {
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
    await vi.advanceTimersByTimeAsync(500);
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('handleExternalBatch 批次跟手（Tauri 主通道）', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
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

describe('reconcileSelectedFile 草稿优先', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
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
