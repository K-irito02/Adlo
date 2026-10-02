import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { checkBookmarkCollision } from '@stores/slices/browserBookmarkSlice';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';
import type { ToastType } from '@components/Toast';
import { scheduleFaviconFetch } from './faviconSelfHeal';

/** 待收藏标签的最小快照（面板 / 中心两宿主的活动标签都满足）。 */
export interface BookmarkFlowTab {
  id: string;
  url?: string;
  title?: string;
}

interface UseBookmarkToFolderDialogDeps {
  t: Record<string, string>;
  activeTab: BookmarkFlowTab | null | undefined;
  isBookmarked: boolean;
  showToast: (message: string, type?: ToastType, source?: string) => void;
  /**
   * 「新建目录」请求。宿主自行决定呈现方式（面板与中心各自持有同一个创建目录
   * 对话框，与各自的导航器入口共用实例），本 hook 不持有该对话框状态。
   */
  onCreateDir: (parentPath: string | null) => void;
  /**
   * 是否订阅 store 的待收藏项投递（`browserPendingBookmark`）。默认 true。
   *
   * 该投递只有**一个**生产者：面板导航器条目树的「收藏到目录」右键菜单
   * （`browserEntrySubEntriesUtils`），它只在浏览器面板挂载时可达。因此**中心必须
   * 传 false** —— 否则面板与中心同时挂载时，一次右键会打开两个对话框（双弹窗）。
   */
  watchStorePending?: boolean;
}

/**
 * 「收藏标签 → 选择目录」流程（宿主无关）。
 *
 * 面板（`BrowserPanel`）与中心（`CenterBrowserView`）共用同一份实现：两者都只是
 * 「当前活动标签 + 是否已收藏」的不同来源，收藏落盘、目录碰撞预检、名称输入与
 * 待收藏项投递（右键菜单经 `browserPendingBookmark` 写入 store）完全一致。
 *
 * 不负责渲染：对话框由 `BookmarkToFolderDialogs` 统一渲染，避免两端各写一份。
 */
