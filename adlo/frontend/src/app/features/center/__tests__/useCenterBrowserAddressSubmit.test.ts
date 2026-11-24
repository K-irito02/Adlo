import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCenterBrowserAddressSubmit } from '../useCenterBrowserAddressSubmit';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';

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

describe('useCenterBrowserAddressSubmit 需认证本地端口分流（事项 2）', () => {
  beforeEach(() => {
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      isTauri: true,
    });
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  });

  it('裸 3080 就地导航当前中心标签到后端真实入口', async () => {
    const tab = makeCenterTab('center-1', 'about:blank');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { 'center-1': tab },
      isTauri: true,
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=center1', freedPort: false },
        })),
      },
    };
    const navigateTabInPool = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useCenterBrowserAddressSubmit({
        browserTabId: 'center-1',
        address: 'http://127.0.0.1:3080',
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserLookupIndex: [],
        navigateBrowser: vi.fn(),
        navigateTabInPool,
        isTabInPool: () => true,
        setIframeLoadError: vi.fn(),
        setIframeBlockedDetected: vi.fn(),
        validatedUrlsRef: { current: new Set<string>() },
        t: {
          dshRecovering: 'RECOVERING',
          dshStarting: 'STARTING',
          browserLocalFileDesktopOnly: 'LOCAL_DESKTOP_ONLY',
          browserLocalFileUnsupported: 'LOCAL_UNSUPPORTED',
        },
      }),
    );

    await act(async () => {
      await result.current.submitAddress();
    });

    expect(navigateTabInPool).toHaveBeenCalledWith(
      'center-1',
      'http://127.0.0.1:3080/?token=center1',
    );
    expect(useAppStore.getState().browserTabsById['center-1'].url).toBe(
      'http://127.0.0.1:3080/?token=center1',
    );
  });

  it('非分发表 URL 不碰后端桥，原样导航', async () => {
    const tab = makeCenterTab('center-1', 'about:blank');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { 'center-1': tab },
      isTauri: true,
    });
    const open = vi.fn(async () => ({
      ok: true,
      data: { url: 'http://127.0.0.1:3080/?token=nope', freedPort: false },
    }));
    (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };
    const navigateTabInPool = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useCenterBrowserAddressSubmit({
        browserTabId: 'center-1',
        address: 'https://example.com',
        setAddress: vi.fn(),
        setSearchQueryDisplay: vi.fn(),
        browserLookupIndex: [],
        navigateBrowser: vi.fn(),
        navigateTabInPool,
        isTabInPool: () => true,
        setIframeLoadError: vi.fn(),
        setIframeBlockedDetected: vi.fn(),
        validatedUrlsRef: { current: new Set<string>() },
      }),
    );

    await act(async () => {
      await result.current.submitAddress();
    });

    expect(open).not.toHaveBeenCalled();
    expect(navigateTabInPool).toHaveBeenCalledWith('center-1', 'https://example.com');
  });

  describe('local file address', () => {
    function renderSubmit(address: string, isTauri: boolean) {
      const showToast = vi.fn();
      useAppStore.setState({ isTauri, showToast });
      const setAddress = vi.fn();
      const navigateTabInPool = vi.fn(async () => {});
      const { result } = renderHook(() =>
        useCenterBrowserAddressSubmit({
          browserTabId: 'center-1',
          address,
          setAddress,
          setSearchQueryDisplay: vi.fn(),
          browserLookupIndex: [],
          navigateBrowser: vi.fn(),
          navigateTabInPool,
          isTabInPool: () => true,
          setIframeLoadError: vi.fn(),
          setIframeBlockedDetected: vi.fn(),
          validatedUrlsRef: { current: new Set<string>() },
          t: {
            dshRecovering: 'RECOVERING',
            dshStarting: 'STARTING',
            browserLocalFileDesktopOnly: 'LOCAL_DESKTOP_ONLY',
            browserLocalFileUnsupported: 'LOCAL_UNSUPPORTED',
          },
        }),
      );
      return { result, setAddress, navigateTabInPool, showToast };
    }

    it('browser mode only shows a desktop-only toast', async () => {
      const tab = makeCenterTab('center-1', 'about:blank');
      useAppStore.setState({
        browserTabs: [tab],
        browserTabsById: { 'center-1': tab },
        isTauri: false,
      });
      const { result, navigateTabInPool, showToast } = renderSubmit(
        'file:///D:/Desktop/a.html',
        false,
      );
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(showToast).toHaveBeenCalledWith('LOCAL_DESKTOP_ONLY', 'warning');
      expect(navigateTabInPool).not.toHaveBeenCalled();
    });

    it('desktop opens a Windows drive path as an encoded file URL', async () => {
      const tab = makeCenterTab('center-1', 'about:blank');
      useAppStore.setState({
        browserTabs: [tab],
        browserTabsById: { 'center-1': tab },
        isTauri: true,
      });
      const { result, setAddress, navigateTabInPool } = renderSubmit('D:\\Desktop\\a b.html', true);
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(setAddress).toHaveBeenCalledWith('file:///D:/Desktop/a%20b.html');
      expect(useAppStore.getState().browserTabsById['center-1'].url).toBe(
        'file:///D:/Desktop/a%20b.html',
      );
      expect(navigateTabInPool).toHaveBeenCalledWith('center-1', 'file:///D:/Desktop/a%20b.html');
    });

    it('desktop rejects non-viewable extensions', async () => {
      const tab = makeCenterTab('center-1', 'about:blank');
      useAppStore.setState({
        browserTabs: [tab],
        browserTabsById: { 'center-1': tab },
        isTauri: true,
      });
      const { result, navigateTabInPool, showToast } = renderSubmit('D:\\Desktop\\setup.exe', true);
      await act(async () => {
        await result.current.submitAddress();
      });
      expect(showToast).toHaveBeenCalledWith('LOCAL_UNSUPPORTED', 'warning');
      expect(navigateTabInPool).not.toHaveBeenCalled();
    });

    it('a later local-file submit invalidates an in-flight DSH submit', async () => {
      const tab = makeCenterTab('center-1', 'about:blank');
      useAppStore.setState({
        browserTabs: [tab],
        browserTabsById: { 'center-1': tab },
        isTauri: true,
      });
      let resolveOpen!: (value: unknown) => void;
      const open = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveOpen = resolve;
          }),
      );
      (window as unknown as { digitalLife: unknown }).digitalLife = { dsh: { open } };

      const setAddress = vi.fn();
      const navigateTabInPool = vi.fn(async () => {});
      const { result, rerender } = renderHook(
        ({ address }: { address: string }) =>
          useCenterBrowserAddressSubmit({
            browserTabId: 'center-1',
            address,
            setAddress,
            setSearchQueryDisplay: vi.fn(),
            browserLookupIndex: [],
            navigateBrowser: vi.fn(),
            navigateTabInPool,
            isTabInPool: () => true,
            setIframeLoadError: vi.fn(),
            setIframeBlockedDetected: vi.fn(),
            validatedUrlsRef: { current: new Set<string>() },
          }),
        { initialProps: { address: 'http://127.0.0.1:3080' } },
      );

      let pendingA: Promise<void> = Promise.resolve();
      act(() => {
        pendingA = result.current.submitAddress();
      });

      rerender({ address: 'D:\\Desktop\\a.html' });
      await act(async () => {
        await result.current.submitAddress();
      });

      resolveOpen({
        ok: true,
        data: { url: 'http://127.0.0.1:3080/?token=OLD', freedPort: false },
      });
      await act(async () => {
        await pendingA;
      });

      expect(setAddress).not.toHaveBeenCalledWith('http://127.0.0.1:3080/?token=OLD');
      expect(navigateTabInPool).not.toHaveBeenCalledWith(
        'center-1',
        'http://127.0.0.1:3080/?token=OLD',
      );
      expect(useAppStore.getState().browserTabsById['center-1'].url).toBe(
        'file:///D:/Desktop/a.html',
      );
    });
  });
});
