import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { pageMetaClient } from '@utils/pageMetaClient';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useBrowserTagActions } from '../useBrowserTagActions';
import { titleSourceRef, applyBroadcastTitle } from '../useBrowserPageMeta';

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { refresh: vi.fn(), peek: vi.fn(() => undefined) },
}));

function makeTab(id: string, url: string, title = 'Old'): BrowserTabState {
  return {
    id,
    workspaceId: 'ws1',
    title,
    url,
    titleResolved: false,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

describe('useBrowserTagActions handleOpenInCenter', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
    });
  });

  it('在中心打开：新建中心标签且不产生面板活动标签', () => {
    const { result } = renderHook(() => useBrowserTagActions());

    act(() => result.current.handleOpenInCenter('https://center-open.example', '标题'));

    const state = useAppStore.getState();
    const tab = state.browserTabs.find(
      (candidate) => candidate.url === 'https://center-open.example',
    );
    expect(tab).toBeDefined();
    expect(tab?.location).toBe('center');
    expect(tab?.title).toBe('标题');
    expect(state.centerTabs.some((centerTab) => centerTab.refId === tab!.id)).toBe(true);
    // 中心标签不进入面板活动标签（面板侧保持空）。
    expect(state.browserActiveTabId).toBe('');
  });
});

describe('useBrowserTagActions refresh no longer writes site-meta cache', () => {
  beforeEach(async () => {
    vi.mocked(pageMetaClient.refresh).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh.example')],
      browserHistory: [],
      browserBookmarkFolders: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
    });
  });

  it('refresh preserves the cached entry (title/dataUri/faviconUrl untouched — no direct write)', async () => {
    siteMetaCache.setCachedSiteMeta('https://refresh.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/big.png',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: 'X',
      favicon: 'https://x.com/new.ico',
      faviconDataUri: '',
      url: 'https://refresh.example',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tab1', 'https://refresh.example');
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://refresh.example')!;
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
    expect(entry.title).toBe('Old');
    expect(entry.faviconUrl).toBe('https://x.com/big.png');
  });

  it('failed fetch (empty title/dataUri) does NOT clobber the existing entry', async () => {
    siteMetaCache.setCachedSiteMeta('https://refresh-empty.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/big.png',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh-empty.example')],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: '',
      favicon: '',
      faviconDataUri: '',
      url: 'https://refresh-empty.example',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tab1', 'https://refresh-empty.example');
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://refresh-empty.example')!;
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
    expect(entry.title).toBe('Old');
    expect(entry.faviconUrl).toBe('https://x.com/big.png');
  });

  it('dataUri-only cache + low-quality URL favicon on refresh does NOT write a faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://refresh-datauri-only.example', {
      title: 'Old',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
      titleSource: '',
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh-datauri-only.example')],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: 'X',
      favicon: 'https://refresh-datauri-only.example/favicon.ico',
      faviconDataUri: '',
      url: 'https://refresh-datauri-only.example',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tab1', 'https://refresh-datauri-only.example');
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://refresh-datauri-only.example')!;
    expect(entry.faviconUrl).toBe('');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });

  it('static HTTP title from refresh does not downgrade a rendered title or lock COM source', async () => {
    titleSourceRef.delete('tab1');
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://spa.example/watch', '视频标题 - YouTube')],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: 'YouTube',
      favicon: 'https://spa.example/favicon.ico',
      faviconDataUri: '',
      url: 'https://spa.example/watch',
      source: 'http',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tab1', 'https://spa.example/watch');
    });
    const tab = useAppStore.getState().browserTabs.find((t) => t.id === 'tab1')!;
    expect(tab.title).toBe('视频标题 - YouTube');
    expect(titleSourceRef.get('tab1')).toBeUndefined();
    // COM 渲染标题仍可覆盖（未被 http 来源锁死）。
    expect(
      applyBroadcastTitle(tab, tab.url, '新的渲染标题', 'com', titleSourceRef.get('tab1')),
    ).toBe(true);
  });

  it('static HTTP title does not rewrite a history entry title', async () => {
    useAppStore.setState({
      browserTabs: [],
      browserHistory: [
        { id: 'h1', title: '旧历史标题', url: 'https://hist.example/', visitedAt: 1 },
      ],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: '站点名',
      favicon: 'https://hist.example/f.ico',
      faviconDataUri: '',
      url: 'https://hist.example/',
      source: 'http',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('h1', 'https://hist.example/');
    });
    expect(useAppStore.getState().browserHistory[0]?.title).toBe('旧历史标题');
  });

  it('refresh that applies a title records http source so a later com broadcast cannot overwrite it (⑥)', async () => {
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh-source.example', '')],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: '刷新标题',
      favicon: '',
      faviconDataUri: '',
      url: 'https://refresh-source.example',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tab1', 'https://refresh-source.example');
    });
    expect(titleSourceRef.get('tab1')).toBe('http');
    expect(
      applyBroadcastTitle(
        { title: '刷新标题', id: 'tab1' },
        'https://refresh-source.example',
        'com陈旧标题',
        'com',
        titleSourceRef.get('tab1'),
      ),
    ).toBe(false);
    titleSourceRef.delete('tab1');
  });
});

