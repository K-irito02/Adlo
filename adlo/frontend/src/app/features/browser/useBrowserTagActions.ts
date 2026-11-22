import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { pageMetaClient } from '@utils/pageMetaClient';
import { isPlaceholderTitle } from '@utils/browserDisplayUtils';
import { applyBroadcastTitle, titleSourceRef } from './useBrowserPageMeta';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';
import { useOpenInCenterAction } from './useOpenInCenterAction';

export function useBrowserTagActions(options?: {
  navigateTabExplicit?: (tabId: string, url: string, title?: string) => void;
}) {
  const { navigateTabExplicit } = options ?? {};
  const { openUrlInCenter } = useOpenInCenterAction();
  const {
    browserOpenTab,
    browserCloseTab,
    browserUpdateTab,
    browserUpdateHistoryTitle,
    browserDeleteHistoryEntry,
    browserRemoveBookmarksFromTab,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
      browserUpdateHistoryTitle: state.browserUpdateHistoryTitle,
      browserDeleteHistoryEntry: state.browserDeleteHistoryEntry,
      browserRemoveBookmarksFromTab: state.browserRemoveBookmarksFromTab,
    })),
  );

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, _folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab],
  );

  const handleRefreshTab = useCallback(
    async (tabId: string | undefined, url: string) => {
      if (!url) {
        return;
      }
      const meta = await pageMetaClient.refresh(url);

      const state = useAppStore.getState();
      const tab = tabId ? state.browserTabs.find((t) => t.id === tabId) : undefined;

      // HTTP-first 命中 icon 时可能只带回静态 HTML 标题（SPA 详情页只有站点名），
      // 它不是渲染标题：不得降级已有标题，也不得把 titleSource 锁成 http 挡住 COM 广播。
      const staticTitleOnly = meta?.source === 'http';
      const renderedTitle = staticTitleOnly ? '' : (meta?.title?.trim() ?? '');
      const cached = pageMetaClient.peek(url);
      const stableTitle =
        (tab?.title && !isPlaceholderTitle(tab.title, url) ? tab.title : '') ||
        (cached?.title && !isPlaceholderTitle(cached.title, url) ? cached.title : '');
      const title = renderedTitle || stableTitle;

      if (tab) {
        // 只有静默 WebView 的渲染标题才写标签；取不到就保持现状（不降级、不锁来源）。
        if (renderedTitle) {
          const source = meta?.source || 'http';
          const shouldApply = applyBroadcastTitle(
            tab,
            url,
            renderedTitle,
            source,
            titleSourceRef.get(tabId!),
          );
          browserUpdateTab(tabId!, {
            title: shouldApply ? renderedTitle : tab.title,
            ...(shouldApply ? { titleResolved: true } : {}),
          });
          if (shouldApply) {
            titleSourceRef.set(tabId!, source);
          }
        }
      } else if (title) {
        const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
        if (isHistoryEntry) {
          browserUpdateHistoryTitle(url, title);
        }
        const bmSnapshot =
          state.browserBookmarkFolders.flatMap((f) => f.entries ?? []).find((e) => e.url === url) ??
          Object.values(state.browserWorkspaceBookmarks)
            .flat()
            .find((e) => e.url === url);
        if (bmSnapshot && isPlaceholderTitle(bmSnapshot.title, url)) {
          state.browserUpdateSavedBookmark(bmSnapshot.id, { title, url: bmSnapshot.url });
        }
      }
    },
    [browserUpdateTab, browserUpdateHistoryTitle],
  );

  const handleDeleteTab = useCallback(
    (tabId: string, url: string) => {
      const state = useAppStore.getState();
      const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);

      if (isHistoryEntry) {
        browserDeleteHistoryEntry(tabId);
        if (url) {
          removeSiteMetaIfUnreferenced(url);
        }
      } else {
        browserRemoveBookmarksFromTab(tabId, url);
        browserCloseTab(tabId);
        if (url) {
          removeSiteMetaIfUnreferenced(url);
        }
      }
    },
    [browserCloseTab, browserRemoveBookmarksFromTab, browserDeleteHistoryEntry],
  );

  const handleCopyTabLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, []);

  const handleOpenTabInNewTab = useCallback(
    (url: string, title?: string) => {
      browserOpenTab(url, title);
    },
    [browserOpenTab],
  );

  /** 书签/历史等 URL 行：「在中心打开」= 新建中心标签（不移动已有标签）。 */
  const handleOpenInCenter = useCallback(
    (url: string, title?: string) => {
      if (!url) {
        return;
      }
      openUrlInCenter(url, title);
    },
    [openUrlInCenter],
  );

  const handleOpenTabInCurrentTab = useCallback(
    (url: string) => {
      const state = useAppStore.getState();
      const activeTabId = state.browserActiveTabId;
      if (!url || !activeTabId) {
        return;
      }
      if (navigateTabExplicit) {
        // D4：显式导航 —— 在更新 active tab URL 的同时真正 Navigate 其已入池 WebView，
        // 否则 Tauri 下标签 URL 与画面脱节（store action 不再触发 WebView2.Navigate）。
        navigateTabExplicit(activeTabId, url);
      } else {
        browserUpdateTab(activeTabId, { url });
      }
    },
    [browserUpdateTab, navigateTabExplicit],
  );

  return {
    handleCreateTabInTree,
    handleRefreshTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
    handleOpenInCenter,
  };
}
