import { useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { getResolvedTheme } from './useBrowserThemeSync';
import { normalizeUrlForCompare } from './browserUrlUtils';

interface UseWebViewLifecycleOptions {
  activeTab?: BrowserTabState;
  webViewDisabled: boolean;
  isTabInPool: (tabId: string) => boolean;
  createWebViewForTab: (
    tabId: string,
    url: string,
    colorScheme?: 'light' | 'dark',
  ) => Promise<string | null>;
  activateTabInPool: (tabId: string) => Promise<void>;
  navigateTabInPool: (tabId: string, url: string) => Promise<void>;
  webViewActiveRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
  updateWebViewBounds: () => void;
  /**
   * Set of URLs recorded by `useBrowserUrlChange` when `onUrlChanged` fires,
   * indicating the WebView already navigated on its own. When the tab's URL
   * is found in this Set, `useWebViewLifecycle` skips `navigateTabInPool`
   * to avoid a redundant double-navigation (e.g. YouTube's `?themeRefresh=1`
   * or Bilibili's server redirects).
   */
  webViewSelfNavigatedRef: React.RefObject<Set<string>>;
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
    navigateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    hideWebViewRequestedRef,
    updateWebViewBounds,
    webViewSelfNavigatedRef,
  } = options;

  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);
  const prevActiveTabIdRef = useRef<string | null>(null);
  /** Tracks the URL each tab's WebView is currently showing, so we can detect
   *  same-tab URL changes (e.g. "current tab" mode navigation) and call
   *  `navigateTab` instead of just `activateTab`. */
  const tabUrlMapRef = useRef<Map<string, string>>(new Map());

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
          .catch((e) => {
            console.warn('[useWebViewLifecycle] failed to hide previous tab WebView:', e);
          });
      }
    }
    prevActiveTabIdRef.current = tab?.id ?? null;

    if (!tab || !tab.url || tab.url === 'about:blank' || tab.url.trim() === '') {
      webViewActiveRef.current = false;
      // Hide the current tab's WebView so stale content doesn't remain
      // visible when the tab transitions to about:blank (e.g. "+" button
      // in "current tab" mode).
      if (tab?.id && isTabInPool(tab.id)) {
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: -10000,
            y: -10000,
            width: 1,
            height: 1,
          })
          .catch((e) => {
            console.warn('[useWebViewLifecycle] failed to hide about:blank WebView:', e);
          });
      }
      if (tab?.id) {
        tabUrlMapRef.current.set(tab.id, tab.url);
      }
      return;
    }

    const activateOrCreate = async () => {
      const currentTabId = tab.id;
      const prevUrl = tabUrlMapRef.current.get(currentTabId);
      const urlChanged = prevUrl !== undefined && prevUrl !== tab.url;
      try {
        if (!isTabInPool(currentTabId)) {
          // Real WebView creation: show loading.
          setLoadingTabId(currentTabId);
          await createWebViewForTab(currentTabId, tab.url, getResolvedTheme());
        } else if (urlChanged) {
          // WebView already exists: if the URL changed since last activation
          // (e.g. "current tab" mode navigation), navigate to the new URL.
          // Check if this URL was recorded by useBrowserUrlChange (via
          // onUrlChanged). If so, the WebView already navigated on its
          // own (SPA pushState, GoBack/GoForward, redirects) — skip
          // navigateTabInPool to avoid a redundant double-navigation AND
          // skip the loading overlay, which would otherwise flash as an
          // unwanted "auto refresh" right after a successful back/forward.
          const selfNav = webViewSelfNavigatedRef.current;
          const selfNavigated = selfNav.has(normalizeUrlForCompare(tab.url));
          // DEBUG(问题2): URL 变化后 lifecycle 的导航决策——是否命中 selfNav（命中=不重载）
          console.warn('[webview-lifecycle] urlChanged-decision', {
            tabId: currentTabId,
            tabUrl: tab.url,
            prevUrl,
            inSelfNavSet: selfNavigated,
            setSize: selfNav.size,
            action: selfNavigated ? 'skip-navigate-selfNav' : 'NAVIGATE-TAB',
          });
          if (!selfNavigated) {
            setLoadingTabId(currentTabId);
            // DEBUG(问题2): 触发 navigateTabInPool（重载点）——记录 URL
            console.warn('[webview-lifecycle] NAVIGATE-triggered', {
              tabId: currentTabId,
              tabUrl: tab.url,
              prevUrl,
              stack: new Error().stack,
            });
            await navigateTabInPool(currentTabId, tab.url);
          }
          selfNav.delete(normalizeUrlForCompare(tab.url));
        }
        await activateTabInPool(currentTabId);
        webViewActiveRef.current = true;
        tabUrlMapRef.current.set(currentTabId, tab.url);
        // Don't reset hide guard or reposition WebView if an overlay is
        // currently active — doing so would undo the overlay-detection
        // mechanism and cause a hide↔show ping-pong cycle (observed as
        // flickering when the tab change effect re-fires due to a store
        // update while a menu/dialog is open).
        if (!hideWebViewRequestedRef.current && !overlayActiveRef.current) {
          // Clear loadingTabId AFTER updateWebViewBounds runs, so the
          // loading overlay stays visible until the WebView is correctly
          // positioned. Clearing too early (e.g. in a finally block)
          // causes the overlay to disappear before the WebView is moved
          // on-screen, producing a brief flash of stale content.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              updateWebViewBounds();
              setLoadingTabId(null);
            });
          });
        } else {
          setLoadingTabId(null);
        }
      } catch (e) {
        setLoadingTabId(null);
        throw e;
      }
    };

    activateOrCreate().catch((e) => {
      console.warn('[useWebViewLifecycle] activateOrCreate failed:', e);
    });
  }, [
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    updateWebViewBounds,
    hideWebViewRequestedRef,
    overlayActiveRef,
    webViewActiveRef,
    webViewSelfNavigatedRef,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webViewActiveRef.current = false;
    };
  }, [webViewActiveRef]);

  return { loadingTabId };
}
