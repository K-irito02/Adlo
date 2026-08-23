import { useMemo, useRef, useState } from 'react';
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
  const exactMatch = browserLookupIndex.find(
    (item) =>
      item.title.toLowerCase() === normalizedInput || item.url.toLowerCase() === normalizedInput,
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Chrome/Edge omnibox 行为：只在输入明确是 URL 格式时才在历史记录中查找匹配
  // 当输入是搜索词时（如"百度"），跳过历史记录匹配，直接触发搜索
  const looksLikeUrl =
    /^(about:|[a-z]+:\/\/)/i.test(input) || // 协议前缀
    /^\d{1,3}(\.\d{1,3}){3}$/.test(input) || // IP 地址
    /^localhost(:\d+)?/i.test(input) || // localhost
    /\.[a-z]{2,}$/i.test(input) || // 点号 + TLD（如 .com、.org）
    /\/$/.test(input); // 以 / 结尾的路径
  if (!looksLikeUrl) {
    // 输入不是 URL 格式，跳过历史记录匹配，返回 undefined 触发搜索
    return undefined;
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
  const [searchScope, setSearchScope] = useState<BrowserSearchScope>('all');

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

  const searchResults = useMemo(() => {
    if (searchScope === 'bookmarks') {
      return filteredBookmarks.map((item) => ({ ...item, source: t.browserSavedTabs }));
    }
    if (searchScope === 'history') {
      return filteredHistory.map((item) => ({ ...item, source: t.browserHistoryTabs }));
    }
    const merged = new Map<string, { title: string; url: string; source: string }>();
    for (const item of filteredBookmarks) {
      merged.set(`bookmark:${item.url}`, { ...item, source: t.browserSavedTabs });
    }
    for (const item of filteredHistory) {
      const key = `history:${item.url}:${item.title}`;
      merged.set(key, { ...item, source: t.browserHistoryTabs });
    }
    return [...merged.values()];
  }, [filteredBookmarks, filteredHistory, searchScope, t.browserHistoryTabs, t.browserSavedTabs]);

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
