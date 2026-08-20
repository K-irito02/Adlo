import { useCallback, useEffect, useRef } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';
import { useAppStore } from '@stores';
import { normalizeUrlForCompare, isProbablySameSite } from './browserUrlUtils';
import {
  historyDedupKey,
  hasViewIdentityParam,
  historyContainerKey,
} from '@utils/browserDisplayUtils';

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

      // 身份键：保留 modal_id 等"页面身份"参数（historyDedupKey 语义），用于历史写入门槛。
      // 刷视频（仅 modal_id 变化）时 normalizedUrl 剥离 modal_id 后恒相等，会误判为"未变化"
      // 而漏写历史；改用保留 modal_id 的身份键比较，每个视频识别为不同条目（Chrome/Edge 行为）。
      // display/meta 归一仍使用 normalizedUrl（剥离 modal_id）。
      const identityKey = historyDedupKey(url);
      const urlChanged = eventTab && historyDedupKey(eventTab.url) !== identityKey;
      const noTabExists = !eventTab;
      // DEBUG(问题2): onUrlChanged 事件入口——记录 URL 变化、身份键与标签匹配情况
      console.warn('[browser-url-change] onUrlChanged', {
        tabId,
        url,
        normalizedUrl,
        identityKey,
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

        // 只记录视频条目（Chrome/Edge 行为）：当前为"基础URL"（无 modal_id，
        // 只是 feed/scaffold 骨架）且同容器已存在具体视频条目时，判定为刷视频时
        // SPA 的 transient base 重发，不单独写历史、不改动标签 URL（保持当前
        // 视频上下文），避免基础URL反复置顶引发的重复标签/URL标题/跳位闪烁。
        const suppressBase =
          !hasViewIdentityParam(url) &&
          s.browserHistory.some(
            (h) => hasViewIdentityParam(h.url) && historyContainerKey(h.url) === identityKey,
          );
        // DEBUG(新现象): 记录 base scaffold 抑制判定
        console.warn('[browser-url-change] scaffold-suppression', {
          url,
          identityKey,
          containerKey: historyContainerKey(url),
          suppressBase,
        });

        if (suppressBase) {
          setAddress(normalizedUrl);
          onNavigationStart?.(normalizedUrl);
          return;
        }

        // 防止 SPA URL 规范化（如 YouTube 移除 tracking params、Bilibili 添加 vd_source）
        // 用 real-title 条目替换掉 placeholder。检查 same dedupKey 下是否已有真实标题。
        // dedupKey 使用保留 modal_id 的 identityKey：每个视频各自成条（Chrome/Edge 行为）。
        const dedupKey = identityKey;
        const existingEntry = s.browserHistory.find(
          (h) => historyDedupKey(h.url) === dedupKey && h.title !== h.url,
        );

        if (eventTab && tabId) {
          // Use the tabId from the event to update the correct tab,
          // not the currently active tab (which may differ if user
          // switched tabs before this event was processed).
          // 标签 URL 用原始 url（保留 modal_id），使声音/标题能精确关联到
          // 当前视频历史条目（buildHistoryLeafNode 以 t.url === entry.url 精确匹配）。
          s.browserUpdateTab(tabId, { url, title: '' });
          // DEBUG(问题2): 分支 eventTab——更新该标签 URL（不导航），身份用保留 modal_id 的 url 写历史
          console.warn('[browser-url-change] branch-eventTab', {
            tabId,
            displayUrl: normalizedUrl,
            historyUrl: url,
            dedupKey,
          });
          if (existingEntry) {
            s.browserAddToHistory(url, existingEntry.title);
            s.browserUpdateHistoryTitle(url, existingEntry.title);
          } else {
            s.browserAddToHistory(url, url);
          }
        } else if (existingEntry) {
          // DEBUG(问题2): 分支 existingEntry——导航激活标签并回填历史标题
          console.warn('[browser-url-change] branch-existingEntry', {
            displayUrl: normalizedUrl,
            historyUrl: url,
          });
          s.browserNavigateActiveTab(normalizedUrl);
        } else {
          // DEBUG(问题2): 分支 fallback——导航激活标签（无 tab 时）
          console.warn('[browser-url-change] branch-fallback-navigate', {
            displayUrl: normalizedUrl,
            historyUrl: url,
          });
          s.browserAddToHistory(url, url);
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
                // 传递原始 url（保留 modal_id）：使 handlePageMeta 的 cleanUrl 与标签
                // URL 精确匹配（exact 分支），从而只更新标题、不把标签 URL 覆盖回
                // base，维持声音/标题对当前视频条目的精确关联。
                url,
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
