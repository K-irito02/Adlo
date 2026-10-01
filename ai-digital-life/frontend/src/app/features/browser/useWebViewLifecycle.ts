import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { getResolvedTheme } from './useBrowserThemeSync';
import { HIDDEN_WEBVIEW_OFFSCREEN_COORD } from './useWebViewVisibility';
import { isDownloadUrl } from '@utils/downloadUrl';

interface UseWebViewLifecycleOptions {
  /** 宿主标识（panel / center）：仅用于诊断日志，refs 天然 per-hook-instance。 */
  hostId: 'panel' | 'center';
  activeTab?: BrowserTabState;
  webViewDisabled: boolean;
  isTabInPool: (tabId: string) => boolean;
  createWebViewForTab: (
    tabId: string,
    url: string,
    colorScheme?: 'light' | 'dark',
  ) => Promise<string | null>;
  activateTabInPool: (tabId: string) => Promise<void>;
  webViewActiveRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
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
    hostId,
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    updateWebViewBounds,
  } = options;

  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);
  const prevActiveTabIdRef = useRef<string | null>(null);
  /** 最新 activeTab 的镜像：供仅卸载时运行的 cleanup 读取，避免将 activeTab
   *  放入 cleanup effect 依赖而每次切换都触发隐藏。 */
  const activeTabSnapshotRef = useRef(activeTab);
  activeTabSnapshotRef.current = activeTab;
  /** Tracks the URL each tab's WebView is currently showing, so we can detect
   *  same-tab URL changes (e.g. "current tab" mode navigation) and call
   *  `navigateTab` instead of just `activateTab`. */
  const tabUrlMapRef = useRef<Map<string, string>>(new Map());
  /** Tabs created during the current session (not hydrated from restart).
   *  The isDownloadUrl check is skipped for these tabs so that download links
   *  clicked in-page (target="_blank") can open a new tab and trigger
   *  DownloadStarting normally. Only hydrated restart tabs are suppressed. */
  const freshTabIdsRef = useRef<Set<string>>(new Set());

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
    // Note: only check overlayActiveRef (React overlay state), NOT
    // hideWebViewRequestedRef (DOM overlay detection). DOM overlays are
    // handled by the visibility hook's MutationObserver; the lifecycle must
    // still run to create/activate/bounds-update the WebView.
    // Historical: hideWebViewRequestedRef was previously checked here to
    // prevent hide↔show ping-pong (flickering) — this is now avoided by
    // the MutationObserver-based approach in useWebViewVisibility.
    if (tab?.id != null && tab.id === prevActiveTabIdRef.current && overlayActiveRef.current) {
      return;
    }

    // Hide previous tab's WebView when switching away (including to an empty new tab)
    if (prevActiveTabIdRef.current && prevActiveTabIdRef.current !== tab?.id) {
      const prevId = prevActiveTabIdRef.current;
      if (isTabInPool(prevId)) {
        window.digitalLife?.browser
          ?.setTabBounds(prevId, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
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
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
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
      try {
        if (!isTabInPool(currentTabId)) {
          // Restart suppression: skip WebView creation for download URLs on
          // hydrated (restart) tabs. Tabs created during the current session
          // (e.g. from browser-open-new-tab for in-page download links) must
          // NOT be suppressed — they need a WebView to trigger DownloadStarting.
          const isFresh = freshTabIdsRef.current.has(currentTabId);
          if (isFresh) {
            freshTabIdsRef.current.delete(currentTabId);
          }
          if (!isFresh && isDownloadUrl(tab.url)) {
            console.debug(
              `[useWebViewLifecycle] skipping WebView creation for download URL (restart suppression): ${tab.url}`,
            );
            webViewActiveRef.current = false;
            return;
          }
          // Real WebView creation: show loading.
          setLoadingTabId(currentTabId);
          await createWebViewForTab(currentTabId, tab.url, getResolvedTheme());
        }
        await activateTabInPool(currentTabId);
        webViewActiveRef.current = true;
        tabUrlMapRef.current.set(currentTabId, tab.url);
        if (!overlayActiveRef.current) {
          // Clear loadingTabId AFTER updateWebViewBounds runs, so the
          // loading overlay stays visible until the WebView is correctly
          // positioned.
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
    updateWebViewBounds,
    overlayActiveRef,
    webViewActiveRef,
  ]);

  // Cleanup on unmount: clear active flag/fresh set AND hide the host's current
  // active tab WebView, so unmounting a host (e.g. switching center tabs or
  // closing the center host) never leaves a stale native surface behind.
  useEffect(() => {
    const freshTabIds = freshTabIdsRef.current;
    return () => {
      webViewActiveRef.current = false;
      freshTabIds.clear();
      const tab = activeTabSnapshotRef.current;
      if (isTauriShell() && tab?.id && isTabInPool(tab.id)) {
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            width: 1,
            height: 1,
          })
          .catch((e) => {
            console.warn(`[useWebViewLifecycle] failed to hide WebView on unmount (${hostId}):`, e);
          });
      }
    };
  }, [webViewActiveRef, isTabInPool, hostId]);

  /** Mark a tab as freshly created (current session, not restart-hydrated).
   *  Call this immediately after creating a new tab so the lifecycle hook
   *  knows to skip the restart download suppression for that tab. */
  const markTabFresh = useCallback((tabId: string) => {
    freshTabIdsRef.current.add(tabId);
  }, []);

  return { loadingTabId, markTabFresh };
}
