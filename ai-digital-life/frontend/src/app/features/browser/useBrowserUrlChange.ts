import { useCallback, useEffect, useRef } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';
import { useAppStore } from '@stores';
import { recordRedirect } from '@utils/siteMetaCache';
import {
  normalizeUrlForCompare,
  isProbablySameSite,
  extractSearchQueryFromUrl,
  isPoolTabEvent,
} from './browserUrlUtils';
import type { ExpectedNavigationRef } from './browserUrlUtils';
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

/**
 * 重定向检测的新鲜度窗口（ms）。`expectedNavigationUrlRef` 只在显式导航入口
 * （地址栏提交/书签历史树点击）设置，且导航完成后消费清空。窗口内到达的
 * `onUrlChanged` 若与期望 URL 跨域差异才判定为重定向；窗口外的陈旧期望
 * （如跨 tab 复用、用户链接跳转）一律忽略，避免"链接点击/后退/前进被误判
 * 为重定向而删除/改写真实历史条目"（Chrome/Edge 仅对导航发起即重定向判定）。
 */
const REDIRECT_DETECT_WINDOW_MS = 10_000;

/** 本地时区日期键（YYYY-MM-DD）：同日判定用（避免跨日时误合并/误抑制）。 */
function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface UseBrowserUrlChangeOptions {
  activeTab?: BrowserTabState;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: ExpectedNavigationRef;
  setAddress: (address: string) => void;
  setSearchQueryDisplay: (query: string) => void;
  /** 面板归属显式导航（只认面板标签；调用方不得传全局 action，见事项 6）。 */
  browserNavigatePanelTab: (url: string, title?: string) => void;
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
    setSearchQueryDisplay,
    browserNavigatePanelTab,
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
          browserNavigatePanelTab(href, iframeTitle || undefined);
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
          browserNavigatePanelTab(href);
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
          // iframe 的 document.title 是真实标题 → 标记已结算（M1-D/C1 自愈路径）
          browserUpdateTab(activeTab.id, { title: iframeTitle, titleResolved: true });
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
    browserNavigatePanelTab,
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

      // 只放行归属已知浏览器标签的池事件：Rust 实际发出的是 browser-xxx 形态的
      // 标签 id（WebView label 才带 adl-browser-view- 前缀），原前缀判断恒不命中，
      // 导致全部池导航事件被吞（粘贴网址无历史、跨域重定向/音频关联全链路断流，
      // 事项 13）。未知 tabId（DSH 独立子窗口等非池 WebView）仍丢弃，避免其导航
      // 在面板创建幻影标签/劫持活动标签（9c9199dc 原意保留）；无 tabId 走既有分支。
      if (!isPoolTabEvent(tabId, useAppStore.getState().browserTabs)) {
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
      // Chrome/Edge 语义：显式导航入口（书签/快捷站点/就地打开等预置 tab.url 的路径）
      // 导航完成时 urlChanged 为 false（tab 已在该 URL），但历史尚无该 URL 条目——
      // 仍应记录（首次导航补写）。历史已有条目（SPA 重复事件/重复打开）则不补。
      const missingHistoryEntry = eventTab
        ? !state.browserHistory.some((h) => historyDedupKey(h.url) === identityKey)
        : false;

      // [ADL-DEBUG] 事项13排查用：粘贴网址回车无历史。定案后删除本日志。
      console.debug(
        '[ADL-DEBUG] [browser::onUrlChanged] tabId=%s url=%s eventTab=%s urlChanged=%s missingHistory=%s',
        tabId ?? '',
        url,
        eventTab ? eventTab.id : '',
        urlChanged,
        missingHistoryEntry,
      );

      if (noTabExists || urlChanged || missingHistoryEntry) {
        if (noTabExists && pendingPrefetchRef.current.has(normalizedUrl)) {
          setAddress(normalizedUrl);
          return;
        }
        pendingPrefetchRef.current.add(normalizedUrl);

        // 立即更新标签 URL + 写入历史条目，使历史树可即时通过 URL 匹配音频状态
        const s = useAppStore.getState();

        // 只记录视频条目（Chrome/Edge 行为）：当前为"基础URL"（无 modal_id，
        // 只是 feed/scaffold 骨架）且同容器当日已存在具体视频条目时，判定为刷视频时
        // SPA 的 transient base 重发，不单独写历史、不改动标签 URL（保持当前
        // 视频上下文），避免基础URL反复置顶引发的重复标签/URL标题/跳位闪烁。
        // 同日限制：跨日后基础页的真实访问不再被抑制，正常记录。
        const today = getDayKey(Date.now());
        const suppressBase =
          !hasViewIdentityParam(url) &&
          s.browserHistory.some(
            (h) =>
              hasViewIdentityParam(h.url) &&
              getDayKey(h.visitedAt) === today &&
              historyContainerKey(h.url) === identityKey,
          );

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
          // 不清空标题：保留现有标题直到 handlePageMeta/tryPrefetch 到达真实标题，
          // 避免 URL 变化（如 Bing/DDG 重定向）时标题短暂空白闪烁。
          s.browserUpdateTab(tabId, { url });
          if (existingEntry) {
            s.browserAddToHistory(url, existingEntry.title);
            s.browserUpdateHistoryTitle(url, existingEntry.title);
          } else {
            s.browserAddToHistory(url, url);
          }
        } else if (existingEntry) {
          s.browserNavigateActiveTab(normalizedUrl);
        } else {
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
          pageMetaClient
            .get(normalizedUrl)
            .then((meta) => {
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
            })
            .catch(() => {
              // prefetch 失败静默处理，由 fallback 超时机制接管
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
            // 兜底标题（URL 占位）也标记已结算：标题"已确定"为 URL，不显示扫光（M1-D）
            if (!tabUrlMatches) {
              s.browserUpdateTab(tabId, {
                url: normalizedUrl,
                title: normalizedUrl,
                titleResolved: true,
              });
            } else if (!curTab.title) {
              s.browserUpdateTab(curTab.id, { title: normalizedUrl, titleResolved: true });
            }
          } else {
            s.browserNavigateActiveTab(normalizedUrl);
          }
          fallbackTimeoutsRef.current.delete(normalizedUrl);
        }, fallbackDelay);
        fallbackTimeoutsRef.current.set(normalizedUrl, timerId);
      }

      const expected = expectedNavigationUrlRef.current;
      if (
        expected &&
        // 事件 tab 与发起导航的 tab 匹配，或为"新建 tab"场景（tabId 为 null）。
        // 非发起 tab 的 URL 变化（后台 tab 的 onUrlChanged）不消费期望，等待
        // 发起 tab 自己的事件到来再处理，避免后台事件误吞期望导致多 tab 漏检。
        (expected.tabId === null || expected.tabId === tabId)
      ) {
        // 发起 tab（或新建 tab）的事件：消费期望（只用一次），随后判定是否重定向。
        // 立即清空，避免陈旧期望污染后续链接点击/后退/前进的 URL 变化。
        expectedNavigationUrlRef.current = null;
        if (
          Date.now() - expected.at <= REDIRECT_DETECT_WINDOW_MS &&
          normalizeUrlForCompare(expected.url) !== normalizedUrl &&
          !isProbablySameSite(expected.url, url)
        ) {
          // 跨域重定向（如 search.marginalia.nu → marginalia-search.com）：
          // 参考 Chrome/Edge 导航消化重定向链 ——
          // 1) 记录重定向映射（方案 B），使 favicon/标题查找能落到最终 origin；
          // 2) 回写历史条目 URL 为最终 URL（方案 A），历史树直接命中缓存。
          // 同站重定向（HTTP→HTTPS、www→非 www 等）不需要记录：同 origin canonical
          // 查找已覆盖，且重设期望会引入"链接点击被误判"的二次误报面。
          recordRedirect(expected.url, url);
          const s = useAppStore.getState();
          s.browserUpdateHistoryUrl(expected.url, url);
        }
      }

      setAddress(normalizedUrl);

      // 从搜索结果 URL 中提取查询文本显示在地址栏
      const engines = useAppStore.getState().searchEngines;
      const query = normalizedUrl ? extractSearchQueryFromUrl(normalizedUrl, engines) : '';
      setSearchQueryDisplay(query);

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
  }, [
    markUrlSeen,
    setAddress,
    onNavigationStart,
    onPageMeta,
    expectedNavigationUrlRef,
    setSearchQueryDisplay,
  ]);

  return {
    handleIframeLoad,
    handleIframeError,
  };
}
