import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { hostnameFromUrl } from '@utils/browserDisplayUtils';
import { getCachedFavicon, setCachedFavicon, prefetchPageMeta } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';
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
      }>
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
    []
  );

  const bookmarkNewTab = useCallback((workspaceId?: string, folderId?: string) => {
    const tabId = useAppStore.getState().browserActiveTabId;
    if (tabId && (workspaceId || folderId)) {
      useAppStore
        .getState()
        .browserBookmarkTab(
          tabId,
          folderId || undefined,
          undefined,
          folderId ? undefined : workspaceId
        );
    }
  }, []);

  const handleCreateTabConfirm = useCallback(
    async (name: string, url: string) => {
      const { workspaceId } = createTabDialog;
      const folderId = pendingFolderIdRef.current;
      pendingFolderIdRef.current = '';
      if (name.trim()) {
        setCreateTabDialog({ open: false });
        browserOpenTab(url, name, folderId ? undefined : workspaceId, folderId || undefined);
        bookmarkNewTab(workspaceId, folderId);
        return;
      }
      setIsCreatingTab(true);
      let title = '';
      try {
        const meta = await prefetchPageMeta(url);
        if (meta?.title?.trim()) {
          title = meta.title.trim();
          if (meta.favicon) {
            setCachedFavicon(url, meta.favicon, true);
          }
        }
      } catch {
        // fallback: use hostname
      }
      if (!title) {
        title = hostnameFromUrl(url) || url;
      }
      if (!getCachedFavicon(url)) {
        const googleFavicon = getGoogleFaviconUrl(url);
        if (googleFavicon) {
          setCachedFavicon(url, googleFavicon, true);
        }
      }
      setIsCreatingTab(false);
      setCreateTabDialog({ open: false });
      browserOpenTab(url, title, folderId ? undefined : workspaceId, folderId || undefined);
      bookmarkNewTab(workspaceId, folderId);
    },
    [browserOpenTab, createTabDialog, bookmarkNewTab]
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
    (name: string, url: string) => {
      const { tabId } = editTabDialog;
      if (tabId) {
        browserUpdateTab(tabId, { title: name.trim() || undefined, url: url.trim() || undefined });
      }
      setEditTabDialog({ open: false, tabId: '', name: '', url: '' });
    },
    [editTabDialog, browserUpdateTab]
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
    (folderPath: string | null) => {
      if (pendingBookmark) {
        const trimmedName = bookmarkName.trim();
        const title = trimmedName || pendingBookmark.title;

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
              useAppStore.getState().browserBookmarkTab(tabId, folderId);
            } else if (folderPath.startsWith('workspace:')) {
              const workspaceId = folderPath.slice('workspace:'.length);
              useAppStore.getState().browserBookmarkTab(tabId, undefined, undefined, workspaceId);
            }
            if (trimmedName && pendingBookmark.url) {
              useAppStore.getState().browserUpdateBookmarkTitle(pendingBookmark.url, trimmedName);
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

      let url = '';
      if (folderPath.startsWith('folder:')) {
        const folderId = folderPath.slice('folder:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, folderId);
        url = activeTab.url ?? '';
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else if (folderPath.startsWith('workspace:')) {
        const workspaceId = folderPath.slice('workspace:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, undefined, undefined, workspaceId);
        url = activeTab.url ?? '';
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
      const trimmedName = bookmarkName.trim();
      if (trimmedName && url) {
        useAppStore.getState().browserUpdateBookmarkTitle(url, trimmedName);
      }
    },
    [activeTab, showToast, t, bookmarkName, pendingBookmark]
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
