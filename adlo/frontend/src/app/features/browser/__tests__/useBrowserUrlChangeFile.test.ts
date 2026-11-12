import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserUrlChange } from '../useBrowserUrlChange';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const pageMetaGet = vi.fn(async (_url: string, _opts?: unknown) => null);

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

  it('does not write center-hosted navigation into the panel address bar', () => {
    const tab = { ...makeTab('t2', 'about:blank'), location: 'center' as const };
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { t2: tab },
      browserActiveTabId: 't2',
    });
    const setAddress = vi.fn();
    const onNavigationStart = vi.fn();
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
        onNavigationStart,
        markUrlSeen: vi.fn(),
        setIframeLoadError: vi.fn(),
      }),
    );

    act(() => {
      urlListener?.('t2', 'https://center.example/x');
    });

    expect(setAddress).not.toHaveBeenCalled();
    expect(onNavigationStart).not.toHaveBeenCalled();
    expect(useAppStore.getState().browserTabsById.t2.url).toBe('https://center.example/x');
  });
});
