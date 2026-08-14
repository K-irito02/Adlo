import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { prefetchPageMeta } from '@utils/fetchPageMeta';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useBrowserTagActions } from '../useBrowserTagActions';

vi.mock('@utils/fetchPageMeta', () => ({
  prefetchPageMeta: vi.fn(),
}));

function makeTab(id: string, url: string, title = 'Old'): BrowserTabState {
  return {
    id,
    workspaceId: 'ws1',
    title,
    url,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
  };
}

describe('useBrowserTagActions refresh write gate', () => {
  beforeEach(async () => {
    vi.mocked(prefetchPageMeta).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh.example')],
      browserHistory: [],
      browserTabFolders: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
    });
  });

  it('force-refresh that fails to re-download bytes preserves cached dataUri and does NOT downgrade a high-quality faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://refresh.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/big.png',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue({
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
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/big.png');
  });

  it('failed fetch (empty title/dataUri) does NOT clobber the existing entry', async () => {
    siteMetaCache.setCachedSiteMeta('https://refresh-empty.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/big.png',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh-empty.example')],
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue({
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
    });
    useAppStore.setState({
      browserTabs: [makeTab('tab1', 'https://refresh-datauri-only.example')],
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue({
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
});

describe('useBrowserTagActions handleOpenTabInCurrentTab', () => {
  afterEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: '',
    });
  });

  it('updates active tab url only, not the bookmark title', () => {
    const browserUpdateTab = vi.fn();
    useAppStore.setState({
      browserTabs: [makeTab('t1', 'https://e.com', '自定义标题')],
      browserActiveTabId: 'active',
      browserUpdateTab,
    });
    const { result } = renderHook(() => useBrowserTagActions());
    act(() => {
      result.current.handleOpenTabInCurrentTab('t1');
    });
    expect(browserUpdateTab).toHaveBeenCalledWith('active', { url: 'https://e.com' });
  });
});
