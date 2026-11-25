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
          data: { status: 'opened', url: 'http://127.0.0.1:3080/?token=center1' },
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
      data: { status: 'opened', url: 'http://127.0.0.1:3080/?token=nope' },
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

  it('DSH 解析被更新提交取代时仍收起恢复 toast', async () => {
    const tab = makeCenterTab('center-1', 'about:blank');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { 'center-1': tab },
      browserActiveTabId: 'center-1',
      isTauri: true,
      dshRecoveryToastId: 'dsh-toast',
      toasts: [{ id: 'dsh-toast', message: '正在自动恢复…', shimmer: true, duration: 0 }],
    });
    let resolveOpen: (value: unknown) => void = () => {};
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: {
        open: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveOpen = resolve;
            }),
        ),
      },
    };
    const baseProps = {
      browserTabId: 'center-1',
      setAddress: vi.fn(),
      setSearchQueryDisplay: vi.fn(),
      browserLookupIndex: [],
      navigateBrowser: vi.fn(),
      navigateTabInPool: vi.fn(async () => {}),
      isTabInPool: () => true,
      setIframeLoadError: vi.fn(),
      setIframeBlockedDetected: vi.fn(),
      validatedUrlsRef: { current: new Set<string>() },
    };
    try {
      const { result, rerender } = renderHook(
        (props: typeof baseProps & { address: string }) => useCenterBrowserAddressSubmit(props),
        { initialProps: { ...baseProps, address: 'http://127.0.0.1:3080' } },
      );

      const pending = result.current.submitAddress();
      await act(async () => {});
      // 后一次提交推进内部代际（改为非 DSH URL，不会自行收起 toast）。
      rerender({ ...baseProps, address: 'https://plain.example.com' });
      await act(async () => {
        await result.current.submitAddress();
      });
      await act(async () => {
        resolveOpen({
          ok: true,
          data: { status: 'opened', url: 'http://127.0.0.1:3080/?token=x' },
        });
        await pending;
      });

      expect(useAppStore.getState().dshRecoveryToastId).toBeNull();
      expect(useAppStore.getState().toasts).toHaveLength(0);
    } finally {
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
  });

  it('端口确认被取消时不裸开 3080 且不导航', async () => {
    const tab = makeCenterTab('center-1', 'about:blank');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { 'center-1': tab },
      browserActiveTabId: 'center-1',
      isTauri: true,
      dshPortConflict: null,
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: {
            status: 'port_occupied',
            url: null,
            occupant: {
              port: 3080,
              processes: [{ pid: 42, name: 'node.exe', cmdline: 'node x', isDsh: false }],
            },
          },
        })),
      },
    };
    const navigateTabInPool = vi.fn(async () => {});
    try {
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
        }),
      );

      const pending = result.current.submitAddress();
      await vi.waitFor(() => expect(useAppStore.getState().dshPortConflict).not.toBeNull());
      useAppStore.getState().resolveDshPortConflict(false);
      await act(async () => {
        await pending;
      });

      expect(navigateTabInPool).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    }
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
        data: { status: 'opened', url: 'http://127.0.0.1:3080/?token=OLD' },
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
