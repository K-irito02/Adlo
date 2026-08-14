import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PageMeta } from '@shared/ipc/browser';
import { prefetchPageMeta } from '@utils/fetchPageMeta';
import * as siteMetaCache from '@utils/siteMetaCache';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserDialogs } from '../useBrowserDialogs';

vi.mock('@utils/fetchPageMeta', () => ({
  prefetchPageMeta: vi.fn(),
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
    vi.mocked(prefetchPageMeta).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
  });

  async function confirmCreateTab(url: string) {
    const openTab = vi.fn();
    const { result } = renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
    await act(async () => {
      await result.current.handleCreateTabConfirm('', url);
    });
    return { openTab };
  }

  it('failed fetch (null meta) does NOT write and no Google-fallback write happens', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(null);
    await confirmCreateTab('https://dlg-null.example');
    expect(siteMetaCache.getCachedSiteMeta('https://dlg-null.example')).toBeUndefined();
    expect(siteMetaCache.getCachedFavicon('https://dlg-null.example')).toBe('');
  });

  it('successful fetch writes a full entry via setCachedSiteMeta', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({
        title: 'X',
        faviconDataUri: 'data:image/png;base64,AAA',
        url: 'https://dlg-full.example',
      }),
    );
    await confirmCreateTab('https://dlg-full.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-full.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,AAA');
    expect(typeof entry.fetchedAt).toBe('number');
  });

  it('meta with favicon but empty faviconDataUri still caches title + faviconUrl', async () => {
    vi.mocked(prefetchPageMeta).mockResolvedValue(
      makeMeta({ faviconDataUri: '', url: 'https://dlg-empty-datauri.example' }),
    );
    await confirmCreateTab('https://dlg-empty-datauri.example');
    const entry = siteMetaCache.getCachedSiteMeta('https://dlg-empty-datauri.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('does NOT overwrite a cached high-quality faviconUrl with a low-quality create-tab favicon', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-q.example', {
      title: 'Old',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
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
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
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

  it('preserves cached title when the create-tab fetch returns a data-URI but empty title', async () => {
    siteMetaCache.setCachedSiteMeta('https://dlg-title.example', {
      title: 'Old Title',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    vi.mocked(prefetchPageMeta).mockResolvedValue(
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
    expect(entry.faviconDataUri).toBe('data:image/png;base64,NEW');
  });
});

describe('useBrowserDialogs create-tab save-mode branching', () => {
  const originalActions = {
    browserCreateBookmarkEntry: useAppStore.getState().browserCreateBookmarkEntry,
    browserNavigateActiveTab: useAppStore.getState().browserNavigateActiveTab,
  };

  beforeEach(async () => {
    vi.mocked(prefetchPageMeta).mockReset();
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
    });
  });

  function renderDialogs(openTab: ReturnType<typeof vi.fn>) {
    return renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: openTab,
        browserUpdateTab: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast: vi.fn(),
        t: {},
      }),
    );
  }

  it('save-only mode calls browserCreateBookmarkEntry without opening a tab', async () => {
    const createBookmarkEntry = vi.fn();
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

  it('save-and-open with navigateInPlace=true navigates active tab', async () => {
    const navigateActiveTab = vi.fn();
    useAppStore.setState({
      browserNavigateInPlace: true,
      browserNavigateActiveTab: navigateActiveTab,
    });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
    });
    expect(navigateActiveTab).toHaveBeenCalledWith('https://example.com', 'Name');
    expect(openTab).not.toHaveBeenCalled();
  });

  it('save-and-open with navigateInPlace=false opens new tab', async () => {
    useAppStore.setState({ browserNavigateInPlace: false });
    const openTab = vi.fn();
    const { result } = renderDialogs(openTab);
    await act(async () => {
      await result.current.handleCreateTabConfirm('Name', 'https://example.com', 'save-and-open');
    });
    expect(openTab).toHaveBeenCalled();
  });
});

describe('useBrowserDialogs edit-tab saved-bookmark sync', () => {
  const originalUpdateSavedBookmark = useAppStore.getState().browserUpdateSavedBookmark;

  beforeEach(async () => {
    vi.mocked(prefetchPageMeta).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          tabs: [{ tabId: 'saved-1', url: 'https://old.com', title: 'Old Title' }],
        },
      ],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [{ url: 'https://old.com', title: 'Old Title' }],
      browserBookmarkTabIdUrlMap: { 'saved-1': 'https://old.com' },
      browserUpdateSavedBookmark: originalUpdateSavedBookmark,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      browserTabFolders: [],
      browserWorkspaceBookmarks: {},
      browserBookmarks: [],
      browserBookmarkTabIdUrlMap: {},
      browserUpdateSavedBookmark: originalUpdateSavedBookmark,
    });
  });

  function renderEditDialogs(showToast: ReturnType<typeof vi.fn>) {
    return renderHook(() =>
      useBrowserDialogs({
        browserOpenTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        activeTab: null,
        isBookmarked: false,
        showToast,
        t: { browserEditBookmarkDuplicate: 'DUP' },
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
    const folder = useAppStore.getState().browserTabFolders.find((f) => f.id === 'f1')!;
    expect(folder.tabs![0]).toMatchObject({
      tabId: 'saved-1',
      url: 'https://new.com',
      title: 'New Title',
    });
    expect(result.current.editTabDialog.open).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('intercepts a same-path url+title collision with a toast and keeps dialog open', () => {
    useAppStore.setState({
      browserTabFolders: [
        {
          id: 'f1',
          name: 'F',
          createdAt: 0,
          tabs: [
            { tabId: 'saved-1', url: 'https://e.com', title: 'A' },
            { tabId: 'other-2', url: 'https://e.com', title: 'A' },
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
    expect(showToast).toHaveBeenCalledWith('DUP', 'warning');
    expect(result.current.editTabDialog.open).toBe(true);
    const folder = useAppStore.getState().browserTabFolders.find((f) => f.id === 'f1')!;
    expect(folder.tabs).toHaveLength(2);
  });
});
