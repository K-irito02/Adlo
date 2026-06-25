import { useCallback, useEffect } from 'react';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { PageMeta } from '../../../shared/ipc';
import { fetchPageMeta, setCachedFavicon } from '../../utils/fetchPageMeta';
import { useAppStore } from '../../stores';

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

function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
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
      console.info('[browser-debug] onUrlChanged fired:', url);

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.info('[browser-debug] onUrlChanged: non-http URL, ignoring');
        return;
      }

      const normalizedUrl = normalizeUrlForCompare(url);
      markUrlSeen(normalizedUrl);

      const state = useAppStore.getState();
      const activeTabId = state.browserActiveTabId;

      const existingTab = state.browserTabs.find(
        (t: BrowserTabState) => normalizeUrlForCompare(t.url) === normalizedUrl
      );

      if (!existingTab && !activeTabId) {
        console.info('[browser-debug] onUrlChanged: no existing tab, creating new tab');
        const hostname = new URL(url).hostname;
        state.browserOpenTab(normalizedUrl, hostname);
      }

      const expected = expectedNavigationUrlRef.current;
      if (expected && normalizeUrlForCompare(expected) !== normalizedUrl) {
        if (isProbablySameSite(expected, url)) {
          console.info('[browser-debug] same-site redirect, updating expected url');
          expectedNavigationUrlRef.current = url;
        } else {
          console.info(
            '[browser-debug] cross-site redirect, NOT blocking (allowing auto-redirect)'
          );
        }
      }

      setAddress(url);
      onNavigationStart?.(url);
    });

    return () => {
      unsubUrl();
    };
  }, [isProbablySameSite, markUrlSeen, setAddress, onNavigationStart, expectedNavigationUrlRef]);

  return {
    handleIframeLoad,
    handleIframeError,
  };
}
