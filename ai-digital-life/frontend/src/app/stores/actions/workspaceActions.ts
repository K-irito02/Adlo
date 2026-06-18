import type { StoreState } from '../StoreState';
import type { ReorderWorkspacesInput, WorkspaceTreeNode } from '@ai-digital-life/kernel';
import {
  getWorkspaceCachePrefix,
  getNextWorkspaceRequestSeq,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  getNextSessionRequestSeq,
  clearWorkspaceCaches,
  workspaceRequestSeq,
  batchExpandAll,
  expandSingle,
  createLazyLoader,
  clearError,
  captureError,
} from '../shared';
import type { StoreApi } from 'zustand';
import { stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

// Re-export for backward compatibility (tests import from workspaceActions)
export { type BrowserCleanupResult, stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

export function createWorkspaceActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    /**
     * [renameWorkspaceFile - 重命名工作区中的文件]
     * @reads editorSlice.selectedFilePath
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @writes editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.openTabs (通过 openFile)
     * @see shared/ipc.ts → workspace.renameFile
     * @see mock-bridge.ts → workspace.renameFile
     * @see preview-bridge/index.ts → workspace.renameFile
     */
    renameWorkspaceFile: async (relativePath: string, newName: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.renameFile(relativePath, newName);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().refreshWorkspaceTree();
      const currentPath = get().selectedFilePath;
      if (currentPath) {
        const parts = currentPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        if (currentPath === relativePath) {
          await get().openFile(newPath);
        }
      }
    },

    /**
     * [deleteWorkspaceFile - 删除工作区中的文件]
     * @reads editorSlice.selectedFilePath, editorSlice.openTabs
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @writes editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.openTabs
     * @see shared/ipc.ts → workspace.deleteFile
     * @see mock-bridge.ts → workspace.deleteFile
     * @see preview-bridge/index.ts → workspace.deleteFile
     */
    deleteWorkspaceFile: async (relativePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.deleteFile(relativePath);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().refreshWorkspaceTree();
      const currentPath = get().selectedFilePath;
      if (currentPath === relativePath) {
        set({
          selectedFilePath: undefined,
          fileContent: undefined,
          openTabs: get().openTabs.filter((t) => t.path !== relativePath),
        });
      }
    },

    /**
     * [moveWorkspaceFile - 移动工作区中的文件]
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @see shared/ipc.ts → workspace.moveFile
     * @see mock-bridge.ts → workspace.moveFile
     * @see preview-bridge/index.ts → workspace.moveFile
     */
    moveWorkspaceFile: async (relativePath: string, newPath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.moveFile(relativePath, newPath);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().refreshWorkspaceTree();
    },

    /**
     * [duplicateWorkspaceFile - 复制工作区中的文件]
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @see shared/ipc.ts → workspace.duplicateFile
     * @see mock-bridge.ts → workspace.duplicateFile
     * @see preview-bridge/index.ts → workspace.duplicateFile
     */
    duplicateWorkspaceFile: async (srcRelativePath: string, dstRelativePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.duplicateFile(
        srcRelativePath,
        dstRelativePath
      );
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().refreshWorkspaceTree();
    },

    /**
     * [openWorkspace - 打开指定路径的工作区]
     * @reads workspaceSlice.appInfo
     * @writes (通过 bootstrap) 完整的应用状态
     * @see shared/ipc.ts → workspace.open
     * @see mock-bridge.ts → workspace.open
     * @see preview-bridge/index.ts → workspace.open
     */
    openWorkspace: async (workspacePath: string) => {
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      clearError(get);
      const result = await window.digitalLife.workspace.open(workspacePath);
      if (requestSeq !== workspaceRequestSeq) {
        return { ok: false, error: 'Request superseded' };
      }
      if (!result.ok) {
        captureError(get, result.error);
        return { ok: false, error: result.error.message };
      }
      await get().bootstrap();

      return { ok: true };
    },

    /**
     * [clearWorkspaceContext - 清除当前工作区上下文]
     * @reads workspaceSlice.appInfo
     * @writes (通过 bootstrap) 完整的应用状态
     * @see shared/ipc.ts → workspace.clearCurrent
     * @see mock-bridge.ts → workspace.clearCurrent
     * @see preview-bridge/index.ts → workspace.clearCurrent
     */
    clearWorkspaceContext: async () => {
      const requestSeq = getNextWorkspaceRequestSeq();
      clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
      getNextFileRequestSeq();
      getNextChangePreviewRequestSeq();
      getNextSessionRequestSeq();
      clearError(get);
      const result = await window.digitalLife.workspace.clearCurrent();
      if (requestSeq !== workspaceRequestSeq) {
        return;
      }
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      await get().bootstrap();
    },

    /**
     * [pickWorkspaceDirectory - 弹出目录选择器选择工作区目录]
     * @reads — 无
     * @writes — 无
     * @see shared/ipc.ts → workspace.pickDirectory
     * @see mock-bridge.ts → workspace.pickDirectory
     * @see preview-bridge/index.ts → workspace.pickDirectory
     */
    pickWorkspaceDirectory: async () => {
      clearError(get);
      const result = await window.digitalLife.workspace.pickDirectory();
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
      return result.data?.trim() || undefined;
    },

    /**
     * [pinWorkspace - 置顶工作区]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.pin
     * @see mock-bridge.ts → workspace.pin
     * @see preview-bridge/index.ts → workspace.pin
     */
    pinWorkspace: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.pin(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    /**
     * [unpinWorkspace - 取消置顶工作区]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.unpin
     * @see mock-bridge.ts → workspace.unpin
     * @see preview-bridge/index.ts → workspace.unpin
     */
    unpinWorkspace: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.unpin(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
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
     * [reorderWorkspaces - 重新排序工作区列表]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.reorder
     * @see mock-bridge.ts → workspace.reorder
     * @see preview-bridge/index.ts → workspace.reorder
     */
    reorderWorkspaces: async (input: ReorderWorkspacesInput) => {
      clearError(get);
      const result = await window.digitalLife.workspace.reorder(input);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    /**
     * [revealWorkspaceInFileManager - 在系统文件管理器中显示工作区目录]
     * @reads — 无
     * @writes — 无
     * @see shared/ipc.ts → workspace.revealInFileManager
     * @see mock-bridge.ts → workspace.revealInFileManager
     * @see preview-bridge/index.ts → workspace.revealInFileManager
     */
    revealWorkspaceInFileManager: async (workspacePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.revealInFileManager(workspacePath);
      if (!result.ok) {
        captureError(get, result.error);
      }
    },

    /**
     * [refreshWorkspaceTree - 刷新当前工作区的文件树]
     * @reads workspaceSlice.appInfo, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTrees
     * @see shared/ipc.ts → workspace.listTree
     * @see mock-bridge.ts → workspace.listTree
     * @see preview-bridge/index.ts → workspace.listTree
     */
    refreshWorkspaceTree: async () => {
      clearError(get);
      const result = await window.digitalLife.workspace.listTree();
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      const appInfo = get().appInfo;
      if (appInfo?.currentWorkspace?.id) {
        set({
          workspaceTrees: {
            ...get().workspaceTrees,
            [appInfo.currentWorkspace.id]: result.data,
          },
        });
      }
    },

    /**
     * [loadWorkspaceTree - 懒加载指定工作区的文件树]
     * @reads workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading
     * @writes workspaceSlice.workspaceTrees, workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     */
    loadWorkspaceTree: createLazyLoader<WorkspaceTreeNode[]>(
      (path) => window.digitalLife.workspace.listTreeForWorkspace(path),
      (s, id) => ({ hasData: !!s.workspaceTrees[id], isLoading: !!s.workspaceTreeLoading[id] }),
      (g, id) => ({
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: true },
        workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: undefined },
      }),
      (g, id, data) => ({
        workspaceTrees: { ...g().workspaceTrees, [id]: data },
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
      }),
      (g, id, message) => ({
        workspaceTreeLoading: { ...g().workspaceTreeLoading, [id]: false },
        workspaceTreeErrors: { ...g().workspaceTreeErrors, [id]: message },
      })
    )(set, get),

    /**
     * [toggleWorkspaceTreeInFileNav - 切换工作区在文件导航中的展开状态]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav
     * @see — 无桥接调用
     */
    toggleWorkspaceTreeInFileNav: (workspaceId: string) => {
      const current = get().workspaceTreeExpandedInFileNav;
      set({
        workspaceTreeExpandedInFileNav: {
          ...current,
          [workspaceId]: !current[workspaceId],
        },
      });
    },

    /**
     * [expandWorkspaceTreeInFileNav - 展开指定工作区的文件树]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees (通过 loadWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     */
    expandWorkspaceTreeInFileNav: async (workspaceId: string, workspacePath: string) => {
      const state = get();
      await expandSingle(
        state.workspaceTreeExpandedInFileNav,
        workspaceId,
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
        !!state.workspaceTrees[workspaceId],
        () => get().loadWorkspaceTree(workspaceId, workspacePath)
      );
    },

    /**
     * [refreshOneWorkspaceTree - 刷新单个工作区的文件树]
     * @reads workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees
     * @see shared/ipc.ts → workspace.listTreeForWorkspace
     * @see mock-bridge.ts → workspace.listTreeForWorkspace
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
     */
    refreshOneWorkspaceTree: async (workspaceId: string, workspacePath: string) => {
      set({
        workspaceTreeLoading: { ...get().workspaceTreeLoading, [workspaceId]: true },
        workspaceTreeErrors: { ...get().workspaceTreeErrors, [workspaceId]: undefined },
      });
      const result = await window.digitalLife.workspace.listTreeForWorkspace(workspacePath);
      const loading = { ...get().workspaceTreeLoading, [workspaceId]: false };
      if (!result.ok) {
        set({
          workspaceTreeLoading: loading,
          workspaceTreeErrors: {
            ...get().workspaceTreeErrors,
            [workspaceId]: result.error.message,
          },
        });
        return;
      }
      set({
        workspaceTrees: { ...get().workspaceTrees, [workspaceId]: result.data },
        workspaceTreeLoading: loading,
      });
    },

    /**
     * [refreshAllWorkspaceTrees - 刷新所有已展开工作区的文件树]
     * @reads workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.recentWorkspaces
     * @writes workspaceSlice.workspaceTreeLoading, workspaceSlice.workspaceTreeErrors, workspaceSlice.workspaceTrees (通过 refreshOneWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 refreshOneWorkspaceTree)
     */
    refreshAllWorkspaceTrees: async () => {
      const state = get();
      const expandedIds = Object.entries(state.workspaceTreeExpandedInFileNav)
        .filter(([, expanded]) => expanded)
        .map(([id]) => id);
      await Promise.allSettled(
        expandedIds.map((id) => {
          const ws = state.recentWorkspaces.find((r) => r.id === id);
          if (!ws) {
            return Promise.resolve();
          }
          return get().refreshOneWorkspaceTree(id, ws.path);
        })
      );
    },

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

    /**
     * [showWorkspaceInRightPanels - 在右侧面板显示工作区]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.showFromRightPanels
     * @see mock-bridge.ts → workspace.showFromRightPanels
     * @see preview-bridge/index.ts → workspace.showFromRightPanels
     */
    showWorkspaceInRightPanels: async (workspaceId: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.showInRightPanels(workspaceId);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    /**
     * [expandAllWorkspaceTreesInFileNav - 展开文件导航中所有工作区的文件树]
     * @reads workspaceSlice.recentWorkspaces, workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav, workspaceSlice.workspaceTrees (通过 loadWorkspaceTree)
     * @see shared/ipc.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see mock-bridge.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     * @see preview-bridge/index.ts → workspace.listTreeForWorkspace (通过 loadWorkspaceTree)
     */
    expandAllWorkspaceTreesInFileNav: async () => {
      const state = get();
      await batchExpandAll(
        state.recentWorkspaces,
        state.workspaceTreeExpandedInFileNav,
        (next) => set({ workspaceTreeExpandedInFileNav: next }),
        (entry) => get().loadWorkspaceTree(entry.id, entry.path),
        (id) => !!state.workspaceTrees[id]
      );
    },

    /**
     * [collapseAllWorkspaceTreesInFileNav - 折叠文件导航中所有工作区的文件树]
     * @reads — 无
     * @writes workspaceSlice.workspaceTreeExpandedInFileNav
     * @see — 无桥接调用
     */
    collapseAllWorkspaceTreesInFileNav: () => {
      set({ workspaceTreeExpandedInFileNav: {} });
    },
  };
}
