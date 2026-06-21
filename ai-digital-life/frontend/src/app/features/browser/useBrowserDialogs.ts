import { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { hostnameFromUrl } from '../../utils/browserDisplayUtils';
import {
  getCachedFavicon,
  setCachedFavicon,
  prefetchPageMeta,
  lockTabTitle,
} from '../../utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '../../utils/favicon';
import type { ToastType } from '../../components/Toast';

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

  const handleCreateTabConfirm = useCallback(
    async (name: string, url: string) => {
      const { workspaceId } = createTabDialog;
      const folderId = pendingFolderIdRef.current;
      pendingFolderIdRef.current = '';
      if (name.trim()) {
        setCreateTabDialog({ open: false });
        browserOpenTab(url, name, folderId ? undefined : workspaceId, folderId || undefined);
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
      const tabId = useAppStore.getState().browserActiveTabId;
      if (tabId) {
        lockTabTitle(tabId);
      }
    },
    [browserOpenTab, createTabDialog]
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
        if (name.trim()) {
          lockTabTitle(tabId);
        }
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

  const handleOpenBookmarkDialog = useCallback(() => {
    if (isBookmarked) {
      useAppStore.getState().browserToggleBookmark();
      return;
    }
    setBookmarkDialogOpen(true);
  }, [isBookmarked]);

  const handleBookmarkAddToFolder = useCallback(
    (folderPath: string | null) => {
      if (!folderPath) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }
      if (!activeTab?.id) {
        showToast(t.browserSelectDirFirst, 'warning');
        return;
      }

      if (folderPath.startsWith('folder:')) {
        const folderId = folderPath.slice('folder:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, folderId);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else if (folderPath.startsWith('workspace:')) {
        const workspaceId = folderPath.slice('workspace:'.length);
        useAppStore.getState().browserBookmarkTab(activeTab.id, undefined, undefined, workspaceId);
        showToast(t.browserBookmarkAddedToast, 'success');
        setBookmarkDialogOpen(false);
      } else {
        showToast(t.browserSelectDirFirst, 'warning');
      }
    },
    [activeTab, showToast, t]
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
    handleOpenBookmarkDialog,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
  };
}
