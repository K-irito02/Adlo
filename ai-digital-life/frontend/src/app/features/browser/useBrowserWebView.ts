import { useRef } from 'react';
import { useBrowserPool } from './useBrowserPool';
import { useBrowserSuspendScheduler } from './useBrowserSuspendScheduler';
import { useWebViewBounds } from './useWebViewBounds';
import { useWebViewLifecycle } from './useWebViewLifecycle';
import { useWebViewVisibility } from './useWebViewVisibility';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
}

/**
 * 浏览器 WebView 编排 Hook：组合 bounds / lifecycle / visibility 三个子 Hook，
 * 暴露统一 API 给 BrowserPanel 使用。
 *
 * 共享状态（跨子 Hook 读写的 refs）保留在编排层：
 * - webViewActiveRef：lifecycle 写入，visibility/bounds 读取
 * - hideWebViewRequestedRef：visibility 写入，lifecycle/bounds 读取
 * - activeTabRef / overlayActiveRef：props 的镜像，bounds/visibility 读取
 *
 * 编排顺序：bounds → lifecycle → visibility
 * - bounds 先行，产出 updateWebViewBounds 供 lifecycle 与 visibility 使用
 * - visibility 依赖 bounds 的 primaryRef 与 updateWebViewBounds(Ref)
 */
export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const { activeTab, webViewDisabled = false, isVisible, overlayActive } = options;

  const {
    poolSize: _poolSize,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    removeFromPool,
    poolVersion,
  } = useBrowserPool();

  // Shared refs across sub-hooks (render-phase mirror of props/state)
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
  });

  const { loadingTabId, markTabFresh } = useWebViewLifecycle({
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    hideWebViewRequestedRef,
    updateWebViewBounds,
  });

  useWebViewVisibility({
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
  });

  useBrowserSuspendScheduler({
    isVisible,
    removeFromPool,
    isTabInPool,
    activeTabId: activeTab?.id ?? '',
  });

  return {
    webViewActiveRef,
    primaryRef,
    removeFromPool,
    isTabInPool,
    updateWebViewBounds,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    loadingTabId,
    markTabFresh,
    poolVersion,
  };
}
