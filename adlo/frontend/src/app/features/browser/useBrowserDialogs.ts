import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { checkBookmarkCollision } from '@stores/slices/browserBookmarkSlice';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';
import { hostnameFromUrl, isPlaceholderTitle, isUnsafeTitle } from '@utils/browserDisplayUtils';
import { pageMetaClient } from '@utils/pageMetaClient';
import type { ToastType } from '@components/Toast';
import { ensureSiteFaviconHttp, scheduleFaviconFetch } from './faviconSelfHeal';
import { useBookmarkToFolderDialog } from './useBookmarkToFolderDialog';

interface UseBrowserDialogsDeps {
  browserOpenTab: (url: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserUpdateTab: (tabId: string, updates: { title?: string; url?: string }) => void;
  navigateTabExplicit: (tabId: string, url: string, title?: string) => void;
  activeTab: { id: string; url?: string; title?: string } | null | undefined;
  isBookmarked: boolean;
  showToast: (message: string, type?: ToastType, source?: string) => void;
  t: Record<string, string>;
}

export function useBrowserDialogs(deps: UseBrowserDialogsDeps) {
  const {
    browserOpenTab,
    browserUpdateTab,
    navigateTabExplicit,
    activeTab,
    isBookmarked,
    showToast,
    t,
  } = deps;

  // ── create tab dialog ──
  const [createTabDialog, setCreateTabDialog] = useState<{
    open: boolean;
    workspaceId?: string;
    folderId?: string;
  }>({ open: false });
  const pendingFolderIdRef = useRef<string>('');
  const pendingFaviconCleanupRef = useRef<(() => void) | null>(null);
  const [isCreatingTab, setIsCreatingTab] = useState(false);

  const handleSetCreateTabDialog = useCallback(
    (
      value: React.SetStateAction<{
        open: boolean;
        workspaceId?: string;
        folderId?: string;
      }>,
    ) => {
      if (typeof value === 'function') {
        setCreateTabDialog((prev) => {
          const resolved = value(prev);
          pendingFolderIdRef.current = resolved.folderId ?? '';
          return resolved;
        });
      } else {
        pendingFolderIdRef.current = value.folderId ?? '';
        setCreateTabDialog(value);
      }
    },
    [],
  );

  const bookmarkNewTab = useCallback(
    async (
      workspaceId?: string,
      folderId?: string,
      titleOverride?: string,
    ): Promise<{ ok: boolean; pathLabel?: string; reason?: 'no-tab' } | null> => {
      const state = useAppStore.getState();
      const tabId = state.browserActiveTabId;
      if (!tabId || !(workspaceId || folderId)) {
        return null;
      }
      return state.browserSaveTabAsBookmark(
        tabId,
        folderId || undefined,
        undefined,
        folderId ? undefined : workspaceId,
        titleOverride,
      );
    },
    [],
  );

  const handleCreateTabConfirm = useCallback(
    async (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-and-open') => {
      const { workspaceId } = createTabDialog;
      const folderId = pendingFolderIdRef.current;
      let title = name.trim();
      if (!title) {
        // 无自定义标题：解析页面元数据用于收藏标题。为缓解"正在获取页面信息…"慢，
        // 采用 cache-first；未命中再走 HTTP-first 抓取（不创建隐藏 WebView）。
        setIsCreatingTab(true);
        const cached = pageMetaClient.peek(url);
        const cachedTitle = cached?.title?.trim() ?? '';
        if (cachedTitle && !isUnsafeTitle(cachedTitle) && !isPlaceholderTitle(cachedTitle, url)) {
          // 命中缓存真实标题：直接使用，不发起网络请求。
          title = cachedTitle;
          // 自愈：缓存命中但缺 data-URI（历史条目只有裸 faviconURL，或防盗链站点如
          // bilibili/runoob 需内嵌 base64 才能渲染）时，后台 HTTP-first 刷新一次缓存，
          // 使后续渲染/重进对话框拿到真实 favicon。判断只看 data-URI 缺失（而非
          // faviconUrl 也缺失）——否则 "有 URL 无 data-URI" 的防盗链站点永不触发补全。
          // 即便 faviconUrl 为空也触发：HTTP-first 补齐会回填图标与 data-URI。
          // 用 HTTP 独立节流，避免占掉标签页静默 WebView 升级的 10 分钟窗口。
          if (!cached?.faviconDataUri) {
            // force：对话框已按「缺 data-URI」判定过；这里必须绕过「已有 faviconUrl
            // 即早退」的守卫，否则防盗链站点（有 URL 无 data-URI）永不补齐。
            ensureSiteFaviconHttp(url, { force: true });
          }
        } else {
          try {
            // HTTP-first：命令先行返回（≤5s HTML 抓取），favicon 字节下载已在后端
            // 移入后台任务，data-URI 经 page-meta-updated 广播自愈。
            const meta = await pageMetaClient.getSilent(url);
            const metaTitle = meta?.title?.trim() ?? '';
            const titleOk =
              Boolean(metaTitle) &&
              !isUnsafeTitle(metaTitle) &&
              !isPlaceholderTitle(metaTitle, url);
            if (titleOk && metaTitle) {
              title = metaTitle;
            }
            // favicon 首次抓取缺失时，等待后台 data-URI 下载完成（≤4s），使书签
            // 创建时直接显示真实图标而非兜底字母。
            if (!meta?.faviconDataUri && titleOk) {
              const waitForFavicon = new Promise<boolean>((resolve) => {
                const FAVICON_WAIT_MS = 4000;
                let resolved = false;
                const timeout = setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    resolve(false);
                  }
                }, FAVICON_WAIT_MS);
                const unsub = pageMetaClient.subscribeUpdated((p) => {
                  if (p.url === url && p.faviconDataUri && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    unsub();
                    resolve(true);
                  }
                });
                pendingFaviconCleanupRef.current = () => {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    unsub();
                  }
                };
              });
              await waitForFavicon;
              pendingFaviconCleanupRef.current = null;
            }
          } catch (err) {
            console.debug('[bookmark-new-meta] page meta fetch failed', { url, err: String(err) });
          }
          if (!title) {
            // 抓取成功但元数据缺失/超时/失败 → 用宿主名占位先保存（后台请求继续刷新缓存）。
            title = hostnameFromUrl(url) || url;
          }
        }
        setIsCreatingTab(false);
      }
      const store = useAppStore.getState();
      if (mode === 'save-only') {
        const result = store.browserCreateBookmarkEntry({
          url,
          title,
          workspaceId: folderId ? undefined : workspaceId,
          folderId,
        });
        if (result.ok === false) {
          const msg = result.pathLabel
            ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
                path: result.pathLabel,
              })
            : t.browserEditBookmarkDuplicate;
          showToast(msg, 'warning');
          return;
        }
        scheduleFaviconFetch(url);
        setCreateTabDialog({ open: false });
        pendingFolderIdRef.current = '';
        return;
      }
      // save-and-open：先预检冲突（只读，不写书签）
      const state = useAppStore.getState();
      // 就地导航重存同一个标签页时，要排除它自己那条既有书签，否则会误报重复
      const existingEntryId = (() => {
        if (!state.browserNavigateInPlace || !state.browserActiveTabId) {
          return undefined;
        }
        const activeId = state.browserActiveTabId;
        if (folderId) {
          return state.browserBookmarkFolders
            .find((f) => f.id === folderId)
            ?.entries?.find((entry) => entry.sourceTabId === activeId)?.id;
        }
        if (workspaceId) {
          return state.browserWorkspaceBookmarks[workspaceId]?.find(
            (entry) => entry.sourceTabId === activeId,
          )?.id;
        }
        return undefined;
      })();
      const precheck = checkBookmarkCollision(
        url,
        title,
        { workspaceId: folderId ? undefined : workspaceId, folderId },
        state,
        state.recentWorkspaces,
        existingEntryId,
      );
      if (precheck.ok === false) {
        const msg = precheck.pathLabel
          ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
              path: precheck.pathLabel,
            })
          : t.browserEditBookmarkDuplicate;
        showToast(msg, 'warning');
        return;
      }
      setCreateTabDialog({ open: false });
      pendingFolderIdRef.current = '';
      if (state.browserNavigateInPlace) {
        // D4：显式导航——就地在当前标签打开并真正 Navigate 已入池 WebView
        navigateTabExplicit(state.browserActiveTabId, url);
      } else {
        browserOpenTab(url, undefined, folderId ? undefined : workspaceId, folderId || undefined);
      }
      // 收藏记录写"用户填的自定义标题"（标签标题仍由页面抓取，互不影响）
      const bookmarked = await bookmarkNewTab(workspaceId, folderId, title);
      if (bookmarked && bookmarked.ok === false && bookmarked.reason !== 'no-tab') {
        const msg = bookmarked.pathLabel
          ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
              path: bookmarked.pathLabel,
            })
          : t.browserEditBookmarkDuplicate;
        showToast(msg, 'warning');
      }
    },
    [browserOpenTab, createTabDialog, bookmarkNewTab, showToast, t, navigateTabExplicit],
  );

  const handleCreateTabCancel = useCallback(() => {
    setCreateTabDialog({ open: false });
    pendingFolderIdRef.current = '';
  }, []);

  // ── edit tab dialog ──
  const [editTabDialog, setEditTabDialog] = useState<{
    open: boolean;
    tabId: string;
    name: string;
    url: string;
  }>({ open: false, tabId: '', name: '', url: '' });

  const handleEditTab = useCallback((tabId: string, name: string, url: string) => {
    setEditTabDialog({ open: true, tabId, name, url });
  }, []);

  const handleEditTabConfirm = useCallback(
    (name: string, url: string, mode: 'save-only' | 'save-and-open' = 'save-only') => {
      const { tabId } = editTabDialog;
      const trimmedUrl = url.trim();
      const trimmedName = name.trim();
      if (!tabId) {
        setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
        return;
      }
      const store = useAppStore.getState();
      const isLiveTab = store.browserTabs.some((tab) => tab.id === tabId);

      // 收藏条目：更新书签记录；冲突则拦截（对话框保持打开）
      const result = store.browserUpdateSavedBookmark(tabId, {
        url: trimmedUrl,
        title: trimmedName,
      });
      if (result.ok === false) {
        const msg = result.pathLabel
          ? formatT(t as CopyDict, 'browserBookmarkDuplicateWithPath', {
              path: result.pathLabel,
            })
          : t.browserEditBookmarkDuplicate;
        showToast(msg, 'warning');
        return;
      }

      if (result.isSavedBookmark) {
        // 书签：live tab 标题保持页面抓取，只更新 url；save-and-open 导航到被编辑标签
        if (mode === 'save-and-open') {
          if (isLiveTab) {
            if (trimmedUrl) {
              // D4：显式导航——更新标签 URL 并真正 Navigate 其已入池 WebView（若为活动标签，
              // 内部走 navigateActiveTabExplicit；否则先导航池内 WebView 再选中切换）。
              navigateTabExplicit(tabId, trimmedUrl);
              store.browserSelectTab(tabId);
            }
          } else {
            store.browserOpenTab(trimmedUrl, undefined);
          }
        } else if (isLiveTab) {
          browserUpdateTab(tabId, { url: trimmedUrl || undefined });
        }
      } else {
        // 普通标签：完整改名 + 更新 url；save-and-open 导航到该标签
        // 用户重命名是确定真实标题 → 标记已结算（M1-D 一致性，避免 shimmer 遮蔽自定义标题）
        browserUpdateTab(tabId, {
          title: trimmedName || undefined,
          url: trimmedUrl || undefined,
          ...(trimmedName ? { titleResolved: true } : {}),
        });
        if (mode === 'save-and-open' && trimmedUrl) {
          // D4：显式导航——更新标签 URL 并真正 Navigate 其已入池 WebView
          navigateTabExplicit(tabId, trimmedUrl, trimmedName || undefined);
          store.browserSelectTab(tabId);
        }
      }
      setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
    },
    [editTabDialog, browserUpdateTab, showToast, t, navigateTabExplicit],
  );

  const handleEditTabCancel = useCallback(() => {
    setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
  }, []);

  // ── rename folder ──
  const [renameFolderState, setRenameFolderState] = useState<{
    open: boolean;
    folderId: string;
    currentName: string;
  }>({
    open: false,
    folderId: '',
    currentName: '',
  });

  // ── create directory ──
  // 面板导航器工具栏与收藏对话框共用同一个创建目录状态（单实例），故该状态留在
  // 本 hook，收藏流程经 onCreateDir 回调触发它。
  const [createDirDialog, setCreateDirDialog] = useState<{
    open: boolean;
    parentPath: string | null;
  }>({ open: false, parentPath: null });

  // ── bookmark dialog ──
  // 收藏流程已抽为宿主无关 hook，与本项目中心的浏览器视图共用同一实现。
  const {
    bookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkFromUrl,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
    handleCloseBookmarkDialog,
  } = useBookmarkToFolderDialog({
    t,
    activeTab,
    isBookmarked,
    showToast,
    onCreateDir: useCallback((parentPath: string | null) => {
      setCreateDirDialog({ open: true, parentPath });
    }, []),
  });

  // 清理 favicon 等待期间的事件订阅，防止组件卸载时 Tauri event listener 泄漏。
  useEffect(() => {
    return () => {
      pendingFaviconCleanupRef.current?.();
      pendingFaviconCleanupRef.current = null;
    };
  }, []);

  return {
    createTabDialog,
    handleSetCreateTabDialog,
    handleCreateTabConfirm,
    handleCreateTabCancel,
    isCreatingTab,
    editTabDialog,
    handleEditTab,
    handleEditTabConfirm,
    handleEditTabCancel,
    renameFolderState,
    setRenameFolderState,
    createDirDialog,
    setCreateDirDialog,
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
