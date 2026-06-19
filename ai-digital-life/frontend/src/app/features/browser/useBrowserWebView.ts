import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { PageMeta } from '../../../shared/ipc';
import { fetchPageMeta, setCachedFavicon } from '../../utils/fetchPageMeta';

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  overlayActive: boolean;
  setAddress: (address: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserUpdateTab: (id: string, data: Partial<BrowserTabState>) => void;
  onPageMeta?: (meta: PageMeta) => void;
  onNavigationStart?: (url: string) => void;
}

export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const {
    activeTab,
    webViewDisabled = false,
    isVisible,
    overlayActive,
    setAddress,
    browserNavigateActiveTab,
    browserUpdateTab,
    onPageMeta,
    onNavigationStart,
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
  const expectedNavigationUrlRef = useRef<string | null>(null);
  const expectedNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewVisibleRef = useRef(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const domOverlayActiveRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // 通过 ref 同步，让 MutationObserver 回调可读取最新值，无需经过 React 渲染周期
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

  const hideWebView = useCallback(() => {
    invoke('browser_set_bounds', {
      bounds: { x: -10000, y: -10000, width: 1, height: 1 },
    }).catch(console.error);
  }, []);

  useEffect(() => {
    webViewVisibleRef.current = !webViewDisabled;
  }, [webViewDisabled]);

  const markUrlSeen = useCallback((url: string) => {
    recentNavigatedUrlsRef.current.set(url, Date.now());
  }, []);

  const isUrlRecentlySeen = useCallback((url: string): boolean => {
    const ts = recentNavigatedUrlsRef.current.get(url);
    if (ts === undefined) {
      return false;
    }
    // Allow re-navigation after 1000ms stale window
    if (Date.now() - ts > 1000) {
      recentNavigatedUrlsRef.current.delete(url);
      return false;
    }
    return true;
  }, []);

  const isProbablySameSite = useCallback((expected: string, actual: string): boolean => {
    try {
      const expectedHost = new URL(expected).hostname;
      const actualHost = new URL(actual).hostname;
      if (expectedHost === actualHost) {
        return true;
      }
      const expectedParts = expectedHost.split('.');
      const actualParts = actualHost.split('.');
      if (expectedParts.length >= 2 && actualParts.length >= 2) {
        const expectedRoot = expectedParts.slice(-2).join('.');
        const actualRoot = actualParts.slice(-2).join('.');
        if (expectedRoot === actualRoot) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
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
      setExpectedUrl(url);
      if (webViewActiveRef.current) {
        invoke('browser_navigate', { url }).catch(() => {});
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
    if (!webViewVisibleRef.current) {
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

  const handleIframeLoad = useCallback(() => {
    setIframeLoadError(false);
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) {
        return;
      }

      let href: string | undefined;
      try {
        href = iframeWindow.location.href;
      } catch {
        return;
      }

      if (!href || href === 'about:blank' || !activeTab) {
        return;
      }

      if (href !== activeTab.url) {
        setAddress(href);
        browserNavigateActiveTab(href);
        return;
      }

      try {
        const doc = iframeWindow.document;
        const iframeTitle = doc?.title;
        let iframeFavicon = '';
        if (doc) {
          const iconLink = doc.querySelector(
            'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
          ) as HTMLLinkElement | null;
          iframeFavicon = iconLink?.href || '';
        }
        if (iframeTitle && iframeTitle !== activeTab.title) {
          browserUpdateTab(activeTab.id, { title: iframeTitle });
        }
        if (iframeTitle || iframeFavicon) {
          onPageMeta?.({
            title: iframeTitle || activeTab.title,
            favicon: iframeFavicon,
            url: href,
          });
        }
      } catch {
        /* cross-origin: fetch via proxy */
        fetchPageMeta(href).then((meta) => {
          if (!meta) {
            return;
          }
          const tab = activeTabRef.current;
          if (tab) {
            if (meta.title && meta.title !== tab.title) {
              browserUpdateTab(tab.id, { title: meta.title });
            }
            if (meta.favicon) {
              setCachedFavicon(href, meta.favicon);
            }
          }
          if (meta.title) {
            onPageMeta?.({ title: meta.title, favicon: meta.favicon || '', url: href });
          }
        });
      }
    } catch {
      /* unexpected error in iframe load handling */
    }
  }, [activeTab, browserNavigateActiveTab, browserUpdateTab, setAddress, onPageMeta]);

  const handleIframeError = useCallback(() => {
    setIframeLoadError(true);
  }, [setIframeLoadError]);

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
      }).catch(console.error);
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
      }).catch(console.error);
    }
  }, [isVisible, updateWebViewBounds, webViewActive]);

  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) {
      return;
    }
    const url = activeTab?.url;
    if (!url || url === 'about:blank' || url.trim() === '') {
      return;
    }
    navigateTauriUrl(url);
  }, [activeTab?.id, activeTab?.url, webViewDisabled, navigateTauriUrl]);

  useEffect(() => {
    return () => {
      if (isTauriShell() && webViewActiveRef.current) {
        invoke('browser_destroy').catch(console.error);
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

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }

    const browser = window.digitalLife?.browser;
    if (!browser) {
      return;
    }

    const unsubUrl = browser.onUrlChanged((url) => {
      markUrlSeen(url);

      // Filter out iframe/subframe navigations: only process when
      // no expected URL is set, or the URL matches/shares same site with expected
      const expected = expectedNavigationUrlRef.current;
      if (expected && expected !== url) {
        if (isProbablySameSite(expected, url)) {
          // Same-site redirect — update expected and continue processing
          expectedNavigationUrlRef.current = url;
        } else {
          // Different site (iframe/internal) — skip processing
          return;
        }
      }

      setAddress(url);
      onNavigationStart?.(url);
      console.log('[browser] onUrlChanged:', url);
      invoke('browser_fetch_page_meta', { url })
        .then((result: unknown) => {
          const r = result as
            | { ok: boolean; data: { title: string; favicon: string; url: string } }
            | undefined;
          console.log('[browser] browser_fetch_page_meta response:', JSON.stringify(r));
          if (r?.ok && r.data && (r.data.title || r.data.favicon)) {
            console.log('[browser] calling onPageMeta with:', JSON.stringify(r.data));
            onPageMeta?.(r.data);
          } else {
            console.log('[browser] onPageMeta skipped - no title or favicon in response');
          }
        })
        .catch((err) => {
          console.error('[browser] browser_fetch_page_meta invoke failed:', err);
        });
    });

    return () => {
      unsubUrl();
    };
  }, [
    browserNavigateActiveTab,
    isProbablySameSite,
    markUrlSeen,
    setAddress,
    onPageMeta,
    onNavigationStart,
  ]);

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
    navigateTauriUrl,
    forceReloadTauri,
    navigateBrowser,
    updateWebViewBounds,
    handleIframeLoad,
    handleIframeError,
  };
}
