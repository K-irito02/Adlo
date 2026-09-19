import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchActions } from '../searchActions';
import type { StoreState } from '../../StoreState';

describe('searchActions scheduleRecompute with empty query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('drops file-change batches without scheduling recompute when no query is active', async () => {
    const searchInFiles = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { hits: [], hasMore: false } });
    const searchFiles = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: {
        searchInFiles,
        search: vi.fn().mockResolvedValue({ ok: true, data: { hits: [], hasMore: false } }),
        onFilesChanged: vi.fn(),
      },
    };

    const state = {
      searchQuery: '',
      searchEntries: [],
      searchSessionId: 1,
      searchWorkspaceId: 'ws-1',
      searchFiles,
      fetchGitStatus: vi.fn(),
      refreshAllWorkspaceTrees: vi.fn(),
    } as unknown as StoreState;
    let current = state;
    const set = vi.fn((partial: Partial<StoreState>) => {
      current = { ...current, ...partial } as StoreState;
    });
    const get = () => current;

    const actions = createSearchActions(set as never, get as never);
    const handler = vi.fn();
    (
      window.digitalLife as { workspace: { onFilesChanged: (cb: never) => unknown } }
    ).workspace.onFilesChanged = handler as never;
    actions.subscribeWorkspaceFilesChanged();
    const schedule = handler.mock.calls[0][0] as (batch: {
      changed: string[];
      removed: string[];
      overflow?: boolean;
    }) => void;

    // No active query: batches (including overflow) must be dropped, no timer scheduled.
    schedule({ changed: ['old.md'], removed: ['gone.md'], overflow: true });
    schedule({ changed: ['old2.md'], removed: [], overflow: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
    expect(searchFiles).not.toHaveBeenCalled();

    // Activate a query: only newly arrived paths may recompute (stale batches drained).
    current = {
      ...current,
      searchQuery: 'foo',
      searchEntries: [
        { workspaceId: 'ws-1', path: 'old.md', line: 1, preview: 'x' },
        { workspaceId: 'ws-1', path: 'new.md', line: 1, preview: 'y' },
      ],
    } as StoreState;
    schedule({ changed: ['new.md'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).toHaveBeenCalledTimes(1);
    expect(searchInFiles.mock.calls[0][0]).toEqual(['new.md']);
    // Stale overflow flag must not trigger a full searchFiles.
    expect(searchFiles).not.toHaveBeenCalled();
  });
});

