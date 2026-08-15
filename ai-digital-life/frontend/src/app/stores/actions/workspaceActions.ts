import type { StoreState } from '../StoreState';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import type { WorkspaceID } from '../../../shared/branded';
import { clearError, captureError } from '../shared';
import type { StoreApi } from 'zustand';
import { createBrowserCleanupActions } from './browserCleanupActions';
import { createWorkspaceTreeActions } from './workspaceTreeActions';
import { createWorkspaceLifecycleActions } from './workspaceLifecycleActions';
const SCOPE = 'workspace';

// Re-export for test convenience (tests import from workspaceActions)
export { type BrowserCleanupResult, stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

export function createWorkspaceActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    ...createBrowserCleanupActions(set, get),
    ...createWorkspaceTreeActions(set, get),
    ...createWorkspaceLifecycleActions(set, get),

    /**
     * [renameWorkspaceFile - 重命名工作区中的文件]
     * @reads editorSlice.selectedFilePath
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree / refreshOneWorkspaceTree)
     * @writes editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.openTabs (通过 openFile)
     * @see shared/ipc.ts → workspace.renameFile
     * @see mock-bridge.ts → workspace.renameFile
     * @see preview-bridge/index.ts → workspace.renameFile
     */
    renameWorkspaceFile: async (relativePath: string, newName: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.renameFile(
        relativePath,
        newName,
        workspacePath,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      if (workspacePath) {
        const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
        if (ws) {
          await get().refreshOneWorkspaceTree(ws.id as unknown as WorkspaceID, workspacePath);
        }
      } else {
        await get().refreshWorkspaceTree();
      }
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
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree / refreshOneWorkspaceTree)
     * @writes editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.openTabs
     * @see shared/ipc.ts → workspace.deleteFile
     * @see mock-bridge.ts → workspace.deleteFile
     * @see preview-bridge/index.ts → workspace.deleteFile
     */
    deleteWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.deleteFile(relativePath, workspacePath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      if (workspacePath) {
        const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
        if (ws) {
          await get().refreshOneWorkspaceTree(ws.id as unknown as WorkspaceID, workspacePath);
        }
      } else {
        await get().refreshWorkspaceTree();
      }
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
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree / refreshOneWorkspaceTree)
     * @see shared/ipc.ts → workspace.moveFile
     * @see mock-bridge.ts → workspace.moveFile
     * @see preview-bridge/index.ts → workspace.moveFile
     */
    moveWorkspaceFile: async (relativePath: string, newPath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.moveFile(
        relativePath,
        newPath,
        workspacePath,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      if (workspacePath) {
        const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
        if (ws) {
          await get().refreshOneWorkspaceTree(ws.id as unknown as WorkspaceID, workspacePath);
        }
      } else {
        await get().refreshWorkspaceTree();
      }
    },

    /**
     * [duplicateWorkspaceFile - 复制工作区中的文件]
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree / refreshOneWorkspaceTree)
     * @see shared/ipc.ts → workspace.duplicateFile
     * @see mock-bridge.ts → workspace.duplicateFile
     * @see preview-bridge/index.ts → workspace.duplicateFile
     */
    duplicateWorkspaceFile: async (
      srcRelativePath: string,
      dstRelativePath: string,
      workspacePath?: string,
    ) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.duplicateFile(
        srcRelativePath,
        dstRelativePath,
        workspacePath,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      if (workspacePath) {
        const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
        if (ws) {
          await get().refreshOneWorkspaceTree(ws.id as unknown as WorkspaceID, workspacePath);
        }
      } else {
        await get().refreshWorkspaceTree();
      }
    },

    /**
     * [pinWorkspace - 置顶工作区]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.pin
     * @see mock-bridge.ts → workspace.pin
     * @see preview-bridge/index.ts → workspace.pin
     */
    pinWorkspace: async (workspaceId: WorkspaceID) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.pin(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
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
    unpinWorkspace: async (workspaceId: WorkspaceID) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.unpin(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ recentWorkspaces: result.data });
    },

    /**
     * [reorderWorkspaces - 重新排序工作区列表]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.reorder
     * @see mock-bridge.ts → workspace.reorder
     * @see preview-bridge/index.ts → workspace.reorder
     */
    reorderWorkspaces: async (input: ReorderWorkspacesInput) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.reorder(input);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
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
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.revealInFileManager(workspacePath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
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
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.listTree();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
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
     * [showWorkspaceInRightPanels - 在右侧面板显示工作区]
     * @writes workspaceSlice.recentWorkspaces
     * @see shared/ipc.ts → workspace.showFromRightPanels
     * @see mock-bridge.ts → workspace.showFromRightPanels
     * @see preview-bridge/index.ts → workspace.showFromRightPanels
     */
    showWorkspaceInRightPanels: async (workspaceId: WorkspaceID) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.showInRightPanels(workspaceId as string);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ recentWorkspaces: result.data });
    },
  };
}
