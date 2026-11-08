import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createEditorActions, handleExternalBatch, peekPendingEditorText } from '../editorActions';
import {
  clearWorkspaceCaches,
  dropPendingEditorText,
  markSavedAt,
  scopedFileKey,
  setCachedFileDocument,
} from '../../shared';
import { beginSaveSequence } from '../../editorSavePipeline';

function makeStore(overrides: Record<string, unknown> = {}) {
  const reportError = vi.fn(() => 'toast-id');
  const showToast = vi.fn(() => 'toast-id');
  const refreshGitSnapshot = vi.fn(async () => {});
  const refreshOneWorkspaceTree = vi.fn(async () => {});
  const refreshAllWorkspaceTrees = vi.fn(async () => {});
  const refreshWorkspaceTree = vi.fn(async () => {});
  const pushFileConflictNotice = vi.fn(() => 'notice-1');
  const dismissFileOpNotice = vi.fn();
  const store = createStore<Record<string, unknown>>((set, get) => {
    const actions = createEditorActions(set as never, () => get() as never);
    return {
      appInfo: { currentWorkspace: { id: 'ws-1', path: '/repo' } },
      recentWorkspaces: [{ id: 'ws-1', path: '/repo' }],
      selectedFilePath: 'note.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: 'v1\n',
      fileLastModifiedAt: 1,
      fileMedia: null,
      fileMediaLoading: false,
      fileOpenError: null,
      outline: [],
      dirtyEditorPaths: [],
      externalFileChange: undefined,
      fileOpNotices: [],
      openTabs: [],
      errorToasts: [],
      reportError,
      showToast,
      refreshGitSnapshot,
      refreshOneWorkspaceTree,
      refreshAllWorkspaceTrees,
      refreshWorkspaceTree,
      workspaceTrees: {},
      pushFileConflictNotice,
      dismissFileOpNotice,
      fetchGitStatus: vi.fn(async () => {}),
      clearErrorToasts: vi.fn(),
      ...actions,
      ...overrides,
    } as unknown as Record<string, unknown>;
  });
  return { store, showToast, pushFileConflictNotice };
}

