import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserTabState } from '../../stores/slices/browserSlice';

const log = (msg: string) => console.log(`[Browser] ${msg}`);

interface UseBrowserWebViewOptions {
  activeTab?: BrowserTabState;
  webViewDisabled?: boolean;
  isVisible: boolean;
  setAddress: (address: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserUpdateTab: (id: string, data: Partial<BrowserTabState>) => void;
}

export function useBrowserWebView(options: UseBrowserWebViewOptions) {
  const {
    activeTab,
    webViewDisabled = false,
    isVisible,
    setAddress,
    browserNavigateActiveTab,
    browserUpdateTab,
  } = options;

  const [iframeLoadError, setIframeLoadError] = useState(false);
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
      iframeRef.current.src = url;
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

    invoke('browser_set_bounds', { bounds }).catch((err) => {
      log(`set_bounds 失败: ${err}`);
    });
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIframeLoadError(false);
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow) {
        const href = iframeWindow.location.href;
        if (href && href !== 'about:blank' && activeTab && href !== activeTab.url) {
          setAddress(href);
          browserNavigateActiveTab(href);
        } else if (href && href !== 'about:blank' && activeTab) {
          try {
            const iframeTitle = iframeWindow.document?.title;
            if (iframeTitle && iframeTitle !== activeTab.title) {
              browserUpdateTab(activeTab.id, { title: iframeTitle });
            }
          } catch {
            /* cross-origin, can't read title */
          }
        }
      }
    } catch {
      /* cross-origin navigation, can't read URL */
    }
  }, [activeTab, browserNavigateActiveTab, browserUpdateTab, setAddress]);

  const handleIframeLoadRef = useRef(handleIframeLoad);

  useEffect(() => {
    handleIframeLoadRef.current = handleIframeLoad;
  }, [handleIframeLoad]);

  useEffect(() => {
    const node = iframeRef.current;
    if (!node) {
      return;
    }
    const handler = () => handleIframeLoadRef.current();
    node.addEventListener('load', handler);
    return () => node.removeEventListener('load', handler);
  }, [activeTab?.url]);

  const handleIframeError = useCallback(() => {
    setIframeLoadError(true);
  }, []);

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
      invoke('browser_navigate', { url }).catch((err) => {
        log(`navigate 失败: ${err}`);
      });
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
      .catch((err) => {
        creatingRef.current = false;
        log(`browser_create 失败: ${err}`);
        console.error('Failed to create browser WebView:', err);
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

    const unsubscribe = browser.onUrlChanged((url) => {
      setAddress(url);
      browserNavigateActiveTab(url);
    });

    return unsubscribe;
  }, [browserNavigateActiveTab, setAddress]);

  return {
    iframeLoadError,
    setIframeLoadError,
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
