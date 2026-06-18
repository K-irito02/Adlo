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
    if (!isTauriShell()) {
      return;
    }

    if (webViewDisabled) {
      return;
    }

    const url = activeTab?.url ?? 'about:blank';
    if (url === 'about:blank' || url.trim() === '') {
      return;
    }

    if (webViewActiveRef.current) {
      invoke('browser_navigate', { url }).catch(() => {});
      return;
    }

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
            updateWebViewBounds();
          });
        });
      })
      .catch(() => {
        creatingRef.current = false;
      });
  }, [activeTab?.id, activeTab?.url, updateWebViewBounds, webViewDisabled]);

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
      setAddress(url);
      browserNavigateActiveTab(url);
      invoke('browser_fetch_page_meta', { url })
        .then((result: unknown) => {
          const r = result as
            | { ok: boolean; data: { title: string; favicon: string; url: string } }
            | undefined;
          if (r?.ok && r.data && (r.data.title || r.data.favicon)) {
            onPageMeta?.(r.data);
          }
        })
        .catch(console.error);
    });

    return () => {
      unsubUrl();
    };
  }, [browserNavigateActiveTab, setAddress, onPageMeta]);

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
    navigateBrowser,
    updateWebViewBounds,
    handleIframeLoad,
    handleIframeError,
  };
}
