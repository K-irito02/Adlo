import { useBrowserViewHost } from './useBrowserViewHost';
import { useBrowserSuspendScheduler } from './useBrowserSuspendScheduler';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
}

/**
 * 浏览器 WebView 编排 Hook：面板宿主的薄编排层。
 *
 * 视图驱动（bounds / lifecycle / visibility + 共享 browserPool）下沉到
 * `useBrowserViewHost({ hostId: 'panel' })`，本 Hook 保持既有返回签名与语义，
 * 额外挂载面板专属的挂起调度器（Task 8 将处理跨宿主 suspend + overlay）。
 */
export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const { activeTab, webViewDisabled = false, isVisible, overlayActive } = options;

  const {
    containerRef,
    updateBounds,
    webViewActiveRef,
    loadingTabId,
    markTabFresh,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    removeFromPool,
    poolVersion,
  } = useBrowserViewHost({
    hostId: 'panel',
    activeTab,
    webViewDisabled,
    isVisible,
    overlayActive,
  });

  useBrowserSuspendScheduler({
    isVisible,
    removeFromPool,
    isTabInPool,
    activeTabId: activeTab?.id ?? '',
    protectedActiveTabIds: new Set(activeTab ? [activeTab.id] : []),
  });

  return {
    webViewActiveRef,
    primaryRef: containerRef,
    removeFromPool,
    isTabInPool,
    updateWebViewBounds: updateBounds,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    loadingTabId,
    markTabFresh,
    poolVersion,
  };
}
