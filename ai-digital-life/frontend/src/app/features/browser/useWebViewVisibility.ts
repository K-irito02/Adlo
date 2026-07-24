import { useCallback, useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';

/**
 * Offscreen coordinate used to hide a WebView by moving it far outside the
 * viewport. `32767` is `Int16.MAX_VALUE` — WebView2 treats this as "way
 * offscreen" without unloading the page (preserves SPA state).
 */
const HIDDEN_WEBVIEW_OFFSCREEN_COORD = 32767;

interface UseWebViewVisibilityOptions {
  isVisible: boolean;
  overlayActive: boolean;
  isTabInPool: (tabId: string) => boolean;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  webViewActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
  activeTabRef: React.RefObject<BrowserTabState | undefined>;
  updateWebViewBounds: () => void;
  updateWebViewBoundsRef: React.RefObject<() => void>;
}

/**
 * WebView 可见性 Hook：负责 overlay 检测与可见性驱动的隐藏/恢复。
 *
 * 职责：
 * - hideAllWebViews：将活动 Tab 的 WebView 移出屏幕（用于 overlay 隐藏）
 * - DOM overlay 检测：MutationObserver 监听菜单元素与 WebView 的重叠
 * - overlay 状态驱动隐藏：overlayActive 变化时隐藏/恢复 WebView
 * - 可见性变化：isVisible 变化时隐藏（移至 32767 屏外）或恢复边界
 */
export function useWebViewVisibility(options: UseWebViewVisibilityOptions) {
  const {
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
  } = options;

  const hideAllWebViews = useCallback(() => {
    if (!isTauriShell()) {
      return;
    }
    const tab = activeTabRef.current;
    if (tab && isTabInPool(tab.id)) {
      window.digitalLife?.browser
        ?.setTabBounds(tab.id, {
          x: -10000,
          y: -10000,
          width: 1,
          height: 1,
        })
        .catch((err) => {
          console.warn('webview overlay hide set bounds failed', err);
        });
    }
  }, [isTabInPool, activeTabRef]);

  // DOM overlay detection with overlap check — only hide webview when menu
  // elements (context menus, tree dropdowns portaled to body) actually
  // intersect the webview area
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }

    const OVERLAY_SELECTOR = '.adl-sidebar-menu, .adl-multitree-entry__menu, .adl-menu__dropdown';
    let rafId: number | null = null;

    const checkDomOverlay = () => {
      const overlays = document.querySelectorAll(OVERLAY_SELECTOR);
      const primaryEl = primaryRef.current;

      let hasOverlap = false;
      if (primaryEl && overlays.length > 0) {
        const webviewRect = primaryEl.getBoundingClientRect();

        for (const el of overlays) {
          const menuRect = el.getBoundingClientRect();
          const overlaps =
            menuRect.left < webviewRect.right &&
            menuRect.right > webviewRect.left &&
            menuRect.top < webviewRect.bottom &&
            menuRect.bottom > webviewRect.top;

          if (overlaps) {
            hasOverlap = true;
            break;
          }
        }
      } else if (overlays.length > 0) {
        hasOverlap = true;
      }

      if (hasOverlap === hideWebViewRequestedRef.current) {
        return;
      }

      hideWebViewRequestedRef.current = hasOverlap;
      if (!webViewActiveRef.current) {
        return;
      }

      if (hasOverlap) {
        hideAllWebViews();
      } else if (!overlayActiveRef.current) {
        updateWebViewBoundsRef.current();
      }
    };

    const scheduleCheck = () => {
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        checkDomOverlay();
      });
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, { childList: true, subtree: true });
    checkDomOverlay();

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    hideAllWebViews,
    hideWebViewRequestedRef,
    overlayActiveRef,
    primaryRef,
    updateWebViewBoundsRef,
    webViewActiveRef,
  ]);

  // Overlay state-driven hide
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) {
      return;
    }
    if (overlayActive) {
      hideAllWebViews();
    } else {
      updateWebViewBounds();
    }
  }, [overlayActive, hideAllWebViews, updateWebViewBounds, webViewActiveRef]);

  // Visibility change
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) {
      return;
    }
    if (isVisible && !hideWebViewRequestedRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => updateWebViewBounds());
      });
    } else if (!isVisible) {
      const tab = activeTabRef.current;
      if (tab && isTabInPool(tab.id)) {
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            width: 1,
            height: 1,
          })
          .catch((err) => {
            console.warn('webview visibility-change hide failed', err);
          });
      }
    }
  }, [
    isVisible,
    updateWebViewBounds,
    isTabInPool,
    activeTabRef,
    hideWebViewRequestedRef,
    webViewActiveRef,
  ]);
}
