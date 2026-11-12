import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserUrlChange } from '../useBrowserUrlChange';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const pageMetaGet = vi.fn(
  async (_url: string, _opts?: unknown): Promise<{ title: string; favicon: string } | null> => null,
);

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: {
    get: (url: string, opts?: { force?: boolean }) => pageMetaGet(url, opts),
  },
}));

let urlListener: ((tabId: string, url: string) => void) | null = null;

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: id,
    url,
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    location: 'panel',
  };
}

describe('useBrowserUrlChange file:// navigation', () => {
  beforeEach(() => {
    urlListener = null;
    pageMetaGet.mockClear();
    useAppStore.setState({
      isTauri: true,
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserHistory: [],
    });
    (window as unknown as Record<string, unknown>).digitalLife = {
      browser: {
        onUrlChanged: (cb: (tabId: string, url: string) => void) => {
          urlListener = cb;
          return () => {};
        },
      },
    };
  });

  it('syncs the panel address for file:// and skips remote meta prefetch', () => {
    const tab = makeTab('t1', 'about:blank');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { t1: tab },
      browserActiveTabId: 't1',
    });
    const setAddress = vi.fn();
    renderHook(() =>
      useBrowserUrlChange({
        activeTab: tab,
        activeTabRef: { current: tab },
        iframeRef: { current: null },
        expectedNavigationUrlRef: { current: null },
        setAddress,
        setSearchQueryDisplay: vi.fn(),
        browserNavigatePanelTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        onPageMeta: vi.fn(),
        onNavigationStart: vi.fn(),
        markUrlSeen: vi.fn(),
        setIframeLoadError: vi.fn(),
      }),
    );

    act(() => {
      urlListener?.('t1', 'file:///D:/Desktop/a.html');
    });

    expect(setAddress).toHaveBeenCalledWith('file:///D:/Desktop/a.html');
    expect(pageMetaGet).not.toHaveBeenCalled();
    expect(useAppStore.getState().browserTabsById.t1.url).toBe('file:///D:/Desktop/a.html');
  });

  it('does not write center-hosted navigation into the panel address bar', async () => {
    const tab = { ...makeTab('t2', 'about:blank'), location: 'center' as const };
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { t2: tab },
      browserActiveTabId: 't2',
    });
    pageMetaGet.mockResolvedValueOnce({ title: 'CENTER TITLE', favicon: '' });
    const setAddress = vi.fn();
    const onNavigationStart = vi.fn();
    const onPageMeta = vi.fn();
    renderHook(() =>
      useBrowserUrlChange({
        activeTab: tab,
        activeTabRef: { current: tab },
        iframeRef: { current: null },
        expectedNavigationUrlRef: { current: null },
        setAddress,
        setSearchQueryDisplay: vi.fn(),
        browserNavigatePanelTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        onPageMeta,
        onNavigationStart,
        markUrlSeen: vi.fn(),
        setIframeLoadError: vi.fn(),
      }),
    );

    await act(async () => {
      urlListener?.('t2', 'https://center.example/x');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setAddress).not.toHaveBeenCalled();
    expect(onNavigationStart).not.toHaveBeenCalled();
    expect(useAppStore.getState().browserTabsById.t2.url).toBe('https://center.example/x');
    expect(
      useAppStore
        .getState()
        .browserHistory.some((entry) => entry.url === 'https://center.example/x'),
    ).toBe(true);
    expect(onPageMeta).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'CENTER TITLE' }),
      'http',
    );
  });

  it('does not navigate the global active center tab when the event tab was closed', () => {
    const center = { ...makeTab('c1', 'https://center.example'), location: 'center' as const };
    useAppStore.setState({
      browserTabs: [center],
      browserTabsById: { c1: center },
      browserActiveTabId: 'c1',
      browserHistory: [],
    });
    const expectedNavigationUrlRef = {
      current: { url: 'https://panel.example/a', at: Date.now(), tabId: 'closed-tab' },
    };
    renderHook(() =>
      useBrowserUrlChange({
        activeTab: center,
        activeTabRef: { current: center },
        iframeRef: { current: null },
        expectedNavigationUrlRef,
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserNavigatePanelTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        onPageMeta: vi.fn(),
        onNavigationStart: vi.fn(),
        markUrlSeen: vi.fn(),
        setIframeLoadError: vi.fn(),
      }),
    );

    act(() => {
      urlListener?.('closed-tab', 'https://panel.example/a');
    });

    expect(useAppStore.getState().browserTabsById.c1.url).toBe('https://center.example');
    expect(expectedNavigationUrlRef.current).toBeNull();
  });

  it('consumes a file:// expected navigation without recording a redirect', () => {
    const tab = makeTab('t3', 'file:///D:/a.html');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { t3: tab },
      browserActiveTabId: 't3',
      browserHistory: [],
    });
    const expectedNavigationUrlRef = {
      current: { url: 'file:///D:/a.html', at: Date.now(), tabId: 't3' },
    };
    renderHook(() =>
      useBrowserUrlChange({
        activeTab: tab,
        activeTabRef: { current: tab },
        iframeRef: { current: null },
        expectedNavigationUrlRef,
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserNavigatePanelTab: vi.fn(),
        browserUpdateTab: vi.fn(),
        onPageMeta: vi.fn(),
        onNavigationStart: vi.fn(),
        markUrlSeen: vi.fn(),
        setIframeLoadError: vi.fn(),
      }),
    );

    act(() => {
      urlListener?.('t3', 'file:///D:/a.html');
    });

    expect(expectedNavigationUrlRef.current).toBeNull();
    const history = useAppStore.getState().browserHistory;
    expect(history.some((entry) => entry.url === 'file:///D:/a.html')).toBe(true);
    expect(history.some((entry) => entry.url.startsWith('https://'))).toBe(false);
  });
});
