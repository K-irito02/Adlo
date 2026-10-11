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
    isDownloading: false,
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
      onFilesChanged: vi.fn(() => () => {}),
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
});

describe('useAppStartup ad-server reachability (Phase 4 R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    useAppStore.setState({ adServerReachable: null });
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
    vi.unstubAllGlobals();
  });

  it('writes probe results into the store via the reachability subscription', async () => {
    // jsdom 非 Tauri：走订阅分支。getInfo 挂起使 bootstrap 不写 store，
    // 探针成功后的 true 只能来自订阅写入（确定性归因）。
    (window as unknown as { digitalLife: { app: { getInfo: unknown } } }).digitalLife.app.getInfo =
      vi.fn(() => new Promise(() => {}));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
    renderHook(() => useAppStartup(undefined));
    const { isAdServerReachable, resetAdServerReachability } =
      await import('../../../preview-bridge/preview-reachability');
    resetAdServerReachability();
    await act(async () => {
      await isAdServerReachable('http://127.0.0.1:59991');
    });
    expect(useAppStore.getState().adServerReachable).toBe(true);
  });
});
