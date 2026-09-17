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
