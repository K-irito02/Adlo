import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { browserPool } from './browserPoolSingleton';
import { HIDDEN_WEBVIEW_OFFSCREEN_COORD } from './useWebViewVisibility';
import { useBrowserViewHost } from './useBrowserViewHost';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const envState = vi.hoisted(() => ({ tauri: false }));

vi.mock('@shared/env', () => ({ isTauriShell: () => envState.tauri }));

interface BrowserMock {
  createForTab: ReturnType<typeof vi.fn>;
  activateTab: ReturnType<typeof vi.fn>;
  navigateTab: ReturnType<typeof vi.fn>;
  destroyTab: ReturnType<typeof vi.fn>;
  setTabBounds: ReturnType<typeof vi.fn>;
}

function setMockBrowser(): BrowserMock {
  const mock: BrowserMock = {
    createForTab: vi.fn().mockResolvedValue(null),
    activateTab: vi.fn().mockResolvedValue(undefined),
    navigateTab: vi.fn().mockResolvedValue(undefined),
    destroyTab: vi.fn().mockResolvedValue(undefined),
    setTabBounds: vi.fn().mockResolvedValue(undefined),
  };
  (window as unknown as Record<string, unknown>).digitalLife = { browser: mock };
  return mock;
}

function makeTab(id: string, url: string): BrowserTabState {
  return { id, url } as unknown as BrowserTabState;
}

function makeContainer(left: number, top: number, width: number, height: number): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

describe('useBrowserViewHost', () => {
  beforeEach(() => {
    browserPool.reset();
    vi.clearAllMocks();
    envState.tauri = false;
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('非 Tauri 下返回稳定 containerRef', async () => {
    const { useBrowserViewHost: useHost } = await import('./useBrowserViewHost');
    const { result } = renderHook(() =>
      useHost({
        hostId: 'center',
        activeTab: undefined,
        isVisible: true,
        overlayActive: false,
      }),
    );
    expect(result.current.containerRef).toBeDefined();
  });

  it('Tauri 下创建共享池成员、驱动 setTabBounds，卸载时隐藏', async () => {
    envState.tauri = true;
    const browser = setMockBrowser();
    const tab = makeTab('tab-1', 'https://example.com');

    const { result, unmount } = renderHook(() =>
      useBrowserViewHost({
        hostId: 'panel',
        activeTab: tab,
        isVisible: true,
        overlayActive: false,
      }),
    );

    // 提供真实容器几何，供 lifecycle 异步定位的 rAF 读取。
    result.current.containerRef.current = makeContainer(10, 20, 300, 200);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 共享池成员创建 + 激活（与 browserPoolSingleton 同一实例）。
    expect(browserPool.isTabInPool('tab-1')).toBe(true);
    expect(browser.createForTab).toHaveBeenCalledWith(
      'tab-1',
      'https://example.com',
      expect.any(String),
    );
    expect(browser.activateTab).toHaveBeenCalledWith('tab-1');

    // 按容器几何同步边界。
    expect(browser.setTabBounds).toHaveBeenCalledWith('tab-1', {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });

    unmount();

    // 卸载时把该宿主活动 Tab 的 WebView 移出屏幕。
    expect(browser.setTabBounds).toHaveBeenLastCalledWith('tab-1', {
      x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
      y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
      width: 1,
      height: 1,
    });
  });
});
