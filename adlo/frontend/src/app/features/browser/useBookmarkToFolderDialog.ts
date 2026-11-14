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
      // 按 URL 取消收藏：收藏身份由 URL 决定（导入/仅保存条目的标题是快照，
      // 与当前页面标题不同，不能用 (url,title) 元组匹配，否则会再插一条而不是移除）。
      const url = activeTab?.url;
      if (!url) {
        return;
      }
      useAppStore.getState().browserRemoveBookmarksForUrl(url);
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

  /** 目录冲突的统一 toast（带路径文案时显示具体目录）。 */
  const showDuplicateToast = useCallback(
    (pathLabel: string | undefined) => {
      const msg = pathLabel
        ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', { path: pathLabel })
        : t.browserEditBookmarkDuplicate;
      showToast(msg, 'warning');
    },
    [showToast, t],
  );

  const closeDialogAfterCollision = useCallback(() => {
    setBookmarkDialogOpen(false);
    setPendingBookmark(null);
  }, [setBookmarkDialogOpen, setPendingBookmark]);

  /**
   * 落盘「标签 → 目录」关联：folder:/workspace: 前缀分派 + 冲突 toast。
   * 返回 false 表示目录冲突已 toast（调用方据此中止后续流程）。
   */
  const addTabToDirectory = useCallback(
    async (tabId: string, folderPath: string, title: string | undefined): Promise<boolean> => {
      const folderId = folderPath.startsWith('folder:')
        ? folderPath.slice('folder:'.length)
        : undefined;
      const workspaceId = folderPath.startsWith('workspace:')
        ? folderPath.slice('workspace:'.length)
        : undefined;
      const result = await useAppStore
        .getState()
        .browserSaveTabAsBookmark(tabId, folderId, undefined, workspaceId, title);
      if (result.ok === false && result.reason !== 'no-tab') {
        showDuplicateToast(result.pathLabel);
        return false;
      }
      return true;
    },
    [showDuplicateToast],
  );

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
            showDuplicateToast(precheck.pathLabel);
            closeDialogAfterCollision();
            return;
          }
        }

        useAppStore.getState().browserToggleBookmark({
          url: pendingBookmark.url,
          title,
        });

        // Then try to associate with a folder if one was selected
        if (
          folderPath &&
          (folderPath.startsWith('folder:') || folderPath.startsWith('workspace:'))
        ) {
          const tabId =
            useAppStore.getState().browserTabs.find((tab) => tab.url === pendingBookmark.url)?.id ||
            pendingBookmark.tabId;

          if (tabId) {
            const added = await addTabToDirectory(tabId, folderPath, title);
            if (!added) {
              closeDialogAfterCollision();
              return;
            }
          } else {
            // 没有活标签页（导入书签、历史行等）：直接按 URL 写入目标目录/工作区，
            // 否则只写全局索引且提示成功，随后会被孤儿清扫静默删掉。
            const store = useAppStore.getState();
            const result = store.browserCreateBookmarkEntry({
              url: pendingBookmark.url,
              title,
              ...(folderPath.startsWith('folder:')
                ? { folderId: folderPath.slice('folder:'.length) }
                : { workspaceId: folderPath.slice('workspace:'.length) }),
            });
            if (result.ok === false) {
              showDuplicateToast(result.pathLabel);
              closeDialogAfterCollision();
              return;
            }
          }
        }

        scheduleFaviconFetch(pendingBookmark.url);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
        setPendingBookmark(null);
        return;
      }

      if (!folderPath || !activeTab?.id) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }

      const trimmedName = bookmarkName.trim();
      const title = trimmedName || activeTab.title || '';
      if (folderPath.startsWith('folder:') || folderPath.startsWith('workspace:')) {
        const added = await addTabToDirectory(activeTab.id, folderPath, title || undefined);
        if (!added) {
          // 冲突已 toast；对话框保持打开（与原实现一致），便于改选目录重试。
          return;
        }
        if (activeTab.url) {
          scheduleFaviconFetch(activeTab.url);
        }
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
      }
    },
    [
      activeTab,
      showToast,
      t,
      bookmarkName,
      pendingBookmark,
      addTabToDirectory,
      showDuplicateToast,
      closeDialogAfterCollision,
    ],
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
