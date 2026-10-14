import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { filterBrowserItems, mergeSearchResults } from './browserUrlUtils';
import { useTCopy } from '@i18n/useTCopy';

export type BrowserSearchScope = 'bookmarks' | 'history' | 'all';

export function findInBrowserLookupIndex(
  browserLookupIndex: { title: string; url: string }[],
  input: string,
): { title: string; url: string } | undefined {
  const normalizedInput = input.toLowerCase();
  const looksLikeUrl =
    /^(about:|[a-z]+:\/\/)/i.test(input) || // 协议前缀
    /^\d{1,3}(\.\d{1,3}){3}$/.test(input) || // IP 地址
    /^localhost(:\d+)?$/i.test(input) || // localhost（$ 锚定，避免 localhostxyz 误判）
    /\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(input) || // 点号 + TLD（含 host:port 如 foo.com:8080）
    /\/$/.test(input); // 以 / 结尾的路径

  // URL 精确匹配在任何输入上执行（Chrome/Edge omnibox：输入即完整 URL 时优先命中）
  const exactUrlMatch = browserLookupIndex.find(
    (item) => item.url.toLowerCase() === normalizedInput,
  );
  if (exactUrlMatch) {
    return exactUrlMatch;
  }

  // Chrome/Edge omnibox 行为：只在输入明确是 URL 格式时才在历史记录中查找匹配
  // 当输入是搜索词时（如"百度"），跳过历史记录匹配，直接触发搜索
  // 标题精确匹配同样受 URL 格式门控，避免"输入搜索词命中同名书签/历史"劫持搜索（M1-J）
  if (!looksLikeUrl) {
    return undefined;
  }
  const exactTitleMatch = browserLookupIndex.find(
    (item) => item.title.toLowerCase() === normalizedInput,
  );
  if (exactTitleMatch) {
    return exactTitleMatch;
  }
  return browserLookupIndex.find(
    (item) =>
      item.title.toLowerCase().includes(normalizedInput) ||
      item.url.toLowerCase().includes(normalizedInput),
  );
}

interface UseBrowserSearchOptions {
  browserBookmarks: { title: string; url: string }[];
  browserHistory: { title: string; url: string; visitedAt: number }[];
  browserTabs: BrowserTabState[];
}

export function useBrowserSearch(options: UseBrowserSearchOptions) {
  const { t } = useTCopy();
  const { browserBookmarks, browserHistory, browserTabs } = options;

  const [navigatorQuery, setNavigatorQuery] = useState('');
  // 检索范围上提 store（`adl:browser.searchScope`，Task 24）；检索词本体是瞬态草稿，不登记
  const searchScope = useAppStore((s) => s.browserSearchScope);
  const setSearchScope = useAppStore((s) => s.setBrowserSearchScope);

  const navigatorSearchRef = useRef<HTMLDivElement | null>(null);
  const navigatorSearchInputRef = useRef<HTMLInputElement | null>(null);

  const quickLinks = useMemo(
    () => [
      ...(import.meta.env.DEV
        ? [
            {
              title: t.browserLocalPreview,
              url: `http://localhost:${import.meta.env.VITE_PORT ?? 5173}/`,
            },
          ]
        : []),
      { title: t.browserBlankTab, url: 'about:blank' },
    ],
    [t.browserBlankTab, t.browserLocalPreview],
  );

  const browserLookupIndex = useMemo(() => {
    const seen = new Set<string>();
    return [...quickLinks, ...browserBookmarks, ...browserHistory, ...browserTabs].filter(
      (item) => {
        const key = `${item.title}::${item.url}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      },
    );
  }, [browserBookmarks, browserHistory, browserTabs, quickLinks]);

  const searchResults = useMemo(() => {
    const results = mergeSearchResults({
      query: navigatorQuery,
      scope: searchScope,
      bookmarks: browserBookmarks,
      history: browserHistory,
      openTabs: browserTabs,
      labels: {
        savedTabs: t.browserSavedTabs,
        historyTabs: t.browserHistoryTabs,
        openTabs: t.browserOpenTabs,
      },
    });
    // [ADL-DEBUG] 事项10排查用：用户 Tauri 实测收藏/历史域搜标题网址无结果。
    // 待用户复现贴日志后定真 bug 还是 scope 语义问题，定案后删除本日志。
    console.debug(
      '[ADL-DEBUG] [browser::useBrowserSearch] searchResults recompute — query=%s scope=%s bookmarks=%d history=%d openTabs=%d filtered=(%d,%d,%d) results=%d',
      JSON.stringify(navigatorQuery),
      searchScope,
      browserBookmarks.length,
      browserHistory.length,
      browserTabs.length,
      filterBrowserItems(browserBookmarks, navigatorQuery).length,
      filterBrowserItems(browserHistory, navigatorQuery).length,
      filterBrowserItems(browserTabs, navigatorQuery).length,
      results.length,
    );
    return results;
  }, [
    navigatorQuery,
    browserBookmarks,
    browserHistory,
    browserTabs,
    searchScope,
    t.browserHistoryTabs,
    t.browserOpenTabs,
    t.browserSavedTabs,
  ]);

  return {
    navigatorQuery,
    setNavigatorQuery,
    searchScope,
    setSearchScope,
    navigatorSearchRef,
    navigatorSearchInputRef,
    quickLinks,
    browserLookupIndex,
    searchResults,
  };
}
