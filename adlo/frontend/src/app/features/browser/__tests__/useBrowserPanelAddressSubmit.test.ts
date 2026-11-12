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

  it('裸 3080 在面板就地导航到后端真实入口（事项 2，Tauri）', async () => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserHistory: [],
      isTauri: true,
      toasts: [],
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=tok123', freedPort: false },
        })),
      },
    };
    try {
      const browserNavigatePanelTab = vi.fn();
      const setAddress = vi.fn();
      const expectedNavigationUrlRef: {
        current: { url: string; at: number; tabId: string | null } | null;
      } = { current: null };
      const { result } = renderHook(() =>
        useBrowserPanelAddressSubmit({
          address: 'http://127.0.0.1:3080',
          setAddress,
          setSearchQueryDisplay: vi.fn(),
          browserLookupIndex: [],
          handleNavigationStart: vi.fn(),
          expectedNavigationUrlRef,
          navigateBrowser: vi.fn(),
          browserNavigatePanelTab,
          setIframeLoadError: vi.fn(),
          setIframeBlockedDetected: vi.fn(),
          handlePageMeta: vi.fn(),
          addressSubmittedForTabRef: { current: '' },
          submitVersionRef: { current: 0 },
          validatedUrlsRef: { current: new Set<string>() },
          t: {
            dshPortFreed: 'FREED',
            browserLocalFileDesktopOnly: 'LOCAL_DESKTOP_ONLY',
            browserLocalFileUnsupported: 'LOCAL_UNSUPPORTED',
          },
        }),
      );

      await act(async () => {
        await result.current.submitAddress();
      });

      // 面板归属：真实入口进面板 tab，地址栏同步 token 地址，不碰裸地址。
      expect(browserNavigatePanelTab).toHaveBeenCalledWith(
        'http://127.0.0.1:3080/?token=tok123',
        undefined,
      );
      expect(setAddress).toHaveBeenCalledWith('http://127.0.0.1:3080/?token=tok123');
      expect(expectedNavigationUrlRef.current?.url).toBe('http://127.0.0.1:3080/?token=tok123');
    } finally {
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
  });

  it('裸 3080 后端失败时回退裸开（事项 2）', async () => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      browserHistory: [],
      isTauri: true,
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: { open: vi.fn(async () => ({ ok: false, error: { message: 'down' } })) },
    };
    try {
      const browserNavigatePanelTab = vi.fn();
      const { result } = renderHook(() =>
        useBrowserPanelAddressSubmit({
          address: 'http://127.0.0.1:3080',
          setAddress: vi.fn(),
          setSearchQueryDisplay: vi.fn(),
          browserLookupIndex: [],
          handleNavigationStart: vi.fn(),
          expectedNavigationUrlRef: { current: null },
          navigateBrowser: vi.fn(),
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

      expect(browserNavigatePanelTab).toHaveBeenCalledWith('http://127.0.0.1:3080', undefined);
    } finally {
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
  });

  describe('local file address', () => {
    function renderSubmit(address: string, isTauri: boolean) {
      const showToast = vi.fn();
      useAppStore.setState({ isTauri, showToast });
      const setAddress = vi.fn();
      const browserNavigatePanelTab = vi.fn();
      const handleNavigationStart = vi.fn();
      const submitVersionRef = { current: 0 };
      const { result } = renderHook(() =>
        useBrowserPanelAddressSubmit({
          address,
          setAddress,
          setSearchQueryDisplay: vi.fn(),
          browserLookupIndex: [],
          handleNavigationStart,
          expectedNavigationUrlRef: { current: null },
          navigateBrowser: vi.fn(),
          browserNavigatePanelTab,
          setIframeLoadError: vi.fn(),
          setIframeBlockedDetected: vi.fn(),
          handlePageMeta: vi.fn(),
          addressSubmittedForTabRef: { current: '' },
          submitVersionRef,
          validatedUrlsRef: { current: new Set<string>() },
          t: {
            dshPortFreed: 'FREED',
            browserLocalFileDesktopOnly: 'LOCAL_DESKTOP_ONLY',
            browserLocalFileUnsupported: 'LOCAL_UNSUPPORTED',
          },
        }),
      );
      return {
        result,
        setAddress,
        browserNavigatePanelTab,
        handleNavigationStart,
        showToast,
        submitVersionRef,
      };
    }

    it('browser mode only shows a desktop-only toast', async () => {
      const { result, browserNavigatePanelTab, showToast } = renderSubmit(
        'file:///D:/Desktop/a.html',
        false,
      );
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(showToast).toHaveBeenCalledWith('LOCAL_DESKTOP_ONLY', 'warning');
      expect(browserNavigatePanelTab).not.toHaveBeenCalled();
    });

    it('desktop opens a Windows drive path as an encoded file URL', async () => {
      const { result, setAddress, browserNavigatePanelTab, handleNavigationStart } = renderSubmit(
        'D:\\Desktop\\a b.html',
        true,
      );
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(setAddress).toHaveBeenCalledWith('file:///D:/Desktop/a%20b.html');
      expect(handleNavigationStart).toHaveBeenCalledWith('file:///D:/Desktop/a%20b.html');
      expect(browserNavigatePanelTab).toHaveBeenCalledWith(
        'file:///D:/Desktop/a%20b.html',
        undefined,
      );
    });

    it('desktop rejects non-viewable extensions', async () => {
      const { result, browserNavigatePanelTab, showToast } = renderSubmit(
        'D:\\Desktop\\setup.exe',
        true,
      );
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(showToast).toHaveBeenCalledWith('LOCAL_UNSUPPORTED', 'warning');
      expect(browserNavigatePanelTab).not.toHaveBeenCalled();
    });

    it('rebinds the expected navigation to the panel tab created by the submit', async () => {
      useAppStore.setState({ isTauri: true, browserActiveTabId: '' });
      const expectedNavigationUrlRef: {
        current: { url: string; at: number; tabId: string | null } | null;
      } = { current: null };
      const browserNavigatePanelTab = vi.fn(() => {
        useAppStore.setState({ browserActiveTabId: 'new-panel-tab' });
      });
      const { result } = renderHook(() =>
        useBrowserPanelAddressSubmit({
          address: 'D:\\Desktop\\a.html',
          setAddress: vi.fn(),
          setSearchQueryDisplay: vi.fn(),
          browserLookupIndex: [],
          handleNavigationStart: vi.fn(),
          expectedNavigationUrlRef,
          navigateBrowser: vi.fn(),
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
      expect(expectedNavigationUrlRef.current?.tabId).toBe('new-panel-tab');
    });

    it('advances the submit generation so in-flight submissions are invalidated', async () => {
      const { result, submitVersionRef } = renderSubmit('D:\\Desktop\\a.html', true);
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(submitVersionRef.current).toBe(1);
    });
  });
});
