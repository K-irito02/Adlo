import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import { clearError, captureError } from '../shared';
import { stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

export function createBrowserCleanupActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    /**
     * [cleanupRemovedWorkspaceTree - 清理已移除工作区的状态缓存]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, browserSlice.browserTabs, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, browserSlice.browserTabs, browserSlice.browserTabsById, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId
     * @see — 无桥接调用 (本地内存清理)
     */
    cleanupRemovedWorkspaceTree: (workspaceId: string) => {
      const state = get();
      const { [workspaceId]: _omit, ...restTrees } = state.workspaceTrees;
      const { [workspaceId]: _omitLoading, ...restLoading } = state.workspaceTreeLoading;
      const { [workspaceId]: _omitErrors, ...restErrors } = state.workspaceTreeErrors;
      const { [workspaceId]: _omitExpanded, ...restExpanded } =
        state.workspaceTreeExpandedInFileNav;

      // Strip this workspace's data from the in-memory browser state so the
      // navigator (workspace tree) and per-workspace expansion map do not
      // retain references to a deleted workspace.
      const cleaned = stripWorkspaceFromBrowserState(
        workspaceId,
        state.browserTabs,
        state.browserTabFolders,
        state.browserWorkspaceExpanded,
        state.browserActiveTabId
      );

      // Persist the filtered slices back to localStorage so the cleanup
      // survives page reload.
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('adl-ui:browser-tabs', JSON.stringify(cleaned.browserTabs));
          localStorage.setItem(
            'adl-ui:browser-tab-folders',
            JSON.stringify(cleaned.browserTabFolders)
          );
          localStorage.setItem(
            'adl-ui:browser-workspace-expanded',
            JSON.stringify(cleaned.browserWorkspaceExpanded)
          );
          localStorage.setItem(
            'adl-ui:browser-active-tab',
            JSON.stringify(cleaned.browserActiveTabId)
          );
        } catch {
          /* localStorage unavailable (private mode) — in-memory state still updated */
        }
      }

      set({
        workspaceTrees: restTrees,
        workspaceTreeLoading: restLoading,
        workspaceTreeErrors: restErrors,
        workspaceTreeExpandedInFileNav: restExpanded,
        browserTabs: cleaned.browserTabs,
        browserTabsById: cleaned.browserTabsById,
        browserTabFolders: cleaned.browserTabFolders,
        browserWorkspaceExpanded: cleaned.browserWorkspaceExpanded,
        browserActiveTabId: cleaned.browserActiveTabId,
      });
    },

    /**
     * [removeWorkspaceFromSidebar - 从侧边栏移除工作区]
     * @reads workspaceSlice.appInfo
     * @writes workspaceSlice.recentWorkspaces, workspaceSlice.workspaceTrees, browserSlice.browserTabs (通过 cleanupRemovedWorkspaceTree)
     * @see shared/ipc.ts → workspace.removeFromSidebar
     * @see mock-bridge.ts → workspace.removeFromSidebar
     * @see preview-bridge/index.ts → workspace.removeFromSidebar
     */
    removeWorkspaceFromSidebar: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.removeFromSidebar(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id === workspaceId) {
        await get().clearWorkspaceContext();
      }
    },

    /**
     * [hideWorkspaceFromRightPanels - 从右侧面板隐藏工作区]
     * @writes workspaceSlice.recentWorkspaces, workspaceSlice.workspaceTrees (通过 cleanupRemovedWorkspaceTree), browserSlice.browserTabs (通过 cleanupRemovedWorkspaceTree)
     * @see shared/ipc.ts → workspace.hideFromRightPanels
     * @see mock-bridge.ts → workspace.hideFromRightPanels
     * @see preview-bridge/index.ts → workspace.hideFromRightPanels
     */
    hideWorkspaceFromRightPanels: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.hideFromRightPanels(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
    },
  };
}
