import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { WorkspaceID } from '../../../shared/branded';
import { clearError, captureError } from '../shared';
import { scheduleCrossSliceWrite } from '../storageHelpers';
import { stripWorkspaceFromBrowserState } from './browserCleanupHelpers';
const SCOPE = 'browser';

export function createBrowserCleanupActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [cleanupRemovedWorkspaceTree - 清理已移除工作区的状态缓存]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.recentWorkspaces, browserSlice.browserTabs, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId, browserSlice.browserWorkspaceBookmarks, gitVisSlice.gitVisData/gitVisLoading/gitVisErrors/gitVisTimeRange, uiSlice.activeWorkspaceTab
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTreeExpandedInFileNav, browserSlice.browserTabs, browserSlice.browserTabsById, browserSlice.browserTabFolders, browserSlice.browserWorkspaceExpanded, browserSlice.browserActiveTabId, browserSlice.browserWorkspaceBookmarks, gitVisSlice.gitVisData/gitVisLoading/gitVisErrors/gitVisTimeRange, uiSlice.activeWorkspaceTab
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

      // 彻底移出工作区：同时清理 Git 可视化该工作区的数据缓存，
      // 并重置 activeWorkspaceTab（若仍指向被移出的工作区），避免残留 tab。
      const activeWorkspaceTab =
        state.activeWorkspaceTab === workspaceId
          ? (state.recentWorkspaces.find((w) => w.id !== workspaceId)?.id ?? '')
          : state.activeWorkspaceTab;
      get().clearWorkspaceGitVisData(workspaceId as string);
      if (activeWorkspaceTab !== state.activeWorkspaceTab) {
        get().setActiveWorkspaceTab(activeWorkspaceTab);
      }

      get().setWorkspaceTreeExpandedInFileNav(restExpanded);

      set({
        workspaceTrees: restTrees,
        workspaceTreeLoading: restLoading,
        workspaceTreeErrors: restErrors,
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
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.removeFromSidebar(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ recentWorkspaces: result.data });
      get().cleanupRemovedWorkspaceTree(workspaceId);
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id === workspaceId) {
        await get().clearWorkspaceContext();
      }
    },
  };
}
