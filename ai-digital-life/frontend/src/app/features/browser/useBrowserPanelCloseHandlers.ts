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
      // 中心标签不受面板批量关闭影响：只销毁面板标签的原生 WebView / iframe。
      const tabIdsToDestroy = beforeState.browserTabs
        .filter((t) => t.location !== 'center')
        .map((t) => t.id);
      originalCloseAllTabs(workspaceId);
      if (!workspaceId) {
        if (useAppStore.getState().isTauri) {
          for (const tid of tabIdsToDestroy) {
            removeFromPool(tid);
          }
        } else {
          const destroySet = new Set(tabIdsToDestroy);
          document.querySelectorAll<HTMLIFrameElement>('.adl-browser-iframe').forEach((el) => {
            const tabId = el.getAttribute('data-tab-id');
            if (!tabId || !destroySet.has(tabId)) {
              return;
            }
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
