import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useTCopy } from '@i18n/useTCopy';

export type BrowserSearchScope = 'bookmarks' | 'history' | 'all';

function filterBrowserItems<T extends { title: string; url: string }>(
  items: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    return title.includes(normalizedQuery) || url.includes(normalizedQuery);
  });
}

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

  const filteredBookmarks = useMemo(
    () => filterBrowserItems(browserBookmarks, navigatorQuery),
    [browserBookmarks, navigatorQuery],
  );

  const filteredHistory = useMemo(
    () => filterBrowserItems(browserHistory, navigatorQuery),
    [browserHistory, navigatorQuery],
  );

  const filteredOpenTabs = useMemo(
    () => filterBrowserItems(browserTabs, navigatorQuery),
    [browserTabs, navigatorQuery],
  );

  const searchResults = useMemo(() => {
    let results: { title: string; url: string; source: string }[];
    if (searchScope === 'bookmarks') {
      results = filteredBookmarks.map((item) => ({ ...item, source: t.browserSavedTabs }));
    } else if (searchScope === 'history') {
      results = filteredHistory.map((item) => ({ ...item, source: t.browserHistoryTabs }));
    } else {
      const merged = new Map<string, { title: string; url: string; source: string }>();
      for (const item of filteredBookmarks) {
        merged.set(`bookmark:${item.url}`, { ...item, source: t.browserSavedTabs });
      }
      for (const item of filteredHistory) {
        const key = `history:${item.url}:${item.title}`;
        merged.set(key, { ...item, source: t.browserHistoryTabs });
      }
      // 已打开标签同样参与"全部"检索（仅按 URL 去重，保留标签来源标注）：
      // 此前仅合并且收藏/历史，输入标签标题/网址时无结果。
      for (const item of filteredOpenTabs) {
        const key = `opentab:${item.url}`;
        if (!merged.has(key)) {
          merged.set(key, { title: item.title, url: item.url, source: t.browserOpenTabs });
        }
      }
      results = [...merged.values()];
    }
    // [ADL-DEBUG] 事项10排查用：用户 Tauri 实测收藏/历史域搜标题网址无结果。
    // 待用户复现贴日志后定真 bug 还是 scope 语义问题，定案后删除本日志。
    console.debug(
      '[ADL-DEBUG] [browser::useBrowserSearch] searchResults recompute — query=%s scope=%s bookmarks=%d history=%d openTabs=%d filtered=(%d,%d,%d) results=%d',
      JSON.stringify(navigatorQuery),
      searchScope,
      browserBookmarks.length,
      browserHistory.length,
      browserTabs.length,
      filteredBookmarks.length,
      filteredHistory.length,
      filteredOpenTabs.length,
      results.length,
    );
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 日志读 navigatorQuery/三列表长度与 filtered 同源变化，刻意不入 deps 防重复触发
  }, [
    filteredBookmarks,
    filteredHistory,
    filteredOpenTabs,
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
    filteredBookmarks,
    filteredHistory,
    searchResults,
  };
}
