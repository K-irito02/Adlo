import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PageMeta, PageMetaUpdatedPayload } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import { resetFaviconSelfHealThrottleForTest } from '../faviconSelfHeal';
import { useBrowserDialogs } from '../useBrowserDialogs';

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: {
    peek: vi.fn(),
    get: vi.fn(),
    getSilent: vi.fn(),
    fetchHttp: vi.fn(),
    subscribeUpdated: vi.fn(),
  },
}));

function makeMeta(partial: Partial<PageMeta>): PageMeta {
  const {
    title = 'X',
    favicon = 'https://x.com/f.png',
    faviconDataUri = '',
    url = 'https://x.com',
  } = partial;
  return { title, favicon, faviconDataUri, url };
}

describe('useBrowserDialogs create-tab write gate', () => {
  beforeEach(async () => {
    // 定时器隔离：handleCreateTabConfirm 成功后会 arm 一个 2s 延迟的
    // scheduleFaviconFetch（真实 setTimeout）。若用真实定时器，该延迟 getSilent
    // 会落进后面某个测试的时间窗，导致 `not.toHaveBeenCalled` 类断言 flaky。
    // 仅 fake 计时器（Date/微任务保持真实），与 useAppStartup.test.ts 先例一致。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    resetFaviconSelfHealThrottleForTest();
    vi.mocked(pageMetaClient.peek).mockReset();
    vi.mocked(pageMetaClient.get).mockReset();
    vi.mocked(pageMetaClient.getSilent).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockResolvedValue(null);
    vi.mocked(pageMetaClient.subscribeUpdated).mockReset();
    // 默认 noop 订阅：不断言广播的用例走 4s 超时分支（由下述 advance 推进落定）。
    vi.mocked(pageMetaClient.subscribeUpdated).mockReturnValue(() => {});
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function confirmCreateTab(url: string) {
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      const pending = result.current.handleCreateTabConfirm('', url);
      // 进入 favicon 广播等待时推进 fake 时间使其超时落定；
      // 未进入等待时队列为空，推进是无操作。
      await vi.advanceTimersByTimeAsync(4000);
      await pending;
    });
    return { openTab };
  }

  it('failed fetch (null meta) does NOT write and no Google-fallback write happens', async () => {
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(null);
    await confirmCreateTab('https://dlg-null.example');
    expect(siteMetaCache.getCachedSiteMeta('https://dlg-null.example')).toBeUndefined();
    expect(siteMetaCache.getCachedFavicon('https://dlg-null.example')).toBe('');
  });

  it('empty-title create-tab adopts fetched title without writing the cache', async () => {
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({
        title: 'X',
        faviconDataUri: 'data:image/png;base64,AAA',
        url: 'https://dlg-full.example',
      }),
    );
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm('', 'https://dlg-full.example', 'save-only');
    });
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://dlg-full.example', title: 'X' }),
    );
    expect(siteMetaCache.getCachedSiteMeta('https://dlg-full.example')).toBeUndefined();
  });

  it('meta with favicon but empty faviconDataUri does not write the cache', async () => {
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({ faviconDataUri: '', url: 'https://dlg-empty-datauri.example' }),
    );
    await confirmCreateTab('https://dlg-empty-datauri.example');
    expect(siteMetaCache.getCachedSiteMeta('https://dlg-empty-datauri.example')).toBeUndefined();
  });

  it('does NOT overwrite a cached high-quality faviconUrl with a low-quality create-tab favicon', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-q.example', {
      title: 'Old',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({
        title: 'New',
        favicon: 'https://dlg-q.example/favicon.ico',
        url: 'https://dlg-q.example',
      }),
    );
    await confirmCreateTab('https://dlg-q.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-q.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
  });

  it('dataUri-only cache + low-quality URL favicon on create-tab does NOT write a faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-datauri-only.example', {
      title: 'Old',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({
        title: 'New',
        favicon: 'https://dlg-datauri-only.example/favicon.ico',
        faviconDataUri: '',
        url: 'https://dlg-datauri-only.example',
      }),
    );
    await confirmCreateTab('https://dlg-datauri-only.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-datauri-only.example')!;
    expect(entry.faviconUrl).toBe('');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });

  it('no-title cache hit adopts cached title and only fire-and-forget HTTP backfill', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-cache-hit.example', {
      title: 'Cached Real',
      faviconUrl: 'https://dlg-cache-hit.example/f.ico',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: 'http',
      lastOkAt: 1,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.peek).mockReturnValue({
      title: 'Cached Real',
      faviconUrl: 'https://dlg-cache-hit.example/f.ico',
      faviconDataUri: '',
      fetchedAt: 1,
      titleSource: 'http',
      lastOkAt: 1,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({ title: 'Silent Heal', url: 'https://dlg-cache-hit.example' }),
    );
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm('', 'https://dlg-cache-hit.example', 'save-only');
    });
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://dlg-cache-hit.example', title: 'Cached Real' }),
    );
    // 缓存命中但 favicon 缺失 → 后台 HTTP 自愈刷新一次（不创建隐藏 WebView）。
    expect(pageMetaClient.fetchHttp).toHaveBeenCalledWith('https://dlg-cache-hit.example');
    expect(pageMetaClient.getSilent).not.toHaveBeenCalled();
  });

  it('cache hit WITH data-URI present does NOT fire HTTP backfill', async () => {
    vi.mocked(pageMetaClient.peek).mockReturnValue({
      title: 'Cached Data',
      faviconUrl: 'https://dlg-cache-data.example/f.ico',
      faviconDataUri: 'data:image/png;base64,AAAA',
      fetchedAt: 1,
      titleSource: 'http',
      nextRetryAt: 0,
      failCount: 0,
      lastOkAt: 1,
    });
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm(
        '',
        'https://dlg-cache-data.example',
        'save-only',
      );
    });
    expect(pageMetaClient.fetchHttp).not.toHaveBeenCalled();
    expect(pageMetaClient.getSilent).not.toHaveBeenCalled();
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://dlg-cache-data.example', title: 'Cached Data' }),
    );
  });

  it('no-title cache miss calls getSilent', async () => {
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({ title: 'Silent', url: 'https://dlg-silent.example' }),
    );
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      const pending = result.current.handleCreateTabConfirm(
        '',
        'https://dlg-silent.example',
        'save-only',
      );
      await vi.advanceTimersByTimeAsync(4000);
      await pending;
    });
    expect(pageMetaClient.getSilent).toHaveBeenCalledWith('https://dlg-silent.example');
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://dlg-silent.example', title: 'Silent' }),
    );
    expect(pageMetaClient.get).not.toHaveBeenCalled();
  });

  it('no-title getSilent null falls back to hostname title', async () => {
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(null);
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm('', 'https://dlg-null-host.example', 'save-only');
    });
    expect(pageMetaClient.getSilent).toHaveBeenCalledWith('https://dlg-null-host.example');
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://dlg-null-host.example',
        title: 'dlg-null-host.example',
      }),
    );
  });

  it('create-tab fetch does not touch a cached entry (title + dataUri preserved)', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-title.example', {
      title: 'Old Title',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({
        title: '',
        favicon: 'https://x.com/f.png',
        faviconDataUri: 'data:image/png;base64,NEW',
        url: 'https://dlg-title.example',
      }),
    );
    await confirmCreateTab('https://dlg-title.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-title.example')!;
    expect(entry.title).toBe('Old Title');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });

  it('favicon broadcast arrives early: resolves the wait without the 4s timeout', async () => {
    const url = 'https://dlg-broadcast.example';
    vi.mocked(pageMetaClient.getSilent).mockResolvedValue(
      makeMeta({ title: 'Live', faviconDataUri: '', url }),
    );
    const listeners: ((p: PageMetaUpdatedPayload) => void)[] = [];
    const unsub = vi.fn();
    vi.mocked(pageMetaClient.subscribeUpdated).mockImplementation((cb) => {
      listeners.push(cb);
      return unsub;
    });
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      const pending = result.current.handleCreateTabConfirm('', url, 'save-only');
      for (let i = 0; i < 20 && listeners.length === 0; i++) {
        await Promise.resolve();
      }
      expect(listeners.length).toBe(1);
      listeners[0]({
        url,
        title: 'Live',
        faviconUrl: `${url}/f.png`,
        faviconDataUri: 'data:image/png;base64,NEW',
        source: 'http',
      });
      await pending;
    });
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url, title: 'Live' }),
    );
  });
});