describe('useBrowserTagActions refresh bookmark snapshot sync', () => {
  beforeEach(async () => {
    vi.mocked(pageMetaClient.refresh).mockReset();
    useAppStore.setState({
      browserTabs: [],
      browserHistory: [],
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            {
              id: 'bm1',
              sourceTabId: 'tabX',
              url: 'https://x.com/',
              title: 'x.com',
              addedAt: 0,
              lastModifiedAt: 0,
            },
          ],
        },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
    });
  });

  it('refresh updates bookmark snapshot title when placeholder', async () => {
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: '真实标题',
      favicon: '',
      faviconDataUri: '',
      url: 'https://x.com/',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tabX', 'https://x.com/');
    });
    const folder = useAppStore.getState().browserBookmarkFolders.find((f) => f.id === 'f1')!;
    expect(folder.entries![0].title).toBe('真实标题');
  });

  it('refresh keeps custom bookmark title', async () => {
    useAppStore.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          entries: [
            {
              id: 'bm2',
              sourceTabId: 'tabX',
              url: 'https://x.com/',
              title: '我的书签',
              addedAt: 0,
              lastModifiedAt: 0,
            },
          ],
        },
      ],
    });
    vi.mocked(pageMetaClient.refresh).mockResolvedValue({
      title: '真实标题',
      favicon: '',
      faviconDataUri: '',
      url: 'https://x.com/',
    });
    const { result } = renderHook(() => useBrowserTagActions());
    await act(async () => {
      await result.current.handleRefreshTab('tabX', 'https://x.com/');
    });
    const folder = useAppStore.getState().browserBookmarkFolders.find((f) => f.id === 'f1')!;
    expect(folder.entries![0].title).toBe('我的书签');
  });
});

describe('useBrowserTagActions handleOpenTabInCurrentTab', () => {
  afterEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: '',
    });
  });

  it('navigates the active tab to the target url via explicit navigation (D4)', () => {
    const navigateTabExplicit = vi.fn();
    useAppStore.setState({
      browserTabs: [makeTab('t1', 'https://e.com', '自定义标题')],
      browserActiveTabId: 'active',
    });
    const { result } = renderHook(() => useBrowserTagActions({ navigateTabExplicit }));
    act(() => {
      result.current.handleOpenTabInCurrentTab('https://e.com');
    });
    expect(navigateTabExplicit).toHaveBeenCalledWith('active', 'https://e.com');
  });

  it('falls back to store url update when no explicit navigation helper is provided', () => {
    const browserUpdateTab = vi.fn();
    useAppStore.setState({
      browserTabs: [makeTab('t1', 'https://e.com', '自定义标题')],
      browserActiveTabId: 'active',
      browserUpdateTab,
    });
    const { result } = renderHook(() => useBrowserTagActions());
    act(() => {
      result.current.handleOpenTabInCurrentTab('https://e.com');
    });
    expect(browserUpdateTab).toHaveBeenCalledWith('active', { url: 'https://e.com' });
  });
});
