import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { PageMeta } from '../../../shared/ipc';
import { fetchPageMeta, setCachedFavicon } from '../../utils/fetchPageMeta';

interface UseBrowserUrlChangeOptions {
  activeTab?: BrowserTabState;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: React.MutableRefObject<string | null>;
  setAddress: (address: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserUpdateTab: (id: string, data: Partial<BrowserTabState>) => void;
  onPageMeta?: (meta: PageMeta) => void;
  onNavigationStart?: (url: string) => void;
  markUrlSeen: (url: string) => void;
  setIframeLoadError: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBrowserUrlChange(options: UseBrowserUrlChangeOptions) {
  const {
    activeTab,
    activeTabRef,
    iframeRef,
    expectedNavigationUrlRef,
    setAddress,
    browserNavigateActiveTab,
    browserUpdateTab,
    onPageMeta,
    onNavigationStart,
    markUrlSeen,
    setIframeLoadError,
  } = options;

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
        console.log('[ADL-DEBUG] handleIframeLoad: cross-origin, cannot read location');
        return;
      }

      if (!href || href === 'about:blank' || !activeTab) {
        console.log('[ADL-DEBUG] handleIframeLoad: early return', {
          href,
          hasActiveTab: !!activeTab,
        });
        return;
      }

      console.log('[ADL-DEBUG] handleIframeLoad fired', {
        href,
        activeTabUrl: activeTab.url,
        activeTabTitle: activeTab.title,
        urlChanged: href !== activeTab.url,
      });

      if (href !== activeTab.url) {
        setAddress(href);
        try {
          const doc = iframeWindow.document;
          const iframeTitle = doc?.title || '';
          let iframeFavicon = '';
          if (doc) {
            const iconLink = doc.querySelector(
              'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
            ) as HTMLLinkElement | null;
            iframeFavicon = iconLink?.href || '';
          }
          console.log('[ADL-DEBUG] handleIframeLoad: same-origin navigate', {
            href,
            docTitle: iframeTitle,
            docFavicon: iframeFavicon,
            hasActiveTab: !!activeTab,
          });
          browserNavigateActiveTab(href, iframeTitle || undefined);
          if (iframeTitle || iframeFavicon) {
            onPageMeta?.({
              title: iframeTitle || activeTab.title,
              favicon: iframeFavicon,
              url: href,
            });
          }
        } catch {
          /* cross-origin: navigate without title, fetch via proxy */
          console.log('[ADL-DEBUG] handleIframeLoad: cross-origin navigate, will fetchPageMeta', {
            href,
          });
          browserNavigateActiveTab(href);
          fetchPageMeta(href).then((meta) => {
            console.log('[ADL-DEBUG] fetchPageMeta result', { href, meta });
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
        return;
      }

      console.log('[ADL-DEBUG] handleIframeLoad: URL unchanged, refreshing meta', {
        href,
        activeTabTitle: activeTab.title,
      });
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
        console.log('[ADL-DEBUG] handleIframeLoad: same-origin meta refresh', {
          iframeTitle,
          iframeFavicon,
          titleChanged: iframeTitle && iframeTitle !== activeTab.title,
        });
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
        console.log('[ADL-DEBUG] handleIframeLoad: cross-origin meta refresh, fetching...', {
          href,
        });
        fetchPageMeta(href).then((meta) => {
          console.log('[ADL-DEBUG] fetchPageMeta result (meta refresh)', { href, meta });
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
  }, [
    activeTab,
    activeTabRef,
    iframeRef,
    browserNavigateActiveTab,
    browserUpdateTab,
    setAddress,
    onPageMeta,
    setIframeLoadError,
  ]);

  const handleIframeError = useCallback(() => {
    setIframeLoadError(true);
  }, [setIframeLoadError]);

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

      const expected = expectedNavigationUrlRef.current;
      if (expected && expected !== url) {
        if (isProbablySameSite(expected, url)) {
          expectedNavigationUrlRef.current = url;
        } else {
          return;
        }
      }

      setAddress(url);
      onNavigationStart?.(url);
      invoke('browser_fetch_page_meta', { url })
        .then((result: unknown) => {
          const r = result as
            | { ok: boolean; data: { title: string; favicon: string; url: string } }
            | undefined;
          if (r?.ok && r.data && (r.data.title || r.data.favicon)) {
            onPageMeta?.(r.data);
          }
        })
        .catch(() => {
          // silently ignore fetch failures
        });
    });

    return () => {
      unsubUrl();
    };
  }, [
    isProbablySameSite,
    markUrlSeen,
    setAddress,
    onPageMeta,
    onNavigationStart,
    expectedNavigationUrlRef,
  ]);

  return {
    handleIframeLoad,
    handleIframeError,
  };
}
