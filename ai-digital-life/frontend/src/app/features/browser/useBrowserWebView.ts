import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';
import { useAppStore } from '../../stores/slicedStore';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
  setAddress: (address: string) => void;
}

export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const {
    activeTab,
    webViewDisabled = false,
    isVisible,
    overlayActive,
    setAddress: _setAddress,
  } = options;

  const [iframeLoadError, setIframeLoadError] = useState(false);
  const [iframeBlockedDetected, setIframeBlockedDetected] = useState(false);
  const [webViewActive, setWebViewActive] = useState(false);
  const [iframeHistory, setIframeHistory] = useState<{ index: number; entries: string[] }>({
    index: -1,
    entries: [],
  });

  const webViewActiveRef = useRef(false);
  const creatingRef = useRef(false);
  const recentNavigatedUrlsRef = useRef<Map<string, number>>(new Map());
  const webViewHiddenByEmptyUrlRef = useRef(false);
  const URL_SEEN_TTL = 3000; // ms — extended to cover slow page loads + meta fetch
  const PATH_MATCH_TTL = 2000; // ms — layer 3 hostname+pathname matching only matches entries within this window; prevents false-positive when query params genuinely differ (e.g. ?page=1 vs ?page=2)
  const expectedNavigationUrlRef = useRef<string | null>(null);
  const expectedNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewVisibleRef = useRef(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const domOverlayActiveRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const showLandingPage = useAppStore((state) => state.showLandingPage);

  // 通过 ref 同步，让 MutationObserver 回调可读取最新值，无需经过 React 渲染周期
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

  const hideWebView = useCallback(() => {
    invoke('browser_set_bounds', {
      bounds: { x: -10000, y: -10000, width: 1, height: 1 },
    }).catch(() => {});
  }, []);

  useEffect(() => {
    webViewVisibleRef.current = !webViewDisabled;
  }, [webViewDisabled]);

  const markUrlSeen = useCallback((url: string) => {
    recentNavigatedUrlsRef.current.set(url, Date.now());
  }, []);

  const isUrlRecentlySeen = useCallback((url: string): boolean => {
    const ts = recentNavigatedUrlsRef.current.get(url);
    if (ts !== undefined) {
      if (Date.now() - ts > URL_SEEN_TTL) {
        recentNavigatedUrlsRef.current.delete(url);
        return false;
      }
      return true;
    }
    // Layer 3: check by normalized hostname + pathname (ignoring query params/hash)
    // Handles SPA pushState removing tracking params (e.g. YouTube's &pp=oAcB).
    // Only matches entries within PATH_MATCH_TTL window to prevent false-positives
    // when query params genuinely differ (e.g. ?page=1 vs ?page=2).
    try {
      const newUrl = new URL(url);
      const newPath = (
        newUrl.pathname.length > 1 ? newUrl.pathname.replace(/\/+$/, '') : newUrl.pathname
      ).toLowerCase();
      const newKey = `${newUrl.hostname.toLowerCase()}${newPath}`;
      const now = Date.now();
      for (const [seenUrl, seenTs] of recentNavigatedUrlsRef.current.entries()) {
        if (now - seenTs > URL_SEEN_TTL) {
          recentNavigatedUrlsRef.current.delete(seenUrl);
          continue;
        }
        // Only match by hostname+pathname if the entry is recent enough
        if (now - seenTs > PATH_MATCH_TTL) {
          continue;
        }
        try {
          const seenParsed = new URL(seenUrl);
          const seenPath = (
            seenParsed.pathname.length > 1
              ? seenParsed.pathname.replace(/\/+$/, '')
              : seenParsed.pathname
          ).toLowerCase();
          const seenKey = `${seenParsed.hostname.toLowerCase()}${seenPath}`;
          if (seenKey === newKey) {
            return true;
          }
        } catch {
          /* skip unparseable seen URL */
        }
      }
    } catch {
      /* skip unparseable input URL */
    }
    return false;
  }, []);

  const setExpectedUrl = useCallback((url: string) => {
    expectedNavigationUrlRef.current = url;
    if (expectedNavigationTimerRef.current) {
      clearTimeout(expectedNavigationTimerRef.current);
    }
    expectedNavigationTimerRef.current = setTimeout(() => {
      if (expectedNavigationUrlRef.current === url) {
        expectedNavigationUrlRef.current = null;
      }
    }, 3000);
  }, []);

  const navigateTauriUrl = useCallback(
    (url: string) => {
      if (!isTauriShell()) {
        return;
      }
      if (url === 'about:blank' || url.trim() === '') {
        return;
      }
      if (webViewActiveRef.current && isUrlRecentlySeen(url)) {
        return;
      }
      webViewHiddenByEmptyUrlRef.current = false;
      setExpectedUrl(url);
      if (webViewActiveRef.current) {
        invoke('browser_navigate', { url }).catch(() => {});
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateWebViewBoundsRef.current();
          });
        });
      } else {
        if (creatingRef.current) {
          return;
        }
        creatingRef.current = true;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('browser_create 超时(10s)')), 10000)
        );
        Promise.race([invoke('browser_create', { url }), timeout])
          .then(() => {
            webViewActiveRef.current = true;
            creatingRef.current = false;
            setWebViewActive(true);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                updateWebViewBoundsRef.current();
              });
            });
          })
          .catch(() => {
            creatingRef.current = false;
          });
      }
    },
    [isUrlRecentlySeen, setExpectedUrl]
  );

  const forceReloadTauri = useCallback((url: string) => {
    if (!isTauriShell()) {
      return;
    }
    if (url === 'about:blank' || url.trim() === '') {
      return;
    }
    if (webViewActiveRef.current) {
      invoke('browser_navigate', { url }).catch(() => {});
    }
  }, []);

  const navigateBrowser = useCallback((url: string) => {
    if (isTauriShell()) {
      return;
    }
    if (iframeRef.current) {
      setIframeHistory((prev) => {
        const newEntries = prev.entries.slice(0, prev.index + 1);
        newEntries.push(url);
        if (newEntries.length > 50) {
          newEntries.shift();
        }
        return { index: newEntries.length - 1, entries: newEntries };
      });
      try {
        iframeRef.current.src = url;
      } catch {
        /* fail silently */
      }
    }
  }, []);

  const updateWebViewBounds = useCallback(() => {
    if (!primaryRef.current || !webViewActiveRef.current || !isTauriShell()) {
      return;
    }
    if (!webViewVisibleRef.current || webViewHiddenByEmptyUrlRef.current) {
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

    invoke('browser_set_bounds', { bounds }).catch(() => {});
  }, []);

  // 通过 ref 同步 updateWebViewBounds，让 MutationObserver 回调可直接调用
  const updateWebViewBoundsRef = useRef(updateWebViewBounds);
  useEffect(() => {
    updateWebViewBoundsRef.current = updateWebViewBounds;
  }, [updateWebViewBounds]);

  // 通过 MutationObserver 直接检测全屏范围内浮动菜单的增删，
  // 绕过 React 状态更新，消除延迟。
  // subtree: true 确保也能捕获内联渲染的菜单（如 LeftSidebar 的 SidebarContextMenu）
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const OVERLAY_SELECTOR = '.adl-sidebar-menu, .adl-multitree-entry__menu';
    let rafId: number | null = null;

    const checkDomOverlay = () => {
      const hasOverlay = document.querySelector(OVERLAY_SELECTOR) !== null;
      if (hasOverlay === domOverlayActiveRef.current) {
        return;
      }
      domOverlayActiveRef.current = hasOverlay;
      if (!webViewActiveRef.current) {
        return;
      }

      if (hasOverlay) {
        hideWebView();
      } else if (!overlayActiveRef.current) {
        // 仅在 state-based overlay 也未激活时才恢复 WebView
        updateWebViewBoundsRef.current();
      }
    };

    // 用 rAF 批量合并高频 DOM 变更，避免 subtree:true 时回调过多
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
  }, [hideWebView]);

  const isBrowserVisibleRef = useRef(isVisible);

  useEffect(() => {
    isBrowserVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    if (!webViewActiveRef.current) {
      return;
    }
    if (webViewDisabled) {
      invoke('browser_set_bounds', {
        bounds: { x: -10000, y: -10000, width: 1, height: 1 },
      }).catch(() => {});
    } else {
      updateWebViewBounds();
    }
  }, [webViewDisabled, updateWebViewBounds]);

  // 浏览器面板内部浮动元素（对话框/菜单）出现时，隐藏原生 WebView
  // 与 MutationObserver 协同：恢复时需确认 DOM 层也无浮动菜单
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) {
      return;
    }
    if (overlayActive || domOverlayActiveRef.current) {
      hideWebView();
    } else {
      updateWebViewBounds();
    }
  }, [overlayActive, updateWebViewBounds, hideWebView]);

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    if (!webViewActiveRef.current) {
      return;
    }

    if (isVisible) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateWebViewBounds();
        });
      });
    } else {
      invoke('browser_set_bounds', {
        bounds: { x: 32767, y: 32767, width: 1, height: 1 },
      }).catch(() => {});
    }
  }, [isVisible, updateWebViewBounds, webViewActive]);

  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) {
      return;
    }
    const url = activeTab?.url;
    if (showLandingPage || !url || url === 'about:blank' || url.trim() === '') {
      if (webViewActiveRef.current) {
        webViewHiddenByEmptyUrlRef.current = true;
        recentNavigatedUrlsRef.current.clear();
        hideWebView();
      }
      return;
    }
    webViewHiddenByEmptyUrlRef.current = false;
    navigateTauriUrl(url);
  }, [
    activeTab?.id,
    activeTab?.url,
    showLandingPage,
    webViewDisabled,
    navigateTauriUrl,
    hideWebView,
  ]);

  useEffect(() => {
    return () => {
      if (isTauriShell() && webViewActiveRef.current) {
        invoke('browser_destroy').catch(() => {});
        webViewActiveRef.current = false;
      }
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) {
      return;
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      if (webViewActiveRef.current && isBrowserVisibleRef.current) {
        updateWebViewBounds();
      }
    });

    resizeObserverRef.current.observe(primaryRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [updateWebViewBounds]);

  return {
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    webViewActive,
    iframeHistory,
    setIframeHistory,
    iframeRef,
    primaryRef,
    webViewActiveRef,
    creatingRef,
    resizeObserverRef,
    activeTabRef,
    expectedNavigationUrlRef,
    markUrlSeen,
    navigateTauriUrl,
    forceReloadTauri,
    navigateBrowser,
    updateWebViewBounds,
  };
}
