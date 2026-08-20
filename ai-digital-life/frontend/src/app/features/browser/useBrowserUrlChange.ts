import { useCallback, useEffect, useRef } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';
import { useAppStore } from '@stores';
import { normalizeUrlForCompare, isProbablySameSite } from './browserUrlUtils';
import { historyDedupKey } from '@utils/browserDisplayUtils';

/**
 * Fallback delay (ms) before treating a navigation as completed when no
 * `pageLoaded` event arrives. Shorter when no tab exists (no SPA routing
 * expected); longer when a tab exists (allow time for SPA transitions).
 */
const URL_CHANGE_FALLBACK_MS_NO_TAB = 8000;
const URL_CHANGE_FALLBACK_MS_WITH_TAB = 15000;

interface UseBrowserUrlChangeOptions {
  activeTab?: BrowserTabState;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: React.MutableRefObject<string | null>;
  setAddress: (address: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserUpdateTab: (id: string, data: Partial<BrowserTabState>) => void;
  onPageMeta?: (meta: PageMeta, source?: MetaSource) => void;
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
              'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
            ) as HTMLLinkElement | null;
            iframeFavicon = iconLink?.href || '';
          }
          browserNavigateActiveTab(href, iframeTitle || undefined);
          if (iframeTitle || iframeFavicon) {
            onPageMeta?.({
              title: iframeTitle || activeTab.title,
              favicon: iframeFavicon,
              faviconDataUri: '',
              url: href,
            });
          } else {
            const s = useAppStore.getState();
            s.browserAddToHistory(href, href);
          }
        } catch {
          /* cross-origin: navigate without title, fetch via proxy */
          browserNavigateActiveTab(href);
          pageMetaClient.get(href).then((meta) => {
            if (!meta) {
              const s = useAppStore.getState();
              s.browserAddToHistory(href, href);
              return;
            }
            const tab = activeTabRef.current;
            if (!tab) {
              return;
            }
            onPageMeta?.(
              {
                title: meta.title || tab.title,
                favicon: meta.favicon || '',
                faviconDataUri: (meta as { faviconDataUri?: string }).faviconDataUri || '',
                url: href,
                // 透传 get 返回的真实来源：否则 effectiveSource 回退调用方硬编码 'http'，
                // com 权威条目被冻结（R3 回归）。
                source: (meta as { source?: MetaSource }).source,
              },
              'http',
            );
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
            'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
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
            faviconDataUri: '',
            url: href,
          });
        }
      } catch {
        /* cross-origin: fetch via proxy */
        pageMetaClient.get(href).then((meta) => {
          if (!meta) {
            return;
          }
          const tab = activeTabRef.current;
          if (!tab) {
            return;
          }
          onPageMeta?.(
            {
              title: meta.title || tab.title,
              favicon: meta.favicon || '',
              faviconDataUri: (meta as { faviconDataUri?: string }).faviconDataUri || '',
              url: href,
              source: (meta as { source?: MetaSource }).source,
            },
            'http',
          );
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
    if (!useAppStore.getState().isTauri) {
      return;
    }

    const browser = window.digitalLife?.browser;
    if (!browser) {
      return;
    }

    const unsubUrl = browser.onUrlChanged((tabId, url) => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return;
      }

      const normalizedUrl = normalizeUrlForCompare(url);
      markUrlSeen(normalizedUrl);

      const state = useAppStore.getState();

      const eventTab = tabId
        ? state.browserTabs.find((t: BrowserTabState) => t.id === tabId)
        : undefined;

      const urlChanged = eventTab && normalizeUrlForCompare(eventTab.url) !== normalizedUrl;
      const noTabExists = !eventTab;
      // DEBUG(问题2): onUrlChanged 事件入口——记录 URL 变化与标签匹配情况
      console.warn('[browser-url-change] onUrlChanged', {
        tabId,
        url,
        normalizedUrl,
        urlChanged,
        noTabExists,
        pendingPrefetch: pendingPrefetchRef.current.has(normalizedUrl),
      });

      if (noTabExists || urlChanged) {
        if (noTabExists && pendingPrefetchRef.current.has(normalizedUrl)) {
          setAddress(normalizedUrl);
          return;
        }
        pendingPrefetchRef.current.add(normalizedUrl);

        // 立即更新标签 URL + 写入历史条目，使历史树可即时通过 URL 匹配音频状态
        const s = useAppStore.getState();

        // 防止 SPA URL 规范化（如 YouTube 移除 tracking params、Bilibili 添加 vd_source）
        // 用 real-title 条目替换掉 placeholder。检查 same dedupKey 下是否已有真实标题。
        const dedupKey = historyDedupKey(normalizedUrl);
        const existingEntry = s.browserHistory.find(
          (h) => historyDedupKey(h.url) === dedupKey && h.title !== h.url,
        );

        if (eventTab && tabId) {
          // Use the tabId from the event to update the correct tab,
          // not the currently active tab (which may differ if user
          // switched tabs before this event was processed).
          s.browserUpdateTab(tabId, { url: normalizedUrl, title: '' });
          // DEBUG(问题2): 分支 eventTab——更新该标签 URL（不导航）
          console.warn('[browser-url-change] branch-eventTab', { tabId, url: normalizedUrl });
          if (existingEntry) {
            s.browserAddToHistory(normalizedUrl, existingEntry.title);
            s.browserUpdateHistoryTitle(normalizedUrl, existingEntry.title);
          } else {
            s.browserAddToHistory(normalizedUrl, normalizedUrl);
          }
        } else if (existingEntry) {
          // DEBUG(问题2): 分支 existingEntry——导航激活标签并回填历史标题
          console.warn('[browser-url-change] branch-existingEntry', { url: normalizedUrl });
          s.browserNavigateActiveTab(normalizedUrl);
        } else {
          // DEBUG(问题2): 分支 fallback——导航激活标签（无 tab 时）
          console.warn('[browser-url-change] branch-fallback-navigate', { url: normalizedUrl });
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
        const PREFETCH_KEY = 'prefetch-' + normalizedUrl;

        const tryPrefetch = (): void => {
          pageMetaClient.get(normalizedUrl).then((meta) => {
            if (captureGeneration !== navigationGenerationRef.current) {
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
              // 失败重试由服务端 SWR/失败处理承担（Task 10 移除前端重试）
              return;
            }
            onPageMeta?.(
              {
                title: meta.title,
                favicon: meta.favicon || '',
                faviconDataUri: meta.faviconDataUri || '',
                url: normalizedUrl,
                // Tauri 模式导航主路径（onUrlChanged → prefetch → TTL 命中 get）：
                // 透传真实来源，否则 com 权威条目按 'http' 落地并冻结后续 com 更新（R3 回归）。
                source: (meta as { source?: MetaSource }).source,
              },
              'http',
            );
          });
        };

        tryPrefetch();

        const fallbackDelay = noTabExists
          ? URL_CHANGE_FALLBACK_MS_NO_TAB
          : URL_CHANGE_FALLBACK_MS_WITH_TAB;
        const timerId = setTimeout(() => {
          if (captureGeneration !== navigationGenerationRef.current) {
            fallbackTimeoutsRef.current.delete(normalizedUrl);
            return;
          }
          const s = useAppStore.getState();
          const curTab = tabId
            ? s.browserTabs.find((t: BrowserTabState) => t.id === tabId)
            : undefined;
          if (curTab) {
            const tabUrlMatches = normalizeUrlForCompare(curTab.url) === normalizedUrl;
            if (!tabUrlMatches) {
              s.browserUpdateTab(tabId, { url: normalizedUrl, title: normalizedUrl });
            } else if (!curTab.title) {
              s.browserUpdateTab(curTab.id, { title: normalizedUrl });
            }
          } else {
            s.browserNavigateActiveTab(normalizedUrl);
          }
          fallbackTimeoutsRef.current.delete(normalizedUrl);
        }, fallbackDelay);
        fallbackTimeoutsRef.current.set(normalizedUrl, timerId);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: read .current at cleanup time to clear all timers pending at unmount, not those captured at effect setup
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
  }, [markUrlSeen, setAddress, onNavigationStart, onPageMeta, expectedNavigationUrlRef]);

  return {
    handleIframeLoad,
    handleIframeError,
  };
}
