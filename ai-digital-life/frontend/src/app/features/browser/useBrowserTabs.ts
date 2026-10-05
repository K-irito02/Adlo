import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { isPanelTab } from '@stores/slices/tabLocation';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';

export type BrowserNavigatorMode = 'open' | 'tabs' | 'list' | 'search';

export function computeNavigatorCount(
  navigatorMode: BrowserNavigatorMode,
  _query: string,
  browserTabs: BrowserTabState[],
  _browserBookmarks: { title: string; url: string }[],
  _browserHistory: { title: string; url: string; visitedAt: number }[],
  searchResults: { title: string; url: string; source: string }[],
  _filteredBookmarks: { title: string; url: string }[],
  _filteredHistory: { title: string; url: string }[],
): number {
  if (navigatorMode === 'tabs' || navigatorMode === 'open' || navigatorMode === 'list') {
    return browserTabs.length;
  }
  if (navigatorMode === 'search') {
    return searchResults.length;
  }
  return 0;
}

export function findTabByUrl(tabs: BrowserTabState[], url: string): string | undefined {
  if (!url) {
    return undefined;
  }
  const normalizedUrl = url.endsWith('/') && url.length > 8 ? url.slice(0, -1) : url;
  for (const tab of tabs) {
    const tabUrl = tab.url.endsWith('/') && tab.url.length > 8 ? tab.url.slice(0, -1) : tab.url;
    if (tabUrl === normalizedUrl || tab.url === url) {
      return tab.id;
    }
  }
  return undefined;
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
    browserClearAllFolderTabs,
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
      browserClearAllFolderTabs: state.browserClearAllFolderTabs,
    })),
  );

  // 面板只拥有 location !== 'center' 的标签：转入中心的标签不得在面板列表/树/计数中
  // 重复显示，也不得由面板再次挂载同一 session（排他归属，spec 目标 #5）。
  const panelBrowserTabs = useMemo(() => browserTabs.filter(isPanelTab), [browserTabs]);

  const activeTab = useMemo(
    () => panelBrowserTabs.find((tab) => tab.id === browserActiveTabId) ?? panelBrowserTabs[0],
    [browserActiveTabId, panelBrowserTabs],
  );

  const hasActiveTab = activeTab !== null;
  const isBookmarked = activeTab?.url
    ? browserBookmarks.some(
        (bookmark) => bookmark.url === activeTab.url && bookmark.title === activeTab.title,
      )
    : false;

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleCreateTab = useCallback(
    (url?: string, title?: string, workspaceId?: string) => {
      browserOpenTab(url, title, workspaceId);
    },
    [browserOpenTab],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      browserSelectTab(tabId);
    },
    [browserSelectTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState();
      const tab = state.browserTabs.find((t) => t.id === tabId);
      browserCloseTab(tabId);
      if (tab?.url) {
        removeSiteMetaIfUnreferenced(tab.url);
      }
    },
    [browserCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const state = useAppStore.getState();
      const closingTabs = (
        workspaceId
          ? state.browserTabs.filter((t) => t.workspaceId === workspaceId)
          : state.browserTabs
      ).filter((t) => t.location !== 'center');
      const closingUrls = closingTabs.map((t) => t.url).filter((u): u is string => !!u);
      browserCloseAllTabs(workspaceId);
      for (const url of closingUrls) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserCloseAllTabs],
  );

  const handleClearTabDirectories = useCallback(() => {
    browserClearAllFolderTabs();
  }, [browserClearAllFolderTabs]);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      // 用户重命名是确定的真实标题 → 标记已结算，避免扫光持续覆盖自定义标题（M1-D）
      browserUpdateTab(editingTabId, { title: editValue.trim(), titleResolved: true });
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
    [handleEditSubmit],
  );

  const handleToggleBookmark = useCallback(() => {
    browserToggleBookmark();
  }, [browserToggleBookmark]);

  const handleToggleBookmarkForTab = useCallback(
    (tabId: string, url: string, title: string) => {
      browserToggleBookmark({ url, title });
    },
    [browserToggleBookmark],
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
    browserTabs: panelBrowserTabs,
    browserActiveTabId,
    activeTab,
    hasActiveTab,
    isBookmarked,
    handleDoubleClick,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleClearTabDirectories,
    handleEditSubmit,
    handleEditKeyDown,
    handleToggleBookmark,
    handleToggleBookmarkForTab,
    handleClearHistory,
    setEditValue,
    setEditingTabId,
  };
}
