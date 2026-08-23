import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { pageMetaClient } from '@utils/pageMetaClient';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import type {
  BrowserTabState,
  BrowserBookmark,
  WorkspaceBookmarkEntry,
  BrowserHistoryState,
} from '@stores/slices/browserTypes';
import { useAppStartup } from '../useAppStartup';

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { warmup: vi.fn() },
}));

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    workspaceId: 'ws1',
    title: `T-${id}`,
    url,
    titleResolved: false,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
  };
}

// bootstrap 会在启动 effect 中执行，这里提供最小 bridge 使其短路返回
function setupWindowDigitalLife() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      getInfo: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'WARMUP_TEST_EARLY_EXIT', message: 'bootstrap short-circuit' },
      }),
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
    workspace: {
      listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      onFileChanged: vi.fn(() => () => {}),
    },
  };
}

describe('useAppStartup warmup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      loading: false,
      browserTabs: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
      browserHistory: [],
    });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('warmup collects unique visible urls (tabs+bookmarks+history) capped at 200', async () => {
    const tabs = [
      makeTab('tab1', 'https://a.example/'),
      makeTab('tab2', 'https://b.example/'),
      makeTab('tab3', 'https://c.example/'),
    ];
    // bookmark 用无尾斜杠写法，normalize 后与 tab2 重复
    const bookmarks: BrowserBookmark[] = [
      { url: 'https://b.example', title: 'B' },
      { url: 'https://d.example/', title: 'D' },
    ];
    const workspaceBookmarks: WorkspaceBookmarkEntry[] = [
      { tabId: 'tab9', url: 'https://e.example/', title: 'E' },
    ];
    const history: BrowserHistoryState[] = [
      { id: 'h1', title: 'F', url: 'https://f.example/', visitedAt: 1 },
    ];
    useAppStore.setState({
      browserTabs: tabs,
      browserBookmarks: bookmarks,
      browserWorkspaceBookmarks: { ws1: workspaceBookmarks },
      browserHistory: history,
    });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledWith([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
      'https://e.example/',
      'https://f.example/',
    ]);
  });

  it('caps warmup urls at 200', async () => {
    const tabs = Array.from({ length: 250 }, (_, i) =>
      makeTab(`tab-${i}`, `https://u${i}.example/`),
    );
    useAppStore.setState({ browserTabs: tabs });

    renderHook(() => useAppStartup(undefined));
    await act(async () => {});

    const urls = vi.mocked(pageMetaClient.warmup).mock.calls[0]?.[0] ?? [];
    expect(urls.length).toBe(200);
    expect(new Set(urls).size).toBe(200);
  });

  it('retries warmup when store is empty (deferred hydration) until data appears', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // beforeEach 已把浏览器数据置空：首次收集为空 → 不调用 warmup，仅安排重试
      renderHook(() => useAppStartup(undefined));

      expect(vi.mocked(pageMetaClient.warmup)).not.toHaveBeenCalled();

      // 模拟延迟水合完成（browserSlice 的 requestIdleCallback / setTimeout 200ms 之后）
      useAppStore.setState({
        browserTabs: [makeTab('tab1', 'https://a.example/')],
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledWith(['https://a.example/']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps retrying past the 1000ms hydration window (rIC timeout) and warms up late data (⑨)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderHook(() => useAppStartup(undefined));
      expect(vi.mocked(pageMetaClient.warmup)).not.toHaveBeenCalled();

      // 空结果重试 4 次（300ms × 4 = 1200ms）：水合窗口 requestIdleCallback timeout:1000 可能
      // 晚于 900ms，重试必须覆盖到 1000ms 之后。
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(vi.mocked(pageMetaClient.warmup)).not.toHaveBeenCalled();

      // 数据在 1000ms 后出现（超出旧实现 900ms 覆盖窗口）
      useAppStore.setState({
        browserTabs: [makeTab('tab1', 'https://late.example/')],
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pageMetaClient.warmup)).toHaveBeenCalledWith(['https://late.example/']);
    } finally {
      vi.useRealTimers();
    }
  });
});
