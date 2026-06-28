import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '../../../tauri-bridge';
import { useBrowserPool } from './useBrowserPool';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
}

export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const { activeTab, webViewDisabled = false, isVisible, overlayActive } = options;

  const {
    poolSize: _poolSize,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    removeFromPool,
    poolVersion,
  } = useBrowserPool();

  const primaryRef = useRef<HTMLDivElement | null>(null);
  const webViewActiveRef = useRef(false);
  const hideWebViewRequestedRef = useRef(false);
  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const prevActiveTabIdRef = useRef<string | null>(null);
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

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
        .catch(() => {});
    }
  }, [isTabInPool]);

  const updateWebViewBounds = useCallback(() => {
    if (!primaryRef.current || !isTauriShell()) {
      return;
    }
    const tab = activeTabRef.current;
    if (!tab || !isTabInPool(tab.id)) {
      return;
    }
    if (webViewDisabled) {
      return;
    }

    const rect = primaryRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    window.digitalLife?.browser?.setTabBounds(tab.id, bounds).catch(() => {});
  }, [isTabInPool, webViewDisabled]);

  const updateWebViewBoundsRef = useRef(updateWebViewBounds);
  useEffect(() => {
    updateWebViewBoundsRef.current = updateWebViewBounds;
  }, [updateWebViewBounds]);

  // When active tab changes: create WebView if not in pool, then activate
  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) {
      return;
    }
    const tab = activeTab;

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
        hideWebViewRequestedRef.current = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => updateWebViewBounds());
        });
      } finally {
        setLoadingTabId(null);
      }
    };

    activateOrCreate().catch(() => {});
  }, [
    activeTab?.id,
    activeTab?.url,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    updateWebViewBounds,
  ]);

  // DOM overlay detection with overlap check — only hide webview when menu
  // elements (context menus, tree dropdowns portaled to body) actually
  // intersect the webview area
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }

    const OVERLAY_SELECTOR = '.adl-sidebar-menu, .adl-multitree-entry__menu';
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
  }, [hideAllWebViews]);

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
  }, [overlayActive, hideAllWebViews, updateWebViewBounds]);

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
            x: 32767,
            y: 32767,
            width: 1,
            height: 1,
          })
          .catch(() => {});
      }
    }
  }, [isVisible, updateWebViewBounds, isTabInPool]);

  // ResizeObserver
  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (webViewActiveRef.current && isVisible && !hideWebViewRequestedRef.current) {
        updateWebViewBounds();
      }
    });
    observer.observe(primaryRef.current);

    return () => observer.disconnect();
  }, [updateWebViewBounds, isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webViewActiveRef.current = false;
    };
  }, []);

  return {
    webViewActiveRef,
    primaryRef,
    removeFromPool,
    isTabInPool,
    updateWebViewBounds,
    createWebViewForTab,
    activateTabInPool,
    loadingTabId,
    poolVersion,
  };
}