describe('searchActions recompute guards (事项 45 Phase 4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupRecompute(initial: Record<string, unknown>) {
    const searchInFiles = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { hits: [], hasMore: false } });
    const searchFiles = vi.fn().mockResolvedValue(undefined);
    const onFilesChanged = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: {
        searchInFiles,
        search: vi.fn().mockResolvedValue({ ok: true, data: { hits: [], hasMore: false } }),
        onFilesChanged,
      },
    };
    let current = {
      searchQuery: 'foo',
      searchEntries: [],
      searchSessionId: 1,
      searchWorkspaceId: 'ws-1',
      filesSearchScope: 'content',
      searchHasMore: false,
      searchLimit: 200,
      searchFiles,
      fetchGitStatus: vi.fn(),
      refreshAllWorkspaceTrees: vi.fn(),
      ...initial,
    } as unknown as StoreState;
    const set = vi.fn((partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
      const patch = typeof partial === 'function' ? partial(current) : partial;
      current = { ...current, ...patch } as StoreState;
    });
    const get = () => current;
    const actions = createSearchActions(set as never, get as never);
    actions.subscribeWorkspaceFilesChanged();
    const schedule = onFilesChanged.mock.calls[0][0] as (batch: {
      changed: string[];
      removed: string[];
      overflow?: boolean;
    }) => void;
    const setQuery = (query: string) => {
      current = { ...current, searchQuery: query } as StoreState;
    };
    return { searchInFiles, searchFiles, schedule, setQuery, get, actions };
  }

  it('does not hit the backend when filesSearchScope is file', async () => {
    const { searchInFiles, searchFiles, schedule } = setupRecompute({ filesSearchScope: 'file' });
    schedule({ changed: ['a.md'], removed: ['b.md'] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
    expect(searchFiles).not.toHaveBeenCalled();
  });

  it('overflow triggers a full searchFiles instead of incremental recompute', async () => {
    const { searchInFiles, searchFiles, schedule } = setupRecompute({});
    schedule({ changed: ['a.md'], removed: [], overflow: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
    expect(searchFiles).toHaveBeenCalledWith('foo');
  });

  it('appends newly-matching files and replaces in place', async () => {
    const { searchInFiles, schedule, get } = setupRecompute({
      searchEntries: [
        { workspaceId: 'ws-1', path: 'a.md', line: 1, preview: 'x' },
        { workspaceId: 'ws-1', path: 'b.md', line: 3, preview: 'y' },
      ],
    });
    searchInFiles.mockResolvedValueOnce({
      ok: true,
      data: {
        hits: [
          { path: 'a.md', line: 2, preview: 'x2' },
          { path: 'c.md', line: 5, preview: 'z' },
        ],
        hasMore: false,
      },
    });
    schedule({ changed: ['a.md', 'c.md'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles.mock.calls[0][0]).toEqual(['a.md', 'c.md']);
    expect(get().searchEntries.map((e) => `${e.path}:${e.line}`)).toEqual([
      'a.md:2',
      'b.md:3',
      'c.md:5',
    ]);
  });

  it('leaves the precise hasMore untouched when a recompute only removes hits', async () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      workspaceId: 'ws-1',
      path: `f${i}.md`,
      line: 1,
      preview: 'x',
    }));
    const { schedule, get } = setupRecompute({ searchEntries: entries, searchHasMore: true });
    schedule({ changed: [], removed: entries.map((e) => e.path) });
    await vi.advanceTimersByTimeAsync(500);
    expect(get().searchEntries).toEqual([]);
    // 局部重算拿不到全局信息：删除文件只减少已知命中，不能据此宣称“已取尽”，
    // 故沿用上一次的精确值（旧的“>= 上限即视为被截断”推断已移除）。
    expect(get().searchHasMore).toBe(true);
  });

  it('cancelPendingSearch drops scheduled recomputes', async () => {
    const { searchInFiles, schedule, actions } = setupRecompute({});
    schedule({ changed: ['a.md'], removed: [] });
    actions.cancelPendingSearch();
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
  });

  it('drains stale pending paths when the query was cleared mid-window', async () => {
    const { searchInFiles, schedule, setQuery } = setupRecompute({});
    schedule({ changed: ['stale.md'], removed: [] });
    setQuery('');
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
    setQuery('bar');
    schedule({ changed: ['fresh.md'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).toHaveBeenCalledTimes(1);
    expect(searchInFiles.mock.calls[0][0]).toEqual(['fresh.md']);
  });

  it('retries failed paths when the next batch arrives', async () => {
    const { searchInFiles, schedule, get } = setupRecompute({
      searchEntries: [{ workspaceId: 'ws-1', path: 'a.md', line: 1, preview: 'x' }],
    });
    searchInFiles
      .mockResolvedValueOnce({ ok: false, error: { code: 'E', message: 'boom' } })
      .mockResolvedValueOnce({
        ok: true,
        data: { hits: [{ path: 'a.md', line: 2, preview: 'x2' }], hasMore: false },
      });
    (get() as unknown as { reportError?: unknown }).reportError = vi.fn();
    schedule({ changed: ['a.md'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).toHaveBeenCalledTimes(1);
    expect(get().searchEntries.map((e) => `${e.path}:${e.line}`)).toEqual(['a.md:1']);
    schedule({ changed: ['b.md'], removed: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).toHaveBeenCalledTimes(2);
    // 回填的 a.md 与新到的 b.md 一起重试
    expect(searchInFiles.mock.calls[1][0]).toEqual(['a.md', 'b.md']);
    expect(get().searchEntries.map((e) => `${e.path}:${e.line}`)).toEqual(['a.md:2']);
  });
});

describe('searchActions paging (事项 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupPaging(initial: Record<string, unknown>, page: unknown) {
    const search = vi.fn().mockResolvedValue({ ok: true, data: page });
    const searchInFiles = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { hits: [], hasMore: false } });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: { search, searchInFiles, onFilesChanged: vi.fn() },
    };
    let current = {
      searchQuery: 'needle',
      searchEntries: [],
      searchSessionId: 1,
      searchHasMore: true,
      searchLimit: 200,
      searchWorkspaceId: 'ws-1',
      filesSearchScope: 'content',
      appInfo: { currentWorkspace: { id: 'ws-1' } },
      // 与真实 slice 同语义：会话递增以丢弃过期响应
      beginSearchSession: () => {
        const nextId = (current.searchSessionId as number) + 1;
        current = { ...current, searchSessionId: nextId };
        return nextId;
      },
      fetchGitStatus: vi.fn(),
      refreshAllWorkspaceTrees: vi.fn(),
      ...initial,
    } as unknown as StoreState;
    const set = vi.fn((partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
      const patch = typeof partial === 'function' ? partial(current) : partial;
      current = { ...current, ...patch } as StoreState;
    });
    const get = () => current;
    const actions = createSearchActions(set as never, get as never);
    return { search, actions, get };
  }

  it('loadMoreSearchResults widens the window by one page (no debounce, keeps entries)', async () => {
    const { search, actions, get } = setupPaging(
      {},
      { hits: [{ path: 'a.md', line: 1, preview: 'x' }], hasMore: true },
    );

    await actions.loadMoreSearchResults();

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 400 });
    expect(get().searchLimit).toBe(400);
    expect(get().searchHasMore).toBe(true);
    expect(get().searchEntries.map((e) => e.path)).toEqual(['a.md']);
  });

  it('showAllSearchResults jumps straight to the safety ceiling', async () => {
    const { search, actions, get } = setupPaging({}, { hits: [], hasMore: false });

    await actions.showAllSearchResults();

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 5000 });
    expect(get().searchLimit).toBe(5000);
    expect(get().searchHasMore).toBe(false);
  });

  it('does nothing once every result is already shown', async () => {
    const { search, actions } = setupPaging({ searchHasMore: false }, { hits: [], hasMore: false });

    await actions.loadMoreSearchResults();
    await actions.showAllSearchResults();

    expect(search).not.toHaveBeenCalled();
  });

  it('stops widening at the ceiling', async () => {
    const { search, actions } = setupPaging(
      { searchLimit: 5000, searchHasMore: true },
      { hits: [], hasMore: true },
    );

    await actions.loadMoreSearchResults();

    expect(search).not.toHaveBeenCalled();
  });

  it('writes the precise hasMore reported by the initial search', async () => {
    // 首屏检索：窗口重置为默认页，hasMore 直接取自后端精确值（而非"等于上限即视为截断"）。
    const { search, actions, get } = setupPaging(
      { searchHasMore: false },
      { hits: [{ path: 'a.md', line: 1, preview: 'x' }], hasMore: true },
    );

    await actions.searchFiles('needle');
    await vi.advanceTimersByTimeAsync(500);

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 200 });
    expect(get().searchLimit).toBe(200);
    expect(get().searchHasMore).toBe(true);
    expect(get().searchEntries.map((e) => e.path)).toEqual(['a.md']);
  });

  it('reports no more when the initial search exhausts the results exactly', async () => {
    // 命中数恰好等于默认页大小：旧实现会误报"结果未取尽"。
    const page = {
      hits: Array.from({ length: 200 }, (_, i) => ({ path: 'a.md', line: i + 1, preview: 'x' })),
      hasMore: false,
    };
    const { actions, get } = setupPaging({}, page);

    await actions.searchFiles('needle');
    await vi.advanceTimersByTimeAsync(500);

    expect(get().searchEntries).toHaveLength(200);
    expect(get().searchHasMore).toBe(false);
  });

  it('refreshSearchResults re-runs with the current window and keeps shown entries', async () => {
    // 刷新全部（检索模式）：用当前窗口上限原位重跑，已显示内容不动（keepEntries），
    // searching 置位保证悬浮加载覆盖其上。
    const { search, actions, get } = setupPaging(
      {
        searchLimit: 400,
        searchEntries: [{ workspaceId: 'ws-1', path: 'old.md', line: 1, preview: 'stale' }],
      },
      { hits: [{ path: 'a.md', line: 1, preview: 'fresh' }], hasMore: false },
    );

    const pending = actions.refreshSearchResults();
    expect(get().searching).toBe(true);
    await pending;

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 400 });
    expect(get().searchLimit).toBe(400);
    expect(get().searchEntries.map((e) => e.path)).toEqual(['a.md']);
    expect(get().searching).toBe(false);
  });

  it('refreshSearchResults skips the backend request in file scope or with an empty query', async () => {
    const { search, actions } = setupPaging({ filesSearchScope: 'file' }, { hits: [] });

    await actions.refreshSearchResults();

    expect(search).not.toHaveBeenCalled();

    const empty = setupPaging({ searchQuery: '   ' }, { hits: [] });

    await empty.actions.refreshSearchResults();

    expect(empty.search).not.toHaveBeenCalled();
  });

  it('searchFiles raises searching immediately so the debounce window never flashes "no results"', async () => {
    const { search, actions, get } = setupPaging(
      {},
      { hits: [{ path: 'a.md', line: 1, preview: 'x' }], hasMore: false },
    );

    void actions.searchFiles('needle');
    // 防抖（300ms）尚未触发：加载态已置位，结果区走 searching 分支而非"无结果"。
    expect(get().searching).toBe(true);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 200 });
    expect(get().searching).toBe(false);
  });

  it('cancelPendingSearch resets searching so a workspace switch inside the debounce window cannot stick the loading state', async () => {
    const { search, actions, get } = setupPaging({}, { hits: [], hasMore: false });

    void actions.searchFiles('needle');
    expect(get().searching).toBe(true);

    actions.cancelPendingSearch();
    expect(get().searching).toBe(false);

    await vi.advanceTimersByTimeAsync(500);

    expect(search).not.toHaveBeenCalled();
    expect(get().searching).toBe(false);
  });

  it('refreshSearchResults cancels a pending debounced search and fires exactly once', async () => {
    const { search, actions } = setupPaging(
      { searchLimit: 400 },
      { hits: [{ path: 'a.md', line: 1, preview: 'x' }], hasMore: false },
    );

    void actions.searchFiles('needle');
    await actions.refreshSearchResults();
    await vi.advanceTimersByTimeAsync(500);

    // 待发防抖被取消：只有刷新这次直接请求，旧窗口不得回写。
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 400 });
  });

  it('refreshSearchResults surfaces a thrown IPC error and still resets searching', async () => {
    // IPC 直接抛异常（非 {ok:false}）：入队错误 toast，不形成 unhandled rejection，加载态可退出。
    const reportError = vi.fn();
    const { search, actions, get } = setupPaging(
      { searchLimit: 400, reportError },
      { hits: [], hasMore: false },
    );
    search.mockRejectedValueOnce(new Error('ipc-boom'));

    await actions.refreshSearchResults();

    expect(search).toHaveBeenCalledWith('needle', { offset: 0, limit: 400 });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(get().searching).toBe(false);
    expect(get().searchEntries).toEqual([]);
  });
});
