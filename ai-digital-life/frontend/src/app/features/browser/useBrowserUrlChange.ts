import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { PageMeta } from '../../../shared/ipc';
import { fetchPageMeta, prefetchPageMeta, setCachedFavicon } from '../../utils/fetchPageMeta';
import { useAppStore } from '../../stores';
import { normalizeUrlForCompare, isProbablySameSite } from './browserUrlUtils';
import { historyDedupKey } from '../../utils/browserDisplayUtils';

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

  const fallbackTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const navigationGenerationRef = useRef(0);
  const pendingPrefetchRef = useRef<Set<string>>(new Set());

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
          browserNavigateActiveTab(href, iframeTitle || undefined);
          if (iframeTitle || iframeFavicon) {
            onPageMeta?.({
              title: iframeTitle || activeTab.title,
              favicon: iframeFavicon,
              url: href,
            });
          } else {
            const s = useAppStore.getState();
            s.browserAddToHistory(href, href);
          }
        } catch {
          /* cross-origin: navigate without title, fetch via proxy */
          browserNavigateActiveTab(href);
          fetchPageMeta(href).then((meta) => {
            if (!meta) {
              const s = useAppStore.getState();
              s.browserAddToHistory(href, href);
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
            } else {
              const s = useAppStore.getState();
              s.browserAddToHistory(href, href);
            }
          });
        }
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
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return;
      }

      const normalizedUrl = normalizeUrlForCompare(url);
      const _urlChangeTs = performance.now();
      markUrlSeen(normalizedUrl);

      const state = useAppStore.getState();

      const activeTabId = state.browserActiveTabId;
      const activeTab = activeTabId
        ? state.browserTabs.find((t: BrowserTabState) => t.id === activeTabId)
        : undefined;

      const urlChanged = activeTab && normalizeUrlForCompare(activeTab.url) !== normalizedUrl;
      const noTabExists = !activeTab && !activeTabId;

      console.log(
        '[ADL-DEBUG]',
        `urlChanged event: url=${url.substring(0, 80)} | urlChanged=${urlChanged} | noTabExists=${noTabExists} | activeTab?.url=${(activeTab?.url || '(none)').substring(0, 60)} | ts=${_urlChangeTs.toFixed(0)}`
      );

      if (noTabExists || urlChanged) {
        // Dedup: if noTabExists and prefetch already pending for this URL, skip
        if (noTabExists && pendingPrefetchRef.current.has(normalizedUrl)) {
          console.log(
            '[ADL-DEBUG]',
            `urlChanged SKIP: noTabExists + pending prefetch already exists for ${normalizedUrl.substring(0, 60)}`
          );
          setAddress(normalizedUrl);
          return;
        }
        pendingPrefetchRef.current.add(normalizedUrl);

        // 立即更新标签 URL + 写入历史条目，使历史树可即时通过 URL 匹配音频状态
        const s = useAppStore.getState();

        // 防止 SPA URL 规范化（如 YouTube 移除 tracking params、Bilibili 添加 vd_source）
        // 用 real-title 条目替换掉 placeholder。检查 same dedupKey 下是否已有真实标题。
        const dedupKey = historyDedupKey(normalizedUrl);
        const existingReal = s.browserHistory.find(
          (h) => historyDedupKey(h.url) === dedupKey && h.title !== h.url
        );

        if (existingReal) {
          console.log(
            '[ADL-DEBUG]',
            `urlChanged PROCESSING: SPA URL normalization (existing real title="${(existingReal.title || '').substring(0, 50)}"), updating tab only for ${normalizedUrl.substring(0, 60)}`
          );
          s.browserNavigateActiveTab(normalizedUrl);
        } else {
          console.log(
            '[ADL-DEBUG]',
            `urlChanged PROCESSING: adding placeholder history + navigateActiveTab for ${normalizedUrl.substring(0, 60)}`
          );
          s.browserAddToHistory(normalizedUrl, normalizedUrl);
          s.browserNavigateActiveTab(normalizedUrl);
        }

        // Cancel all pending fallback/prefetch timers for previous URLs
        for (const timer of fallbackTimeoutsRef.current.values()) {
          clearTimeout(timer);
        }
        fallbackTimeoutsRef.current.clear();
        pendingPrefetchRef.current.clear();

        // Increment generation so stale async prefetch callbacks discard themselves
        navigationGenerationRef.current++;
        const captureGeneration = navigationGenerationRef.current;

        // Defer tab URL+title update until real title arrives via prefetch or handlePageMeta.
        // This prevents flickering from old→new title transitions and ensures
        // correct title+icon are shown atomically.

        // Always fetch real page title via HTTP (same-site and cross-site).
        const MAX_RETRIES = 1;
        const RETRY_INTERVAL = 5000;
        const PREFETCH_KEY = 'prefetch-' + normalizedUrl;
        let retryCount = 0;

        const tryPrefetch = (): void => {
          prefetchPageMeta(normalizedUrl).then((meta) => {
            // Discard if a newer navigation superseded this generation
            if (captureGeneration !== navigationGenerationRef.current) {
              console.log(
                '[ADL-DEBUG]',
                `prefetch DISCARDED (generation changed): gen=${captureGeneration} current=${navigationGenerationRef.current} url=${normalizedUrl.substring(0, 60)}`
              );
              return;
            }

            const existingTimer = fallbackTimeoutsRef.current.get(PREFETCH_KEY);
            if (existingTimer) {
              clearTimeout(existingTimer);
              fallbackTimeoutsRef.current.delete(PREFETCH_KEY);
            }
            const existingFallback = fallbackTimeoutsRef.current.get(normalizedUrl);
            if (existingFallback) {
              clearTimeout(existingFallback);
              fallbackTimeoutsRef.current.delete(normalizedUrl);
            }
            if (!meta?.title) {
              retryCount++;
              if (retryCount < MAX_RETRIES) {
                console.log(
                  '[ADL-DEBUG]',
                  `prefetch retry #${retryCount}: url=${normalizedUrl.substring(0, 60)}`
                );
                const retryTimerId = setTimeout(tryPrefetch, RETRY_INTERVAL);
                fallbackTimeoutsRef.current.set(PREFETCH_KEY, retryTimerId);
              }
              return;
            }
            console.log(
              '[ADL-DEBUG]',
              `prefetch SUCCESS: title="${(meta.title || '').substring(0, 50)}" url=${normalizedUrl.substring(0, 60)}`
            );
            const s = useAppStore.getState();
            const activeTabId = s.browserActiveTabId;
            const tab = activeTabId
              ? s.browserTabs.find((t: BrowserTabState) => t.id === activeTabId)
              : undefined;

            if (tab) {
              // Atomically update URL + title — handles deferred URL case
              const needsUrlUpdate = normalizeUrlForCompare(tab.url) !== normalizedUrl;
              const needsTitleUpdate = tab.title !== meta.title;
              if (needsUrlUpdate || needsTitleUpdate) {
                s.browserUpdateTab(tab.id, {
                  ...(needsUrlUpdate ? { url: normalizedUrl } : {}),
                  ...(needsTitleUpdate ? { title: meta.title } : {}),
                });
              }
              if (meta.favicon) {
                setCachedFavicon(normalizedUrl, meta.favicon);
              }
              s.browserAddToHistory(normalizedUrl, meta.title);
              s.browserUpdateHistoryTitle(normalizedUrl, meta.title);
            } else {
              // No active tab — create one with URL + title
              if (meta.favicon) {
                setCachedFavicon(normalizedUrl, meta.favicon);
              }
              s.browserNavigateActiveTab(normalizedUrl, meta.title);
              s.browserAddToHistory(normalizedUrl, meta.title);
              s.browserUpdateHistoryTitle(normalizedUrl, meta.title);
            }
          });
        };

        tryPrefetch();

        // Fallback: navigate tab with URL as title if no real title arrives
        const fallbackDelay = noTabExists ? 8000 : 15000;
        console.log(
          '[ADL-DEBUG]',
          `fallback timer SET: delay=${fallbackDelay}ms url=${normalizedUrl.substring(0, 60)}`
        );
        const timerId = setTimeout(() => {
          const s = useAppStore.getState();
          const activeTabId = s.browserActiveTabId;
          const curTab = activeTabId
            ? s.browserTabs.find((t: BrowserTabState) => t.id === activeTabId)
            : undefined;
          console.log(
            '[ADL-DEBUG]',
            `fallback FIRED: url=${normalizedUrl.substring(0, 60)} curTab?.url=${(curTab?.url || '(none)').substring(0, 60)} curTab?.title="${(curTab?.title || '').substring(0, 50)}"`
          );
          if (curTab) {
            const tabUrlMatches = normalizeUrlForCompare(curTab.url) === normalizedUrl;
            if (!tabUrlMatches) {
              console.log(
                '[ADL-DEBUG]',
                `fallback: URL not applied, navigating with fallback title`
              );
              s.browserNavigateActiveTab(normalizedUrl, normalizedUrl);
            } else if (!curTab.title) {
              console.log('[ADL-DEBUG]', `fallback: title empty, setting to URL`);
              s.browserUpdateTab(curTab.id, { title: normalizedUrl });
            }
          } else {
            console.log('[ADL-DEBUG]', `fallback: no active tab, navigating`);
            s.browserNavigateActiveTab(normalizedUrl);
          }
          fallbackTimeoutsRef.current.delete(normalizedUrl);
        }, fallbackDelay);
        fallbackTimeoutsRef.current.set(normalizedUrl, timerId);
      }

      if (!noTabExists && !urlChanged) {
        console.log(
          '[ADL-DEBUG]',
          `urlChanged SKIP (url unchanged): url=${normalizedUrl.substring(0, 60)} activeTab.url=${(activeTab?.url || '(none)').substring(0, 60)}`
        );
      }

      const expected = expectedNavigationUrlRef.current;
      if (expected && normalizeUrlForCompare(expected) !== normalizedUrl) {
        if (isProbablySameSite(expected, url)) {
          expectedNavigationUrlRef.current = url;
        }
      }

      setAddress(normalizedUrl);
      onNavigationStart?.(normalizedUrl);
    });

    return () => {
      unsubUrl();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
  }, [markUrlSeen, setAddress, onNavigationStart, expectedNavigationUrlRef]);

  return {
    handleIframeLoad,
    handleIframeError,
  };
}
