import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { requestPreviewApi } from '../shared/ipc/preview-api';
import {
  collectPreviewWatchRoots,
  createPreviewEventsBridge,
  setPreviewWatchRoots,
} from './preview-events';

vi.mock('../shared/ipc/preview-api', () => ({
  requestPreviewApi: vi.fn(async (pathname: string) => {
    const root = new URLSearchParams(pathname.split('?')[1] ?? '').get('rootPath');
    if (root === '/repo-a') {
      return {
        ok: true,
        data: { cursor: 3, changed: ['a.txt'], removed: [], overflow: false },
      };
    }
    return {
      ok: true,
      data: { cursor: 1, changed: [], removed: ['b.txt'], overflow: false },
    };
  }),
}));

describe('setPreviewWatchRoots', () => {
  it('keeps every added root and dedupes path variants', () => {
    setPreviewWatchRoots(['E:\\Repo\\', 'e:/repo', '  ', '/w/Repo', '/w/repo']);
    expect(collectPreviewWatchRoots()).toEqual(['E:\\Repo\\', '/w/Repo', '/w/repo']);
  });

  it('an explicit empty list clears polling roots', () => {
    setPreviewWatchRoots(['/a']);
    setPreviewWatchRoots([]);
    expect(collectPreviewWatchRoots()).toEqual([]);
  });
});

describe('createPreviewEventsBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPreviewWatchRoots([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('polls every watched root and tags each batch with its rootPath', async () => {
    setPreviewWatchRoots(['/repo-a', '/repo-b']);
    const bridge = createPreviewEventsBridge();
    const batches: { rootPath?: string; changed: string[]; removed: string[] }[] = [];
    const unsubscribe = bridge.onFilesChanged((batch) => batches.push(batch));
    await vi.advanceTimersByTimeAsync(2000);
    expect(batches).toHaveLength(2);
    expect(batches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rootPath: '/repo-a', changed: ['a.txt'] }),
        expect.objectContaining({ rootPath: '/repo-b', removed: ['b.txt'] }),
      ]),
    );
    unsubscribe();
  });

  it('stops polling after unsubscribe', async () => {
    setPreviewWatchRoots(['/repo-a']);
    const bridge = createPreviewEventsBridge();
    const listener = vi.fn();
    bridge.onFilesChanged(listener)();
    await vi.advanceTimersByTimeAsync(4000);
    expect(listener).not.toHaveBeenCalled();
  });

  it('advances each root cursor across polls', async () => {
    const mocked = vi.mocked(requestPreviewApi);
    mocked.mockClear();
    setPreviewWatchRoots(['/repo-a', '/repo-b']);
    const bridge = createPreviewEventsBridge();
    const unsubscribe = bridge.onFilesChanged(() => {});
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const urls = mocked.mock.calls.map(([pathname]) => String(pathname));
    // 首轮两根都从 0 开始；次轮各自使用自己的游标（A=3 / B=1）。
    expect(urls.filter((url) => url.includes('since=0')).length).toBe(2);
    expect(urls.some((url) => url.includes('%2Frepo-a') && url.includes('since=3'))).toBe(true);
    expect(urls.some((url) => url.includes('%2Frepo-b') && url.includes('since=1'))).toBe(true);
    unsubscribe();
  });
});
