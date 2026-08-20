import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { pageMetaClient } from '@utils/pageMetaClient';
import { hostnameFromUrl, isPlaceholderTitle } from '@utils/browserDisplayUtils';
import { applyBroadcastTitle, titleSourceRef } from './useBrowserPageMeta';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';

export function useBrowserTagActions(options?: {
  navigateTabExplicit?: (tabId: string, url: string, title?: string) => void;
}) {
  const { navigateTabExplicit } = options ?? {};
  const {
    browserOpenTab,
    browserCloseTab,
    browserUpdateTab,
    browserUpdateHistoryTitle,
    browserDeleteHistoryEntry,
    browserRemoveTabBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserCloseTab: state.browserCloseTab,
      browserUpdateTab: state.browserUpdateTab,
      browserUpdateHistoryTitle: state.browserUpdateHistoryTitle,
      browserDeleteHistoryEntry: state.browserDeleteHistoryEntry,
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
    })),
  );

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, _folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab],
  );

  const handleRefreshTab = useCallback(
    async (tabId: string, url: string) => {
      if (!url) {
        return;
      }
      const meta = await pageMetaClient.refresh(url); // force=true

      const state = useAppStore.getState();
      const tab = state.browserTabs.find((t) => t.id === tabId);

      const title = meta?.title || hostnameFromUrl(url);
      if (tab) {
        const shouldApply = applyBroadcastTitle(tab, url, title, 'http', titleSourceRef.get(tabId));
        browserUpdateTab(tabId, { title: shouldApply ? title : tab.title });
        if (shouldApply) {
          titleSourceRef.set(tabId, 'http');
        }
      } else {
        const isHistoryEntry = state.browserHistory.some((h) => h.id === tabId);
        if (isHistoryEntry) {
          browserUpdateHistoryTitle(url, title);
        }
        // 书签快照：仅占位标题时覆盖（服务端广播也会经 Task 9 落地，此处为兜底直连）
        // 注：扁平 browserBookmarks（{url,title}）无 tabId，带 tabId 的快照存于
        // browserTabFolders[].tabs / browserWorkspaceBookmarks[]，故由此定位并走
        // browserUpdateSavedBookmark（brief 原 `bm.tabId` 写法在类型上不存在，无法编译）。
        const bmSnapshot =
          state.browserTabFolders.flatMap((f) => f.tabs ?? []).find((t) => t.url === url) ??
          Object.values(state.browserWorkspaceBookmarks)
            .flat()
            .find((e) => e.url === url);
        if (bmSnapshot && isPlaceholderTitle(bmSnapshot.title, url)) {
          state.browserUpdateSavedBookmark(bmSnapshot.tabId, { title, url: bmSnapshot.url });
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
        browserRemoveTabBookmarks(tabId, url);
        browserCloseTab(tabId);
        if (url) {
          removeSiteMetaIfUnreferenced(url);
        }
      }
    },
    [browserCloseTab, browserRemoveTabBookmarks, browserDeleteHistoryEntry],
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

  const handleOpenTabInCurrentTab = useCallback(
    (tabId: string) => {
      const state = useAppStore.getState();
      const tab = state.browserTabs.find((t) => t.id === tabId);
      const activeTabId = state.browserActiveTabId;
      if (tab && activeTabId) {
        if (navigateTabExplicit) {
          // D4：显式导航 —— 在更新 active tab URL 的同时真正 Navigate 其已入池 WebView，
          // 否则 Tauri 下标签 URL 与画面脱节（store action 不再触发 WebView2.Navigate）。
          navigateTabExplicit(activeTabId, tab.url);
        } else {
          browserUpdateTab(activeTabId, { url: tab.url });
        }
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
  };
}
