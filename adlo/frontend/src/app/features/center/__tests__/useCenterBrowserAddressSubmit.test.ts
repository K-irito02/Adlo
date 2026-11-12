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
          dshPortFreed: 'FREED',
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
});
