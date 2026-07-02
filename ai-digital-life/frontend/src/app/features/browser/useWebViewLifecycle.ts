import { useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@tauri-bridge';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface UseWebViewLifecycleOptions {
  activeTab?: BrowserTabState;
  webViewDisabled: boolean;
  isTabInPool: (tabId: string) => boolean;
  createWebViewForTab: (tabId: string, url: string) => Promise<string | null>;
  activateTabInPool: (tabId: string) => Promise<void>;
  webViewActiveRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
  updateWebViewBounds: () => void;
}

/**
 * WebView 生命周期 Hook：负责活动 Tab 变化时创建/激活 WebView。
 *
 * 职责：
 * - 活动 Tab 变化时，若 WebView 不在池中则创建，然后激活
 * - 切换离开旧 Tab 时将其 WebView 移出屏幕
 * - overlay 激活期间跳过激活以避免 undo 隐藏机制
 * - 卸载时清理 webViewActiveRef
 * - 持有 loadingTabId 状态与 prevActiveTabIdRef
 */
export function useWebViewLifecycle(options: UseWebViewLifecycleOptions) {
  const {
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    hideWebViewRequestedRef,
    updateWebViewBounds,
  } = options;

  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);
  const prevActiveTabIdRef = useRef<string | null>(null);

  // When active tab changes: create WebView if not in pool, then activate
  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) {
      return;
    }
    const tab = activeTab;

    // When the effect re-fires due to an activeTab object reference change
    // while the tab ID hasn't changed and an overlay is active, skip entirely.
    // Otherwise activateTabInPool would call webview.show() in Rust, undoing
    // the overlay-hide mechanism (setTabBounds off-screen).
    if (
      tab?.id != null &&
      tab.id === prevActiveTabIdRef.current &&
      (hideWebViewRequestedRef.current || overlayActiveRef.current)
    ) {
      return;
    }

    // Hide previous tab's WebView when switching away (including to an empty new tab)
    if (prevActiveTabIdRef.current && prevActiveTabIdRef.current !== tab?.id) {
      const prevId = prevActiveTabIdRef.current;
      if (isTabInPool(prevId)) {
        window.digitalLife?.browser
          ?.setTabBounds(prevId, {
            x: -10000,
            y: -10000,
            width: 1,
            height: 1,
          })
          .catch(() => {});
      }
    }
    prevActiveTabIdRef.current = tab?.id ?? null;

    if (!tab || !tab.url || tab.url === 'about:blank' || tab.url.trim() === '') {
      webViewActiveRef.current = false;
      return;
    }

    const activateOrCreate = async () => {
      const currentTabId = tab.id;
      setLoadingTabId(currentTabId);
      try {
        if (!isTabInPool(currentTabId)) {
          await createWebViewForTab(currentTabId, tab.url);
        }
        await activateTabInPool(currentTabId);
        webViewActiveRef.current = true;
        // Don't reset hide guard or reposition WebView if an overlay is
        // currently active — doing so would undo the overlay-detection
        // mechanism and cause a hide↔show ping-pong cycle (observed as
        // flickering when the tab change effect re-fires due to a store
        // update while a menu/dialog is open).
        if (!hideWebViewRequestedRef.current && !overlayActiveRef.current) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              updateWebViewBounds();
            });
          });
        }
      } finally {
        setLoadingTabId(null);
      }
    };

    activateOrCreate().catch(() => {});
  }, [
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    updateWebViewBounds,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webViewActiveRef.current = false;
    };
  }, []);

  return { loadingTabId };
}
