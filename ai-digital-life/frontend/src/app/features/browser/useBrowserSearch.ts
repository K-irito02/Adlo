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

  const looksLikeUrl = /^(about:|[a-z]+:\/\/)/i.test(input) || /[./:]/.test(input);
  if (!looksLikeUrl) {
    return browserLookupIndex.find(
      (item) =>
        item.title.toLowerCase().includes(normalizedInput) ||
        item.url.toLowerCase().includes(normalizedInput),
    );
  }
  return undefined;
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