describe('useBrowserDialogs create-tab save-mode branching', () => {
  const originalActions = {
    browserCreateBookmarkEntry: useAppStore.getState().browserCreateBookmarkEntry,
    browserNavigateActiveTab: useAppStore.getState().browserNavigateActiveTab,
  };

  beforeEach(async () => {
    vi.mocked(pageMetaClient.peek).mockReset();
    vi.mocked(pageMetaClient.get).mockReset();
    vi.mocked(pageMetaClient.getSilent).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockResolvedValue(null);
    vi.mocked(pageMetaClient.subscribeUpdated).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserNavigateInPlace: false,
      browserCreateBookmarkEntry: originalActions.browserCreateBookmarkEntry,
      browserNavigateActiveTab: originalActions.browserNavigateActiveTab,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      browserNavigateInPlace: false,
      browserCreateBookmarkEntry: originalActions.browserCreateBookmarkEntry,
      browserNavigateActiveTab: originalActions.browserNavigateActiveTab,
      browserBookmarkFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
      browserTabs: [],
      browserActiveTabId: '',
      recentWorkspaces: [],
    });
  });

  function renderDialogs(
    openTab: ReturnType<typeof vi.fn>,
    showToast = vi.fn(),
    t: Record<string, string> = {},
    navigateTabExplicit = vi.fn(),
  ) {
    return renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit,
        activeTab: null,
        isBookmarked: false,
        showToast,
        t,
      }),
    );
  }

  it('save-only mode calls browserCreateBookmarkEntry without opening a tab', async () => {
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: true });
    const navigateActiveTab = vi.fn();
    useAppStore.setState({
      browserCreateBookmarkEntry: createBookmarkEntry,
      browserNavigateActiveTab: navigateActiveTab,
    });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-only');
    });
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com', title: 'Name' }),
    );
    expect(openTab).not.toHaveBeenCalled();
    expect(navigateActiveTab).not.toHaveBeenCalled();
  });

  it('save-and-open with navigateInPlace=true navigates active tab via explicit navigation', async () => {
    useAppStore.setState({ browserNavigateInPlace: true });
    const navigateTabExplicit = vi.fn();
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab, vi.fn(), {}, navigateTabExplicit);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
    });
    expect(navigateTabExplicit).toHaveBeenCalledWith('', 'https://example.com');
    expect(openTab).not.toHaveBeenCalled();
  });

  it('save-and-open with navigateInPlace=false opens new tab without custom title', async () => {
    useAppStore.setState({ browserNavigateInPlace: false });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
    });
    expect(openTab).toHaveBeenCalledWith('https://example.com', undefined, undefined, undefined);
  });

  it('save-only with both workspaceId and folderId lands the bookmark in the folder ONLY', async () => {
    useAppStore.setState({
      browserCreateBookmarkEntry: originalActions.browserCreateBookmarkEntry,
      browserBookmarkFolders: [{ id: 'f1', name: 'F', createdAt: 0, entries: [] }],
      browserWorkspaceBookmarks: {},
    });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      result.current.handleSetCreateTabDialog({ open: true, workspaceId: 'ws1', folderId: 'f1' });
    });
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-only');
    });
    const state = useAppStore.getState();
    const folder = state.browserBookmarkFolders.find((f) => f.id === 'f1')!;
    expect(folder.entries).toHaveLength(1);
    expect(folder.entries![0]).toMatchObject({ url: 'https://example.com', title: 'Name' });
    expect(state.browserWorkspaceBookmarks['ws1']).toBeUndefined();
  });

  it('save-only collision shows toast with path and writes nothing', async () => {
    const createBookmarkEntry = vi.fn().mockReturnValue({ ok: false, pathLabel: '工具' });
    useAppStore.setState({ browserCreateBookmarkEntry: createBookmarkEntry });
    const openTab = vi.fn();
    const showToast = vi.fn();
    const { result } = renderDialogs(openTab, showToast, {
      browserEditBookmarkDuplicate: 'DUP',
      browserBookmarkDuplicateWithPath: 'DUP at {path}',
    });
    await act(async () => {
      result.current.handleSetCreateTabDialog({ open: true, workspaceId: 'ws1', folderId: 'f1' });
    });
    await act(async () => {
      await result.current.handleCreateTabConfirm('Title', 'https://e.com', 'save-only');
    });
    expect(createBookmarkEntry).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://e.com', title: 'Title' }),
    );
    expect(showToast).toHaveBeenCalledWith('DUP at 工具', 'warning');
    expect(openTab).not.toHaveBeenCalled();
    expect(result.current.createTabDialog.open).toBe(true);
  });

  it('save-and-open collision shows toast with path and does not open tab', async () => {
    useAppStore.setState({
      browserNavigateInPlace: false,
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: '工作区A',
          createdAt: 0,
          entries: [
            {
              id: 'bm-existing',
              sourceTabId: 'existing',
              url: 'https://e.com',
              title: 'Title',
              addedAt: 0,
              lastModifiedAt: 0,
            },
          ],
        },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [{ url: 'https://e.com', title: 'Title' }],
    });
    const openTab = vi.fn();
    const showToast = vi.fn();
    const { result } = renderDialogs(openTab, showToast, {
      browserEditBookmarkDuplicate: 'DUP',
      browserBookmarkDuplicateWithPath: 'DUP at {path}',
    });
    await act(async () => {
      result.current.handleSetCreateTabDialog({ open: true, workspaceId: 'ws1', folderId: 'f1' });
    });
    await act(async () => {
      await result.current.handleCreateTabConfirm('Title', 'https://e.com', 'save-and-open');
    });
    expect(showToast).toHaveBeenCalledWith('DUP at 工作区A', 'warning');
    expect(openTab).not.toHaveBeenCalled();
  });

  it('save-and-open navigate-in-place re-save does not false-toast', async () => {
    useAppStore.setState({
      browserNavigateInPlace: true,
      browserActiveTabId: 't1',
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            {
              id: 'b1',
              sourceTabId: 't1',
              url: 'https://e.com',
              title: 'Title',
              addedAt: 0,
              lastModifiedAt: 0,
            },
          ],
        },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [{ url: 'https://e.com', title: 'Title' }],
      browserTabs: [
        {
          id: 't1',
          workspaceId: 'w',
          title: 'Title',
          url: 'https://e.com',
          titleResolved: false,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
    });
    const navigateTabExplicit = vi.fn();
    const openTab = vi.fn();
    const showToast = vi.fn();
    const { result } = renderDialogs(
      openTab,
      showToast,
      {
        browserEditBookmarkDuplicate: 'DUP',
        browserBookmarkDuplicateWithPath: 'DUP at {path}',
      },
      navigateTabExplicit,
    );
    await act(async () => {
      result.current.handleSetCreateTabDialog({ open: true, workspaceId: 'ws1', folderId: 'f1' });
    });
    await act(async () => {
      await result.current.handleCreateTabConfirm('Title', 'https://e.com', 'save-and-open');
    });
    expect(showToast).not.toHaveBeenCalled();
    expect(navigateTabExplicit).toHaveBeenCalledWith('t1', 'https://e.com');
  });

  it('save-and-open success opens tab without custom title', async () => {
    useAppStore.setState({
      browserNavigateInPlace: false,
      browserCreateBookmarkEntry: vi.fn().mockReturnValue({ ok: true }),
    });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Title', 'https://e.com', 'save-and-open');
    });
    expect(openTab).toHaveBeenCalledWith('https://e.com', undefined, undefined, undefined);
  });

  it('save-and-open success lands exactly ONE folder entry with the user title (no synthetic orphan)', async () => {
    useAppStore.setState({
      browserNavigateInPlace: false,
      browserCreateBookmarkEntry: originalActions.browserCreateBookmarkEntry,
      browserTabs: [],
      browserActiveTabId: '',
      browserBookmarkFolders: [{ id: 'f1', name: 'F', createdAt: 0, entries: [] }],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
    });
    const openTab = useAppStore.getState().browserOpenTab;
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      result.current.handleSetCreateTabDialog({ open: true, workspaceId: 'ws1', folderId: 'f1' });
    });
    await act(async () => {
      await result.current.handleCreateTabConfirm('Title', 'https://example.com', 'save-and-open');
    });
    const folder = useAppStore.getState().browserBookmarkFolders.find((f) => f.id === 'f1')!;
    const urlEntries = folder.entries!.filter((t) => t.url === 'https://example.com');
    expect(urlEntries).toHaveLength(1);
    expect(urlEntries[0].title).toBe('Title');
  });
});

