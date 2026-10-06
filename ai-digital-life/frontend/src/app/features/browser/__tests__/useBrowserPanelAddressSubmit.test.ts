import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrowserPanelAddressSubmit } from '../useBrowserPanelAddressSubmit';
import { useAppStore } from '@stores/slicedStore';
import { checkEmbed, isEmbedBlocked } from '@features/browser/checkEmbed';
import type { BrowserTabState } from '@stores/slices/browserSlice';

vi.mock('@features/browser/checkEmbed', () => ({
  isEmbedBlocked: vi.fn(() => false),
  checkEmbed: vi.fn(async () => false),
}));

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { get: async () => null },
}));

function makeCenterTab(id: string, url: string): BrowserTabState {
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
    location: 'center',
  };
}

describe('useBrowserPanelAddressSubmit', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserHistory: [],
      isTauri: false,
    });
  });

  it('浏览器模式面板空提交：期望导航不绑定中心标签（F1，事项 6）', async () => {
    const center = makeCenterTab('c1', 'https://center.example.com');
    useAppStore.setState({
      browserTabs: [center],
      browserTabsById: { c1: center },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    const expectedNavigationUrlRef: {
      current: { url: string; at: number; tabId: string | null } | null;
    } = {
      current: null,
    };
    const browserNavigatePanelTab = vi.fn();
    const navigateBrowser = vi.fn();
    const { result } = renderHook(() =>
      useBrowserPanelAddressSubmit({
        address: 'https://panel-empty.test',
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserLookupIndex: [],
        handleNavigationStart: vi.fn(),
        expectedNavigationUrlRef,
        navigateBrowser,
        browserNavigatePanelTab,
        setIframeLoadError: vi.fn(),
        setIframeBlockedDetected: vi.fn(),
        handlePageMeta: vi.fn(),
        addressSubmittedForTabRef: { current: '' },
        submitVersionRef: { current: 0 },
        validatedUrlsRef: { current: new Set<string>() },
      }),
    );

    await act(async () => {
      await result.current.submitAddress();
    });

    // 浏览器模式走面板 iframe 导航，不直接碰中心标签。
    expect(navigateBrowser).toHaveBeenCalledWith('https://panel-empty.test');
    expect(useAppStore.getState().browserTabsById['c1'].url).toBe('https://center.example.com');
    // 期望导航绑定 null（任意事件可消费），绝不能是 stale 的中心 id。
    expect(expectedNavigationUrlRef.current?.url).toBe('https://panel-empty.test');
    expect(expectedNavigationUrlRef.current?.tabId).toBeNull();
  });

  it('嵌入被拒时落错误兜底且不导航（blocked=true 分支）', async () => {
    const center = makeCenterTab('c1', 'https://center.example.com');
    useAppStore.setState({
      browserTabs: [center],
      browserTabsById: { c1: center },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    vi.mocked(isEmbedBlocked).mockReturnValueOnce(true);
    const setIframeBlockedDetected = vi.fn();
    const setIframeLoadError = vi.fn();
    const navigateBrowser = vi.fn();
    const expectedNavigationUrlRef: {
      current: { url: string; at: number; tabId: string | null } | null;
    } = { current: null };
    const { result } = renderHook(() =>
      useBrowserPanelAddressSubmit({
        address: 'https://blocked.example.com',
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserLookupIndex: [],
        handleNavigationStart: vi.fn(),
        expectedNavigationUrlRef,
        navigateBrowser,
        browserNavigatePanelTab: vi.fn(),
        setIframeLoadError,
        setIframeBlockedDetected,
        handlePageMeta: vi.fn(),
        addressSubmittedForTabRef: { current: '' },
        submitVersionRef: { current: 0 },
        validatedUrlsRef: { current: new Set<string>() },
      }),
    );

    await act(async () => {
      await result.current.submitAddress();
    });

    expect(setIframeBlockedDetected).toHaveBeenCalledWith(true);
    expect(setIframeLoadError).toHaveBeenCalledWith(true);
    expect(navigateBrowser).not.toHaveBeenCalled();
    expect(checkEmbed).not.toHaveBeenCalled();
    expect(useAppStore.getState().browserTabsById['c1'].url).toBe('https://center.example.com');
  });
});
