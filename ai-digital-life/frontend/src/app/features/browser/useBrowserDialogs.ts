import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { checkBookmarkCollision } from '@stores/slices/browserBookmarkSlice';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';
import { hostnameFromUrl, isPlaceholderTitle, isUnsafeTitle } from '@utils/browserDisplayUtils';
import { pageMetaClient } from '@utils/pageMetaClient';
import type { ToastType } from '@components/Toast';

interface UseBrowserDialogsDeps {
  browserOpenTab: (url: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserUpdateTab: (tabId: string, updates: { title?: string; url?: string }) => void;
  activeTab: { id: string; url?: string; title?: string } | null | undefined;
  isBookmarked: boolean;
  showToast: (message: string, type?: ToastType, source?: string) => void;
  t: Record<string, string>;
}

export function useBrowserDialogs(deps: UseBrowserDialogsDeps) {
  const { browserOpenTab, browserUpdateTab, activeTab, isBookmarked, showToast, t } = deps;

  // ── create tab dialog ──
  const [createTabDialog, setCreateTabDialog] = useState<{
    open: boolean;
    workspaceId?: string;
    folderId?: string;
  }>({ open: false });
  const pendingFolderIdRef = useRef<string>('');
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
      return state.browserBookmarkTab(
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
        // 采用 cache-first + 静默渲染命令（超时由后端静默 tab 自兜底 ≤6s）。
        setIsCreatingTab(true);
        const requestStart = Date.now();
        console.info('[bookmark-new-meta] start', { url });
        const cached = pageMetaClient.peek(url);
        const cachedTitle = cached?.title?.trim() ?? '';
        if (cachedTitle && !isUnsafeTitle(cachedTitle) && !isPlaceholderTitle(cachedTitle, url)) {
          // 命中缓存真实标题：直接使用，不发起网络请求。
          title = cachedTitle;
          // 自愈：缓存命中但缺 data-URI（历史条目只有裸 faviconURL，或防盗链站点如
          // bilibili/runoob 需内嵌 base64 才能渲染）时，后台静默刷新一次缓存，使后续
          // 渲染/重进对话框拿到真实 favicon。判断只看 data-URI 缺失（而非 faviconUrl 也
          // 缺失）——否则 "有 URL 无 data-URI" 的防盗链站点永不触发补全、永远兜底图标。
          const favMissing = !cached?.faviconDataUri;
          if (favMissing) {
            void pageMetaClient
              .getSilent(url)
              .then((meta) => {
                console.info('[bookmark-new-meta] cache favicon self-heal', {
                  url,
                  hasFavicon: Boolean(meta?.faviconDataUri),
                });
              })
              .catch((err) =>
                console.warn('[bookmark-new-meta] favicon self-heal failed', {
                  url,
                  err: String(err),
                }),
              );
          }
          console.info('[bookmark-new-meta] cache hit', {
            url,
            cachedTitle,
            favMissing,
            cachedFaviconUrl: cached?.faviconUrl,
            cachedFaviconUrlLen: cached?.faviconUrl?.length ?? 0,
            cachedHasDataUri: Boolean(cached?.faviconDataUri),
          });
        } else {
          try {
            // 移除 META_FETCH_TIMEOUT_MS：超时由后端静默 tab 自兜底（≤6s）
            const meta = await pageMetaClient.getSilent(url);
            const metaTitle = meta?.title?.trim() ?? '';
            const titleOk =
              Boolean(metaTitle) &&
              !isUnsafeTitle(metaTitle) &&
              !isPlaceholderTitle(metaTitle, url);
            console.info('[bookmark-new-meta] silent fetched', {
              url,
              metaTitle,
              titleOk,
              hasFavicon: Boolean(meta?.faviconDataUri),
              elapsedMs: Date.now() - requestStart,
            });
            if (titleOk && metaTitle) {
              title = metaTitle;
            }
          } catch (err) {
            console.warn('[bookmark-new-meta] silent fetch failed', { url, err: String(err) });
          }
          if (!title) {
            // 抓取成功但元数据缺失/超时/失败 → 用宿主名占位先保存（后台请求继续刷新缓存）。
            title = hostnameFromUrl(url) || url;
            console.info('[bookmark-new-meta] fallback hostname', { url, title });
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
        setCreateTabDialog({ open: false });
        pendingFolderIdRef.current = '';
        return;
      }
      // save-and-open：先预检冲突（只读，不写书签）
      const state = useAppStore.getState();
      const precheck = checkBookmarkCollision(
        url,
        title,
        { workspaceId: folderId ? undefined : workspaceId, folderId },
        state,
        state.recentWorkspaces,
        state.browserNavigateInPlace ? state.browserActiveTabId : undefined,
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
        state.browserNavigateActiveTab(url, undefined);
      } else {
        browserOpenTab(url, undefined, folderId ? undefined : workspaceId, undefined);
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
    [browserOpenTab, createTabDialog, bookmarkNewTab, showToast, t],
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
              browserUpdateTab(tabId, { url: trimmedUrl });
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
        browserUpdateTab(tabId, {
          title: trimmedName || undefined,
          url: trimmedUrl || undefined,
        });
        if (mode === 'save-and-open' && trimmedUrl) {
          store.browserSelectTab(tabId);
        }
      }
      setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
    },
    [editTabDialog, browserUpdateTab, showToast, t],
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
  const [createDirDialog, setCreateDirDialog] = useState<{
    open: boolean;
    parentPath: string | null;
  }>({ open: false, parentPath: null });

  // ── bookmark dialog ──
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');
  const [pendingBookmark, setPendingBookmark] = useState<{
    url: string;
    title: string;
    tabId?: string;
  } | null>(null);

  // Watch store for pending bookmark set by context menu actions
  useEffect(() => {
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
  }, [setPendingBookmark, setBookmarkName, setBookmarkDialogOpen]);

  const handleOpenBookmarkDialog = useCallback(() => {
    if (isBookmarked) {
      useAppStore.getState().browserToggleBookmark();
      return;
    }
    setBookmarkName(activeTab?.title || '');
    setPendingBookmark(null);
    setBookmarkDialogOpen(true);
  }, [isBookmarked, activeTab?.title]);

  const handleBookmarkFromUrl = useCallback((url: string, title: string) => {
    setPendingBookmark({ url, title });
    setBookmarkName(title || url);
    setBookmarkDialogOpen(true);
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
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
    },
    [activeTab, showToast, t, bookmarkName, pendingBookmark],
  );

  const handleBookmarkCreateDir = useCallback((parentPath: string | null) => {
    setCreateDirDialog({ open: true, parentPath });
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
    setBookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkFromUrl,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
  };
}
