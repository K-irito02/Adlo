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
    const searchInFiles = vi.fn().mockResolvedValue({ ok: true, data: [] });
    const searchFiles = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: {
        searchInFiles,
        search: vi.fn().mockResolvedValue({ ok: true, data: [] }),
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
    const searchInFiles = vi.fn().mockResolvedValue({ ok: true, data: [] });
    const searchFiles = vi.fn().mockResolvedValue(undefined);
    const onFilesChanged = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      workspace: {
        searchInFiles,
        search: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        onFilesChanged,
      },
    };
    let current = {
      searchQuery: 'foo',
      searchEntries: [],
      searchSessionId: 1,
      searchWorkspaceId: 'ws-1',
      filesSearchScope: 'content',
      searchPartial: false,
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
      data: [
        { path: 'a.md', line: 2, preview: 'x2' },
        { path: 'c.md', line: 5, preview: 'z' },
      ],
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

  it('recomputes the partial flag after removals', async () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      workspaceId: 'ws-1',
      path: `f${i}.md`,
      line: 1,
      preview: 'x',
    }));
    const { schedule, get } = setupRecompute({ searchEntries: entries, searchPartial: true });
    schedule({ changed: [], removed: entries.map((e) => e.path) });
    await vi.advanceTimersByTimeAsync(500);
    expect(get().searchEntries).toEqual([]);
    expect(get().searchPartial).toBe(false);
  });

  it('cancelPendingSearch drops scheduled recomputes', async () => {
    const { searchInFiles, schedule, actions } = setupRecompute({});
    schedule({ changed: ['a.md'], removed: [] });
    actions.cancelPendingSearch();
    await vi.advanceTimersByTimeAsync(500);
    expect(searchInFiles).not.toHaveBeenCalled();
  });

  it('drains stale pending paths when the query was cleared mid-window', async () => {    const { searchInFiles, schedule, setQuery } = setupRecompute({});
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
        data: [{ path: 'a.md', line: 2, preview: 'x2' }],
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
