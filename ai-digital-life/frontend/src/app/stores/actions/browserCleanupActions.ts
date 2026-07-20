import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { WorkspaceID } from '../../../shared/branded';
import { clearError, captureError } from '../shared';
import { scheduleCrossSliceWrite } from '../storageHelpers';
import { stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

export function createBrowserCleanupActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [cleanupRemovedWorkspaceTree - 清理已移除工作区的状态缓存]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, browserSlice.browserTabs, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId, browserSlice.browserWorkspaceBookmarks
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, browserSlice.browserTabs, browserSlice.browserTabsById, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId, browserSlice.browserWorkspaceBookmarks
     * @see — 无桥接调用 (本地内存清理)
     */
    cleanupRemovedWorkspaceTree: (workspaceId: WorkspaceID) => {
      const state = get();
      const { [workspaceId]: _omit, ...restTrees } = state.workspaceTrees;
      const { [workspaceId]: _omitLoading, ...restLoading } = state.workspaceTreeLoading;
      const { [workspaceId]: _omitErrors, ...restErrors } = state.workspaceTreeErrors;
      const { [workspaceId]: _omitExpanded, ...restExpanded } =
        state.workspaceTreeExpandedInFileNav;

      const cleaned = stripWorkspaceFromBrowserState(
        workspaceId,
        state.browserTabs,
        state.browserTabFolders,
        state.browserWorkspaceExpanded,
        state.browserWorkspaceBookmarks,
        state.browserActiveTabId,
      );

      scheduleCrossSliceWrite('adl-ui:browser-tabs', cleaned.browserTabs);
      scheduleCrossSliceWrite('adl-ui:browser-tab-folders', cleaned.browserTabFolders);
      scheduleCrossSliceWrite(
        'adl-ui:browser-workspace-expanded',
        cleaned.browserWorkspaceExpanded,
      );
      scheduleCrossSliceWrite('adl-ui:browser-active-tab', cleaned.browserActiveTabId);
      scheduleCrossSliceWrite(
        'adl-ui:browser-workspace-bookmarks',
        cleaned.browserWorkspaceBookmarks,
      );

      set({
        workspaceTrees: restTrees,
        workspaceTreeLoading: restLoading,
        workspaceTreeErrors: restErrors,
        workspaceTreeExpandedInFileNav: restExpanded,
        browserTabs: cleaned.browserTabs,
        browserTabsById: cleaned.browserTabsById,
        browserTabFolders: cleaned.browserTabFolders,
        browserWorkspaceExpanded: cleaned.browserWorkspaceExpanded,
        browserWorkspaceBookmarks: cleaned.browserWorkspaceBookmarks,
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
    removeWorkspaceFromSidebar: async (workspaceId: WorkspaceID) => {
      clearError(get);
      const result = await window.digitalLife.workspace.removeFromSidebar(workspaceId as string);
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
    hideWorkspaceFromRightPanels: async (workspaceId: WorkspaceID) => {
      clearError(get);
      const result = await window.digitalLife.workspace.hideFromRightPanels(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
    },
  };
}
