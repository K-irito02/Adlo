import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';

interface UseBrowserPanelCloseHandlersParams {
  handleCloseTab: (tabId: string) => void;
  originalCloseAllTabs: (workspaceId?: string) => void;
  originalClearTabDirectories: () => void;
  removeFromPool: (tabId: string) => void;
}

export function useBrowserPanelCloseHandlers({
  handleCloseTab,
  originalCloseAllTabs,
  originalClearTabDirectories,
  removeFromPool,
}: UseBrowserPanelCloseHandlersParams): {
  wrappedHandleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: (workspaceId?: string) => void;
  handleClearTabDirectories: () => void;
} {
  const wrappedHandleCloseTab = useCallback(
    (tabId: string) => {
      handleCloseTab(tabId);
      // removeFromPool = destroyTabWebView, 在 Tauri 模式下销毁 WebView 并停止音频
      removeFromPool(tabId);
    },
    [handleCloseTab, removeFromPool],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const beforeState = useAppStore.getState();
      const tabIdsToDestroy = beforeState.browserTabs.map((t) => t.id);
      originalCloseAllTabs(workspaceId);
      if (!workspaceId) {
        if (useAppStore.getState().isTauri) {
          for (const tid of tabIdsToDestroy) {
            removeFromPool(tid);
          }
        } else {
          document.querySelectorAll<HTMLIFrameElement>('.adl-browser-iframe').forEach((el) => {
            try {
              el.src = 'about:blank';
            } catch {
              /* ignore */
            }
          });
        }
      }
    },
    [originalCloseAllTabs, removeFromPool],
  );

  const handleClearTabDirectories = useCallback(() => {
    originalClearTabDirectories();
    const s = useAppStore.getState();
    s.browserClearAllWorkspaceBookmarks?.();
    // Safety sweep: remove any bookmark URLs that remained orphaned after
    // the workspace bookmark nuke (e.g. star-button bookmarks not in folders).
    s.browserRemoveOrphanedBookmarks?.();
  }, [originalClearTabDirectories]);

  return { wrappedHandleCloseTab, handleCloseAllTabs, handleClearTabDirectories };
}