describe('useBrowserDialogs edit-tab saved-bookmark sync', () => {
  const originalUpdateSavedBookmark = useAppStore.getState().browserUpdateSavedBookmark;

  beforeEach(async () => {
    vi.mocked(pageMetaClient.peek).mockReset();
    vi.mocked(pageMetaClient.get).mockReset();
    vi.mocked(pageMetaClient.getSilent).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockReset();
    vi.mocked(pageMetaClient.fetchHttp).mockResolvedValue(null);
    vi.mocked(pageMetaClient.subscribeUpdated).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            {
              id: 'saved-1',
              url: 'https://old.com',
              title: 'Old Title',
              addedAt: 0,
              lastModifiedAt: 0,
            },
          ],
        },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [{ url: 'https://old.com', title: 'Old Title' }],
      browserUpdateSavedBookmark: originalUpdateSavedBookmark,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      browserBookmarkFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
      browserUpdateSavedBookmark: originalUpdateSavedBookmark,
    });
  });

  function renderEditDialogs(showToast: ReturnType<typeof vi.fn>) {
    return renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast,
        t: {
          browserEditBookmarkDuplicate: 'DUP',
          browserBookmarkDuplicateWithPath: 'DUP at {path}',
        },
      }),
    );
  }

  it('updates the saved bookmark entry (no live tab) when editing', () => {
    const showToast = vi.fn();
    const { result } = renderEditDialogs(showToast);
    act(() => {
      result.current.handleEditTab('saved-1', 'Old Title', 'https://old.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('New Title', 'https://new.com', 'save-only');
    });
    const folder = useAppStore.getState().browserBookmarkFolders.find((f) => f.id === 'f1')!;
    expect(folder.entries![0]).toMatchObject({
      id: 'saved-1',
      url: 'https://new.com',
      title: 'New Title',
    });
    expect(result.current.editTabDialog.open).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('intercepts a same-path url+title collision with a path toast and keeps dialog open', () => {
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            { id: 'saved-1', url: 'https://e.com', title: 'A', addedAt: 0, lastModifiedAt: 0 },
            { id: 'other-2', url: 'https://e.com', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });
    const showToast = vi.fn();
    const { result } = renderEditDialogs(showToast);
    act(() => {
      result.current.handleEditTab('saved-1', 'A', 'https://e.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('A', 'https://e.com', 'save-only');
    });
    expect(showToast).toHaveBeenCalledWith('DUP at F', 'warning');
    expect(result.current.editTabDialog.open).toBe(true);
    const folder = useAppStore.getState().browserBookmarkFolders.find((f) => f.id === 'f1')!;
    expect(folder.entries).toHaveLength(2);
  });

  it('does not call browserUpdateTab on a blocked collision edit (live tab untouched)', () => {
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            { id: 'saved-1', url: 'https://e.com', title: 'A', addedAt: 0, lastModifiedAt: 0 },
            { id: 'other-2', url: 'https://e.com', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });
    const showToast = vi.fn();
    const updateTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: updateTab,
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast,
        t: {
          browserEditBookmarkDuplicate: 'DUP',
          browserBookmarkDuplicateWithPath: 'DUP at {path}',
        },
      }),
    );
    act(() => {
      result.current.handleEditTab('saved-1', 'A', 'https://e.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('A', 'https://e.com', 'save-only');
    });
    expect(showToast).toHaveBeenCalledWith('DUP at F', 'warning');
    expect(result.current.editTabDialog.open).toBe(true);
    expect(updateTab).not.toHaveBeenCalled();
  });

  it('edit collision shows toast with path and does not call browserUpdateTab', () => {
    useAppStore.setState({
      browserUpdateSavedBookmark: vi.fn().mockReturnValue({ ok: false, pathLabel: '工具' }),
    });
    const showToast = vi.fn();
    const updateTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: updateTab,
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast,
        t: {
          browserEditBookmarkDuplicate: 'DUP',
          browserBookmarkDuplicateWithPath: 'DUP at {path}',
        },
      }),
    );
    act(() => {
      result.current.handleEditTab('saved-1', 'A', 'https://e.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('A', 'https://e.com', 'save-only');
    });
    expect(showToast).toHaveBeenCalledWith('DUP at 工具', 'warning');
    expect(updateTab).not.toHaveBeenCalled();
    expect(result.current.editTabDialog.open).toBe(true);
  });

  it('edit success calls browserUpdateTab with url only (no title)', () => {
    useAppStore.setState({
      browserUpdateSavedBookmark: vi.fn().mockReturnValue({ ok: true, isSavedBookmark: true }),
      browserTabs: [
        {
          id: 'saved-1',
          workspaceId: 'w',
          title: 'A',
          url: 'https://e.com',
          titleResolved: false,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
    });
    const updateTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: updateTab,
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {
          browserEditBookmarkDuplicate: 'DUP',
          browserBookmarkDuplicateWithPath: 'DUP at {path}',
        },
      }),
    );
    act(() => {
      result.current.handleEditTab('saved-1', 'A', 'https://e.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('NewName', 'https://e.com', 'save-only');
    });
    expect(updateTab).toHaveBeenCalledTimes(1);
    expect(updateTab).toHaveBeenCalledWith('saved-1', { url: 'https://e.com' });
  });

  it('edit of a regular (non-saved) live tab updates title and url', () => {
    useAppStore.setState({
      browserUpdateSavedBookmark: vi.fn().mockReturnValue({ ok: true, isSavedBookmark: false }),
      browserTabs: [
        {
          id: 'live-1',
          workspaceId: 'w',
          title: 'Old',
          url: 'https://old.com',
          titleResolved: false,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
    });
    const updateTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: updateTab,
        navigateTabExplicit: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {
          browserEditBookmarkDuplicate: 'DUP',
          browserBookmarkDuplicateWithPath: 'DUP at {path}',
        },
      }),
    );
    act(() => {
      result.current.handleEditTab('live-1', 'Old', 'https://old.com');
    });
    act(() => {
      result.current.handleEditTabConfirm('NewName', 'https://new.com', 'save-only');
    });
    expect(updateTab).toHaveBeenCalledWith('live-1', {
      title: 'NewName',
      url: 'https://new.com',
      titleResolved: true,
    });
  });
});
