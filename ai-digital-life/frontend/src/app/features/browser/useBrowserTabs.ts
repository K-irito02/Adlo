import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import {
  clearFaviconCacheForUrl,
  clearPageMetaCacheForUrl,
  unlockTabTitle,
} from '../../utils/fetchPageMeta';

export type BrowserNavigatorMode = 'tabs' | 'bookmarks' | 'history' | 'search';

export function computeNavigatorCount(
  navigatorMode: BrowserNavigatorMode,
  query: string,
  browserTabs: BrowserTabState[],
  browserBookmarks: Array<{ title: string; url: string }>,
  browserHistory: Array<{ title: string; url: string; visitedAt: number }>,
  searchResults: Array<{ title: string; url: string; source: string }>,
  filteredBookmarks: Array<{ title: string; url: string }>,
  filteredHistory: Array<{ title: string; url: string }>
): number {
  if (navigatorMode === 'tabs') {
    return browserTabs.length;
  }
  if (navigatorMode === 'search') {
    return searchResults.length;
  }
  if (query.trim()) {
    return navigatorMode === 'bookmarks' ? filteredBookmarks.length : filteredHistory.length;
  }
  if (navigatorMode === 'bookmarks') {
    return browserBookmarks.length;
  }
  if (navigatorMode === 'history') {
    return browserHistory.length;
  }
  return 0;
}

export function useBrowserTabs() {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const editInputRef = useRef<HTMLInputElement | null>(null);

  const {
    browserTabs,
    browserActiveTabId,
    browserBookmarks,
    browserOpenTab,
    browserSelectTab,
    browserCloseTab,
    browserUpdateTab,
    browserCloseAllTabs,
    browserToggleBookmark,
    browserClearHistory,
    browserRemoveTabBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserTabs: state.browserTabs,
      browserActiveTabId: state.browserActiveTabId,
      browserBookmarks: state.browserBookmarks,
      browserOpenTab: state.browserOpenTab,
      browserSelectTab: state.browserSelectTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
      browserCloseAllTabs: state.browserCloseAllTabs,
      browserToggleBookmark: state.browserToggleBookmark,
      browserClearHistory: state.browserClearHistory,
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
    }))
  );

  const activeTab = useMemo(
    () => browserTabs.find((tab) => tab.id === browserActiveTabId) ?? browserTabs[0],
    [browserActiveTabId, browserTabs]
  );

  const hasActiveTab = activeTab !== null;
  const isBookmarked = activeTab?.url
    ? browserBookmarks.some((bookmark) => bookmark.url === activeTab.url)
    : false;

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleCreateTab = useCallback(
    (url?: string, title?: string, workspaceId?: string) => {
      browserOpenTab(url, title, workspaceId);
    },
    [browserOpenTab]
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      browserSelectTab(tabId);
    },
    [browserSelectTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      browserCloseTab(tabId);
    },
    [browserCloseTab]
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      if (!workspaceId) {
        const state = useAppStore.getState();
        const allTabIds = state.browserTabs.map((t) => t.id);
        const allUrls = state.browserTabs.map((t) => t.url).filter((u): u is string => !!u);
        for (const url of allUrls) {
          clearFaviconCacheForUrl(url);
          clearPageMetaCacheForUrl(url);
        }
        for (const tabId of allTabIds) {
          browserRemoveTabBookmarks(tabId, '');
          unlockTabTitle(tabId);
        }
      }
      browserCloseAllTabs(workspaceId);
    },
    [browserCloseAllTabs, browserRemoveTabBookmarks]
  );

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      browserUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, browserUpdateTab]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleEditSubmit]
  );

  const handleToggleBookmark = useCallback(() => {
    browserToggleBookmark();
  }, [browserToggleBookmark]);

  const handleToggleBookmarkForTab = useCallback(
    (tabId: string, url: string, title: string) => {
      browserToggleBookmark({ url, title });
    },
    [browserToggleBookmark]
  );

  const handleClearHistory = useCallback(() => {
    browserClearHistory();
  }, [browserClearHistory]);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  return {
    editingTabId,
    editValue,
    editInputRef,
    browserTabs,
    browserActiveTabId,
    activeTab,
    hasActiveTab,
    isBookmarked,
    handleDoubleClick,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleEditSubmit,
    handleEditKeyDown,
    handleToggleBookmark,
    handleToggleBookmarkForTab,
    handleClearHistory,
    setEditValue,
    setEditingTabId,
  };
}
