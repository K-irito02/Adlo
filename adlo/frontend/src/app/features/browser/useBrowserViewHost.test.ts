import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { browserPool } from './browserPoolSingleton';
import { resetRevealGateForTest } from './browserRevealGate';
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
  onPageReady: ReturnType<typeof vi.fn>;
}

let pageReadyListener: ((tabId: string) => void) | null = null;

function setMockBrowser(): BrowserMock {
  const mock: BrowserMock = {
    createForTab: vi.fn().mockResolvedValue(null),
    activateTab: vi.fn().mockResolvedValue(undefined),
    navigateTab: vi.fn().mockResolvedValue(undefined),
    destroyTab: vi.fn().mockResolvedValue(undefined),
    setTabBounds: vi.fn().mockResolvedValue(undefined),
    onPageReady: vi.fn((cb: (tabId: string) => void) => {
      pageReadyListener = cb;
      return () => {};
    }),
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
    resetRevealGateForTest();
    vi.clearAllMocks();
    envState.tauri = false;
    pageReadyListener = null;
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
      'panel',
      [],
      false,
      undefined,
      undefined,
    );
    expect(browser.activateTab).toHaveBeenCalledWith('tab-1');

    // 首帧揭示门控：页面就绪前不应用边界（WebView2 保持屏外，加载动画可见）。
    expect(browser.setTabBounds).not.toHaveBeenCalled();

    // 模拟页面就绪（原生 page-ready 事件）→ 解除门控并按容器几何应用边界。
    act(() => {
      pageReadyListener?.('tab-1');
    });
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

  it('page-ready 缺失时，兜底定时器仍应用边界（F1 回归）', async () => {
    vi.useFakeTimers();
    try {
      envState.tauri = true;
      const browser = setMockBrowser();
      const tab = makeTab('tab-fb', 'https://example.com');

      const { result } = renderHook(() =>
        useBrowserViewHost({
          hostId: 'panel',
          activeTab: tab,
          isVisible: true,
          overlayActive: false,
        }),
      );
      result.current.containerRef.current = makeContainer(5, 6, 300, 200);

      // 排空 create/activate 的微任务；始终不触发 page-ready（模拟页面迟迟不就绪）。
      await act(async () => {
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve();
        }
      });
      expect(browser.createForTab).toHaveBeenCalled();
      expect(browser.setTabBounds).not.toHaveBeenCalled();

      // 推进兜底定时器 → 强制揭示（门控 deadline 与延时相同，必须走强制路径）。
      await act(async () => {
        vi.advanceTimersByTime(12_000);
      });
      expect(browser.setTabBounds).toHaveBeenCalledWith('tab-fb', {
        x: 5,
        y: 6,
        width: 300,
        height: 200,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
