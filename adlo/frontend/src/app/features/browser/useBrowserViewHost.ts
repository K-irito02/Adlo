import { useCallback, useRef } from 'react';
import { useBrowserPool } from './useBrowserPool';
import { useWebViewBounds } from './useWebViewBounds';
import { useWebViewLifecycle } from './useWebViewLifecycle';
import { useWebViewVisibility } from './useWebViewVisibility';
import type { BrowserTabState } from '@stores/slices/browserSlice';

export type BrowserViewHostId = 'panel' | 'center';

/** Only the right panel animates its content container; keep the pre-expansion
 *  transform reset scoped to that host. */
const PANEL_CONTENT_SELECTOR = '.adl-rightpanel__content';

interface UseBrowserViewHostOptions {
  /** 宿主标识：区分面板 / 中心两宿主，per-host refs 由 hook 实例天然隔离。 */
  hostId: BrowserViewHostId;
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
}

/**
 * per-host WebView 视图驱动 Hook：一个宿主实例持有自己的活动 Tab / 隐藏 /
 * 可见性 refs，组合 bounds / lifecycle / visibility 三个子 Hook，并统一消费
 * Task 6 的共享 `browserPool`（两个宿主看到同一份池成员）。
 *
 * - `containerRef`：宿主 DOM 容器 ref
 * - `updateBounds`：手动重新同步原生 WebView 边界
 *
 * 卸载时（以及 `isVisible` 转 false 时）由 composition 内的 lifecycle unmount
 * cleanup / visibility effect 将本宿主活动 Tab 的 WebView 移出屏幕；面板宿主
 * 额外保留 `.adl-rightpanel__content` transform 重置。
 */
export function useBrowserViewHost(options: UseBrowserViewHostOptions) {
  const { hostId, activeTab, webViewDisabled = false, isVisible, overlayActive } = options;

  const {
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    removeFromPool,
    poolVersion,
  } = useBrowserPool();

  // Per-host shared refs across sub-hooks (render-phase mirror of props/state)
  const webViewActiveRef = useRef(false);
  const hideWebViewRequestedRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

  const { primaryRef, updateWebViewBounds, updateWebViewBoundsRef } = useWebViewBounds({
    webViewDisabled,
    isVisible,
    isTabInPool,
    activeTabRef,
    overlayActiveRef,
    webViewActiveRef,
    hideWebViewRequestedRef,
    contentSelector: hostId === 'panel' ? PANEL_CONTENT_SELECTOR : undefined,
  });

  // 创建前读取当前容器尺寸：WebView 在屏外先按这个尺寸加载，避免页面按默认
  // 800×600 布局、揭示后再 resize 造成的重排/闪烁（尤其重前端 SPA）。容器未
  // 挂载或尺寸为 0（折叠/展开动画中）时返回 undefined，由后端回落 800×600。
  const getInitialViewportSize = useCallback(() => {
    const el = primaryRef.current;
    if (!el) {
      return undefined;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }, [primaryRef]);

  const { loadingTabId } = useWebViewLifecycle({
    hostId,
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    getInitialViewportSize,
    activateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    updateWebViewBounds,
  });

  useWebViewVisibility({
    hostId,
    isVisible,
    overlayActive,
    isTabInPool,
    primaryRef,
    webViewActiveRef,
    hideWebViewRequestedRef,
    overlayActiveRef,
    activeTabRef,
    updateWebViewBounds,
    updateWebViewBoundsRef,
    activeTabId: activeTab?.id,
  });

  return {
    containerRef: primaryRef,
    updateBounds: updateWebViewBounds,
    webViewActiveRef,
    loadingTabId,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    removeFromPool,
    poolVersion,
  };
}