export function useBookmarkToFolderDialog({
  t,
  activeTab,
  isBookmarked,
  showToast,
  onCreateDir,
  watchStorePending = true,
}: UseBookmarkToFolderDialogDeps) {
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');
  const [pendingBookmark, setPendingBookmark] = useState<{
    url: string;
    title: string;
    tabId?: string;
  } | null>(null);

  // 非本流程入口（右键菜单等）通过 store 投递待收藏项。仅面板侧订阅（见 dep 注释）。
  useEffect(() => {
    if (!watchStorePending) {
      return;
    }
    const unsub = useAppStore.subscribe((state) => {
      const pending = state.browserPendingBookmark;
      if (pending) {
        setPendingBookmark(pending);
        setBookmarkName(pending.title || pending.url);
        setBookmarkDialogOpen(true);
        useAppStore.getState().browserSetPendingBookmark(null);
      }
    });
    return unsub;
  }, [watchStorePending]);

  const handleOpenBookmarkDialog = useCallback(() => {
    if (isBookmarked) {
      // 必须**显式**传本宿主活动标签的 (url,title)：无参形式取的是 store 的
      // `browserActiveTabId`，而它被 `clampPanelActiveTab` 恒夹到**面板**标签
      //（`browserTabsSlice` 明示不得指向中心标签）→ 中心侧会误删面板标签的书签。
      // title 为空时回落 url，与无参路径的解析链（`input.title || active.title || url`）结果一致。
      const url = activeTab?.url;
      if (!url) {
        return;
      }
      useAppStore.getState().browserToggleBookmark({ url, title: activeTab?.title || url });
      return;
    }
    setBookmarkName(activeTab?.title || '');
    setPendingBookmark(null);
    setBookmarkDialogOpen(true);
  }, [isBookmarked, activeTab?.title, activeTab?.url]);

  const handleBookmarkFromUrl = useCallback((url: string, title: string) => {
    setPendingBookmark({ url, title });
    setBookmarkName(title || url);
    setBookmarkDialogOpen(true);
  }, []);

  const handleCloseBookmarkDialog = useCallback(() => {
    setBookmarkDialogOpen(false);
    setBookmarkName('');
    setPendingBookmark(null);
    useAppStore.getState().browserSetPendingBookmark(null);
  }, []);

  const handleBookmarkAddToFolder = useCallback(
    async (folderPath: string | null) => {
      if (pendingBookmark) {
        const trimmedName = bookmarkName.trim();
        const title = trimmedName || pendingBookmark.title;

        // 先预检目录碰撞（只读），冲突则拦截，避免 toggle 已改变状态
        if (folderPath) {
          const state = useAppStore.getState();
          const precheck = checkBookmarkCollision(
            pendingBookmark.url,
            title,
            folderPath.startsWith('folder:')
              ? { folderId: folderPath.slice('folder:'.length) }
              : { workspaceId: folderPath.slice('workspace:'.length) },
            state,
            state.recentWorkspaces,
          );
          if (precheck.ok === false) {
            const msg = precheck.pathLabel
              ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                  path: precheck.pathLabel,
                })
              : t.browserEditBookmarkDuplicate;
            showToast(msg, 'warning');
            setBookmarkDialogOpen(false);
            setPendingBookmark(null);
            return;
          }
        }

        useAppStore.getState().browserToggleBookmark({
          url: pendingBookmark.url,
          title,
        });

        // Then try to associate with a folder if one was selected
        if (folderPath) {
          const tabId =
            useAppStore.getState().browserTabs.find((tab) => tab.url === pendingBookmark.url)?.id ||
            pendingBookmark.tabId;

          if (tabId) {
            if (folderPath.startsWith('folder:')) {
              const folderId = folderPath.slice('folder:'.length);
              const result = await useAppStore
                .getState()
                .browserBookmarkTab(tabId, folderId, undefined, undefined, title);
              if (result.ok === false && result.reason !== 'no-tab') {
                const msg = result.pathLabel
                  ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                      path: result.pathLabel,
                    })
                  : t.browserEditBookmarkDuplicate;
                showToast(msg, 'warning');
                setBookmarkDialogOpen(false);
                setPendingBookmark(null);
                return;
              }
            } else if (folderPath.startsWith('workspace:')) {
              const workspaceId = folderPath.slice('workspace:'.length);
              const result = await useAppStore
                .getState()
                .browserBookmarkTab(tabId, undefined, undefined, workspaceId, title);
              if (result.ok === false && result.reason !== 'no-tab') {
                const msg = result.pathLabel
                  ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                      path: result.pathLabel,
                    })
                  : t.browserEditBookmarkDuplicate;
                showToast(msg, 'warning');
                setBookmarkDialogOpen(false);
                setPendingBookmark(null);
                return;
              }
            }
          }
        }

        scheduleFaviconFetch(pendingBookmark.url);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
        setPendingBookmark(null);
        return;
      }

      if (!folderPath) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
      if (!activeTab?.id) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }

      const trimmedName = bookmarkName.trim();
      const title = trimmedName || activeTab.title || '';
      if (folderPath.startsWith('folder:')) {
        const folderId = folderPath.slice('folder:'.length);
        const result = await useAppStore
          .getState()
          .browserBookmarkTab(activeTab.id, folderId, undefined, undefined, title || undefined);
        if (result.ok === false && result.reason !== 'no-tab') {
          const msg = result.pathLabel
            ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                path: result.pathLabel,
              })
            : t.browserEditBookmarkDuplicate;
          showToast(msg, 'warning');
          return;
        }
        if (activeTab.url) {
          scheduleFaviconFetch(activeTab.url);
        }
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else if (folderPath.startsWith('workspace:')) {
        const workspaceId = folderPath.slice('workspace:'.length);
        const result = await useAppStore
          .getState()
          .browserBookmarkTab(activeTab.id, undefined, undefined, workspaceId, title || undefined);
        if (result.ok === false && result.reason !== 'no-tab') {
          const msg = result.pathLabel
            ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                path: result.pathLabel,
              })
            : t.browserEditBookmarkDuplicate;
          showToast(msg, 'warning');
          return;
        }
        if (activeTab.url) {
          scheduleFaviconFetch(activeTab.url);
        }
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
    },
    [activeTab, showToast, t, bookmarkName, pendingBookmark],
  );

  const handleBookmarkCreateDir = useCallback(
    (parentPath: string | null) => {
      onCreateDir(parentPath);
    },
    [onCreateDir],
  );

  return {
    bookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkFromUrl,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
    handleCloseBookmarkDialog,
  };
}