function bridge() {
  return (
    window as unknown as {
      digitalLife: {
        workspace: {
          createFile: ReturnType<typeof vi.fn>;
          updateFileContent: ReturnType<typeof vi.fn>;
          readFile: ReturnType<typeof vi.fn>;
          readFileForWorkspace: ReturnType<typeof vi.fn>;
          setEditorDirtyPaths: ReturnType<typeof vi.fn>;
        };
      };
    }
  ).digitalLife.workspace;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('editor autosave race regressions', () => {
  beforeEach(() => {
    clearWorkspaceCaches('ws-1');
    dropPendingEditorText('ws-1');
    vi.useFakeTimers();
    vi.stubGlobal('digitalLife', {
      workspace: {
        createFile: vi.fn(),
        updateFileContent: vi.fn(),
        readFile: vi.fn(),
        readFileForWorkspace: vi.fn(),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('新建文件的 watcher 回声（磁盘仍是创建时内容）不得被判成外部变更', async () => {
    const { store, pushFileConflictNotice, showToast } = makeStore({
      selectedFilePath: 'new.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: '',
      fileLastModifiedAt: 10,
    });
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('new.txt', 'hello', 'ws-1');
    store.setState({ dirtyEditorPaths: ['new.txt'] });
    // 创建动作自身的 watcher 回声：磁盘内容仍是创建时的空内容、mtime 未变。
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'new.txt', content: '', lastModifiedAt: 10 },
    });
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'new.txt', content: 'hello', lastModifiedAt: 11 },
    });

    handleExternalBatch(() => store.getState() as never, {
      changed: ['new.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toBeUndefined();
    expect(showToast).not.toHaveBeenCalled();

    const ok = await state.saveFile('new.txt', undefined);
    expect(ok).toBe(true);
    expect(pushFileConflictNotice).not.toHaveBeenCalled();
  });

  it('真正走 createWorkspaceFile：跨仓创建回填所属工作区并按该仓保存', async () => {
    const { store, pushFileConflictNotice } = makeStore({
      selectedFilePath: 'old.txt',
      selectedFileWorkspaceId: 'ws-old',
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo' },
        { id: 'ws-2', path: '/repo2' },
      ],
    });
    const state = store.getState() as unknown as {
      createWorkspaceFile: (
        path: string,
        content?: string,
        wsPath?: string,
      ) => Promise<string | undefined>;
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    bridge().createFile.mockResolvedValue({
      ok: true,
      data: { path: 'new.txt', content: '', lastModifiedAt: 10 },
    });
    const created = await state.createWorkspaceFile('new.txt', '', '/repo2');
    expect(created).toBe('new.txt');
    // createdWsId 必须是 ws-2，而不是当前工作区 ws-1 / 旧选中 ws-old。
    expect(
      (store.getState() as unknown as { selectedFileWorkspaceId?: string }).selectedFileWorkspaceId,
    ).toBe('ws-2');

    state.noteEditorText('new.txt', 'hello', 'ws-2');
    store.setState({ dirtyEditorPaths: ['new.txt'] });
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'new.txt', content: 'hello', lastModifiedAt: 11 },
    });
    // watcher 只监听当前工作区 ws-1，不会为 ws-2 的新建文件发回声；这里直接
    // 验证首次自动保存必须写到 ws-2，而不是当前工作区。
    const ok = await state.saveFile('new.txt', undefined);
    expect(ok).toBe(true);
    expect(bridge().updateFileContent).toHaveBeenCalledWith('new.txt', 'hello', '/repo2');
    expect(pushFileConflictNotice).not.toHaveBeenCalled();
  });

  it('真实外部修改（磁盘内容与基线/草稿都不同）仍须立外部旗并提示', async () => {
    const { store, showToast } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
    };
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });

    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toMatchObject({ path: 'note.txt' });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('保存在途的 watcher 回声（磁盘=最近本地写入）不得立外部旗', async () => {
    const { store, showToast } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const write = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const writeStarted = deferred<void>();
    bridge().updateFileContent.mockImplementation(() => {
      writeStarted.resolve();
      return write.promise;
    });

    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    const savePromise = state.saveFile('note.txt', undefined);
    await writeStarted.promise;
    state.noteEditorText('note.txt', 'v2\nv3\n', 'ws-1');

    // 保存 v2 的 watcher 回声在保存响应之前到达：磁盘 v2 正是本地最近写入。
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toBeUndefined();
    expect(showToast).not.toHaveBeenCalled();

    write.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    await savePromise;
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(peekPendingEditorText('note.txt', 'ws-1')).toBe('v2\nv3\n');
  });

  it('watcher 信号尚未被 reconcile 消费时，保存前也必须读盘拦截外部修改', async () => {
    const { store, pushFileConflictNotice } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });
    // 只收到批次信号，尚未推进 400ms 的 reconcile 定时器。
    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });

    const ok = await state.saveFile('note.txt', undefined);
    expect(ok).toBe(false);
    expect(pushFileConflictNotice).toHaveBeenCalledWith('note.txt', 'ws-1', '/repo');
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toMatchObject({ path: 'note.txt' });
  });

  it('外部旗已过期（磁盘仍等于基线）时保存自愈，不弹冲突', async () => {
    const { store, pushFileConflictNotice } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({
      dirtyEditorPaths: ['note.txt'],
      externalFileChange: { path: 'note.txt', lastModifiedAt: 99 },
    });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v1\n', lastModifiedAt: 1 },
    });
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });

    const ok = await state.saveFile('note.txt', undefined);
    expect(ok).toBe(true);
    expect(pushFileConflictNotice).not.toHaveBeenCalled();
    expect(bridge().updateFileContent).toHaveBeenCalledWith('note.txt', 'v2\n', undefined);
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toBeUndefined();
  });

  it('同一文件并发保存串行执行：后一次写最新草稿，最终基线正确', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const first = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const second = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const writes: string[] = [];
    bridge().updateFileContent.mockImplementation((_path: string, content: string) => {
      writes.push(content);
      if (content === 'v2\n') {
        firstStarted.resolve();
        return first.promise;
      }
      secondStarted.resolve();
      return second.promise;
    });

    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    const firstSave = state.saveFile('note.txt', undefined);
    await firstStarted.promise;
    state.noteEditorText('note.txt', 'v3\n', 'ws-1');
    const secondSave = state.saveFile('note.txt', undefined);

    // 第一次写未落定前，第二次写不得起飞（串行化的核心断言）。
    expect(writes).toEqual(['v2\n']);

    first.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    await firstSave;
    await secondStarted.promise;
    second.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v3\n', lastModifiedAt: 3 },
    });
    await secondSave;

    expect(writes).toEqual(['v2\n', 'v3\n']);
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v3\n');
    expect(peekPendingEditorText('note.txt', 'ws-1')).toBeUndefined();
  });

  it('保存在途期间继续输入：旧响应不得覆盖 fileContent，也不得吞掉新草稿', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const write = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const writeStarted = deferred<void>();
    bridge().updateFileContent.mockImplementation(() => {
      writeStarted.resolve();
      return write.promise;
    });

    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    const savePromise = state.saveFile('note.txt', undefined);
    // 等保存真正带着 v2 发出后，再模拟用户在途输入。
    await writeStarted.promise;
    state.noteEditorText('note.txt', 'v2\nv3\n', 'ws-1');

    write.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    const ok = await savePromise;

    expect(ok).toBe(true);
    // 旧响应只代表磁盘上的 v2；编辑器基线不能退回 v2，否则受控 value 会把
    // CodeMirror 文档短暂拉回旧内容。
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    // 新草稿必须保留，等待下一次自动保存。
    expect(peekPendingEditorText('note.txt', 'ws-1')).toBe('v2\nv3\n');
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toContain('note.txt');
  });

  it('写入期间被更新保存请求超车：旧响应不得清草稿或写基线', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const write = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const writeStarted = deferred<void>();
    bridge().updateFileContent.mockImplementation(() => {
      writeStarted.resolve();
      return write.promise;
    });

    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    const savePromise = state.saveFile('note.txt', undefined);
    await writeStarted.promise;
    // 写入在途时来了更新请求：旧响应必须被代际守卫丢弃。
    beginSaveSequence(scopedFileKey('ws-1', 'note.txt'));
    write.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    await savePromise;

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(peekPendingEditorText('note.txt', 'ws-1')).toBe('v2\n');
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toContain('note.txt');
  });

  it('保存在途撤回旧基线：不得把新草稿当成已清脏而丢弃', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const write = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const writeStarted = deferred<void>();
    bridge().updateFileContent.mockImplementation(() => {
      writeStarted.resolve();
      return write.promise;
    });

    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    const savePromise = state.saveFile('note.txt', undefined);
    await writeStarted.promise;
    // 用户撤回到旧基线（v1）：磁盘此刻已是本次写入的 v2，不能当成「已清脏」。
    state.noteEditorText('note.txt', 'v1\n', 'ws-1');

    write.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v2\n', lastModifiedAt: 2 },
    });
    await savePromise;

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(peekPendingEditorText('note.txt', 'ws-1')).toBe('v1\n');
    expect(
      (store.getState() as unknown as { dirtyEditorPaths: string[] }).dirtyEditorPaths,
    ).toContain('note.txt');
  });

  it('仅有暂存、脏标尚未置位：reconcile 仍按草稿优先，不被磁盘覆盖', async () => {
    const { store, showToast } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
    };
    // 故意不设置 dirtyEditorPaths：模拟 300ms 脏标防抖尚未落位的窗口。
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });

    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toMatchObject({ path: 'note.txt' });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('reconcile 读盘期间开始输入：不得用磁盘内容覆盖新草稿', async () => {
    const { store, showToast } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      reconcileSelectedFile: () => Promise<void>;
    };
    const read = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    bridge().readFile.mockReturnValue(read.promise);

    const reconcilePromise = state.reconcileSelectedFile();
    // 读盘在途时用户开始输入。
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    read.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v-disk\n', lastModifiedAt: 2 },
    });
    await reconcilePromise;

    // 磁盘内容与基线/草稿都不同 → 立外部旗，但绝不覆盖编辑器基线。
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toMatchObject({ path: 'note.txt' });
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('保存回声静默窗口内仍有真实 watcher 信号时必须读盘，不得跳过', async () => {
    const { store, showToast } = makeStore();
    markSavedAt(scopedFileKey('ws-1', 'note.txt'));
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });

    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);

    // 无草稿：静默重载到磁盘内容（不立外部旗、不打扰用户）。
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('external\n');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('overflow 批次也要为选中文件调度读盘分类', async () => {
    const { store, showToast } = makeStore();
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });

    handleExternalBatch(() => store.getState() as never, {
      changed: [],
      removed: [],
      overflow: true,
    });
    await vi.advanceTimersByTimeAsync(500);

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('external\n');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('目标文件自身 flush 失败：中止打开，不读盘覆盖草稿', async () => {
    const { store } = makeStore({
      saveDirtyEditors: vi.fn(async () => ({ saved: 0, failed: 1 })),
    });
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      openFile: (path: string) => Promise<void>;
    };
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    await state.openFile('note.txt');
    expect(bridge().readFile).not.toHaveBeenCalled();
    expect((store.getState() as unknown as { selectedFilePath: string }).selectedFilePath).toBe(
      'note.txt',
    );
  });

  it('其它文件 flush 失败不阻塞打开无草稿的目标文件', async () => {
    const { store } = makeStore({
      saveDirtyEditors: vi.fn(async () => ({ saved: 0, failed: 1 })),
    });
    const state = store.getState() as unknown as {
      openFile: (path: string) => Promise<void>;
    };
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'other.txt', content: 'other\n', lastModifiedAt: 2 },
    });
    await state.openFile('other.txt');
    expect(bridge().readFile).toHaveBeenCalledWith('other.txt');
  });

  it('工作区切换后的读盘期间开始输入：不得覆盖新草稿', async () => {
    const { store } = makeStore({
      appInfo: { currentWorkspace: { id: 'ws-new', path: '/new' } },
      recentWorkspaces: [{ id: 'ws-new', path: '/new' }],
      selectedFilePath: 'note.txt',
      selectedFileWorkspaceId: 'ws-old',
    });
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      reconcileSelectedFileAfterWorkspaceSwitch: () => Promise<void>;
    };
    const read = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    bridge().readFile.mockReturnValue(read.promise);

    const reconcilePromise = state.reconcileSelectedFileAfterWorkspaceSwitch();
    state.noteEditorText('note.txt', 'v2\n', 'ws-old');
    read.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v-disk\n', lastModifiedAt: 2 },
    });
    await reconcilePromise;

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('v1\n');
    expect(
      (store.getState() as unknown as { selectedFileWorkspaceId?: string }).selectedFileWorkspaceId,
    ).toBe('ws-old');
  });

  it('外部内容不得污染按 key 的基线缓存：切走再 flush 仍要弹冲突', async () => {
    const { store, pushFileConflictNotice } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    // note.txt 的已知基线（也是切换到 other.txt 后的按 key 复核依据）。
    setCachedFileDocument(scopedFileKey('ws-1', 'note.txt'), {
      content: 'v1\n',
      lastModifiedAt: 1,
    });
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({ dirtyEditorPaths: ['note.txt'] });
    bridge().readFile.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });
    handleExternalBatch(() => store.getState() as never, {
      changed: ['note.txt'],
      removed: [],
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toMatchObject({ path: 'note.txt' });

    // 用户切到另一个文件后，切前 flush 会保存 note.txt 的残留草稿。
    store.setState({
      selectedFilePath: 'other.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: 'other\n',
    });
    const ok = await state.saveFile('note.txt', undefined);
    expect(ok).toBe(false);
    expect(pushFileConflictNotice).toHaveBeenCalledWith('note.txt', 'ws-1', '/repo');
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
  });

  it('外部旗存在但读盘失败：推冲突卡且不写盘', async () => {
    const { store, pushFileConflictNotice } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({
      dirtyEditorPaths: ['note.txt'],
      externalFileChange: { path: 'note.txt', lastModifiedAt: 99 },
    });
    bridge().readFile.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });

    const ok = await state.saveFile('note.txt', undefined);
    expect(ok).toBe(false);
    expect(pushFileConflictNotice).toHaveBeenCalledWith('note.txt', 'ws-1', '/repo');
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
  });

  it('reconcile 读盘期间切换文件：不得把旧文件内容写进新选区', async () => {
    const { store } = makeStore();
    const state = store.getState() as unknown as {
      reconcileSelectedFile: () => Promise<void>;
    };
    const read = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    bridge().readFile.mockReturnValue(read.promise);

    const reconcilePromise = state.reconcileSelectedFile();
    store.setState({
      selectedFilePath: 'other.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: 'other\n',
    });
    read.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'v-disk\n', lastModifiedAt: 2 },
    });
    await reconcilePromise;

    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('other\n');
  });

  it('预检期间被更新保存请求超车：旧请求不得推冲突卡', async () => {
    const { store, pushFileConflictNotice } = makeStore();
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    const read = deferred<{
      ok: true;
      data: { path: string; content: string; lastModifiedAt: number };
    }>();
    const readStarted = deferred<void>();
    bridge().readFile.mockImplementation(() => {
      readStarted.resolve();
      return read.promise;
    });
    state.noteEditorText('note.txt', 'v2\n', 'ws-1');
    store.setState({
      dirtyEditorPaths: ['note.txt'],
      externalFileChange: { path: 'note.txt', lastModifiedAt: 99 },
    });

    const firstSave = state.saveFile('note.txt', undefined);
    await readStarted.promise;
    // 模拟预检期间又来了更新请求：代际推进，旧请求的结果必须作废。
    beginSaveSequence(scopedFileKey('ws-1', 'note.txt'));
    read.resolve({
      ok: true,
      data: { path: 'note.txt', content: 'external\n', lastModifiedAt: 3 },
    });
    await firstSave;

    expect(pushFileConflictNotice).not.toHaveBeenCalled();
    expect(bridge().updateFileContent).not.toHaveBeenCalled();
  });

  it('同路径跨工作区保存：不得把目标工作区内容写进当前选区', async () => {
    const { store } = makeStore({
      selectedFilePath: 'note.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: 'selected\n',
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo' },
        { id: 'ws-2', path: '/repo2' },
      ],
    });
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('note.txt', 'draft\n', 'ws-2');
    setCachedFileDocument(scopedFileKey('ws-2', 'note.txt'), {
      content: 'disk\n',
      lastModifiedAt: 5,
    });
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'note.txt', content: 'draft\n', lastModifiedAt: 6 },
    });

    const ok = await state.saveFile('note.txt', '/repo2');
    expect(ok).toBe(true);
    // 目标属于 ws-2；isSelected 必须同时比较工作区，不能污染 ws-1 的当前选区。
    expect((store.getState() as unknown as { fileContent: string }).fileContent).toBe('selected\n');
  });

  it('非选中文件保存：用该文件自己的缓存基线判定，不误弹冲突', async () => {
    const { store, pushFileConflictNotice } = makeStore({
      selectedFilePath: 'note.txt',
      selectedFileWorkspaceId: 'ws-1',
      fileContent: 'v1\n',
      recentWorkspaces: [
        { id: 'ws-1', path: '/repo' },
        { id: 'ws-2', path: '/repo2' },
      ],
    });
    const state = store.getState() as unknown as {
      noteEditorText: (path: string, text: string, ws?: string) => void;
      saveFile: (path?: string, wsPath?: string) => Promise<boolean>;
    };
    state.noteEditorText('other.txt', 'draft\n', 'ws-2');
    store.setState({
      dirtyEditorPaths: ['other.txt'],
      externalFileChange: { path: 'other.txt', lastModifiedAt: 99 },
    });
    // 非选中文件的已知磁盘基线在按文件键控的文档缓存里。
    setCachedFileDocument(scopedFileKey('ws-2', 'other.txt'), {
      content: 'disk\n',
      lastModifiedAt: 5,
    });
    bridge().readFileForWorkspace.mockResolvedValue({
      ok: true,
      data: { path: 'other.txt', content: 'disk\n', lastModifiedAt: 5 },
    });
    bridge().updateFileContent.mockResolvedValue({
      ok: true,
      data: { path: 'other.txt', content: 'draft\n', lastModifiedAt: 6 },
    });

    const ok = await state.saveFile('other.txt', '/repo2');
    expect(ok).toBe(true);
    expect(pushFileConflictNotice).not.toHaveBeenCalled();
    expect(bridge().updateFileContent).toHaveBeenCalledWith('other.txt', 'draft\n', '/repo2');
    expect(
      (store.getState() as unknown as { externalFileChange: unknown }).externalFileChange,
    ).toBeUndefined();
  });
});
