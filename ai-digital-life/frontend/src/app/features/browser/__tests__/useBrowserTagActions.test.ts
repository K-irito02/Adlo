import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
