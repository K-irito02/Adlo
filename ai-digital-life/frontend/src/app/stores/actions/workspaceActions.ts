import type { StoreState } from '../StoreState';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { asWorkspaceID, type WorkspaceID } from '../../../shared/branded';
import { clearError, captureError } from '../shared';
import type { StoreApi } from 'zustand';
import { createBrowserCleanupActions } from './browserCleanupActions';
import { createWorkspaceTreeActions } from './workspaceTreeActions';
import { createWorkspaceLifecycleActions } from './workspaceLifecycleActions';
import { renameTreeNodePaths, remapExpandedTreePaths, removeTreeNode } from './workspaceTreeRename';
const SCOPE = 'workspace';

// Re-export for test convenience (tests import from workspaceActions)
export { type BrowserCleanupResult, stripWorkspaceFromBrowserState } from './browserCleanupHelpers';

/**
 * 按工作区路径刷新对应文件树；找不到对应工作区或未提供路径时降级为全量刷新。
 */
export async function refreshTreeByWorkspacePath(get: () => StoreState, workspacePath?: string) {
  if (!workspacePath) {
    await get().refreshWorkspaceTree();
    return;
  }
  const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
  if (ws) {
    // 自动刷新（重命名/删除/移动/复制后）为静默刷新，不触发刷新按钮旋转
    await get().refreshOneWorkspaceTree(asWorkspaceID(ws.id), workspacePath, { silent: true });
  } else {
    await get().refreshWorkspaceTree();
  }
}

export type PostRenameOpenTarget =
  | { kind: 'openFileForWorkspace'; workspaceId: string; workspacePath: string; path: string }
  | { kind: 'openFile'; path: string };

/**
 * 决定重命名成功后是否重新打开被重命名的文件。
 * 若被重命名的正是当前打开文件，且已知其工作区路径，则用带显式工作区的
 * openFileForWorkspace（避免走无 path 的 readFile 依赖服务端 active workspace）；
 * 否则回退为无 path 的 openFile。
 */
export function resolvePostRenameOpenTarget(
  currentPath: string | undefined,
  relativePath: string,
  newName: string,
  workspacePath: string | undefined,
  recentWorkspaces: { id: string; path: string }[],
): PostRenameOpenTarget | null {
  if (!currentPath || currentPath !== relativePath) {
    return null;
  }
  const parts = currentPath.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');
  const ws = workspacePath ? recentWorkspaces.find((r) => r.path === workspacePath) : undefined;
  if (ws && workspacePath) {
    return { kind: 'openFileForWorkspace', workspaceId: ws.id, workspacePath, path: newPath };
  }
  return { kind: 'openFile', path: newPath };
}

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
      const segments = relativePath.split('/');
      segments[segments.length - 1] = newName;
      const newPath = segments.join('/');
      const ws = workspacePath
        ? get().recentWorkspaces.find((r) => r.path === workspacePath)
        : undefined;
      if (ws) {
        const workspaceId = asWorkspaceID(ws.id);
        const tree = get().workspaceTrees[workspaceId];
        if (tree) {
          set({
            workspaceTrees: {
              ...get().workspaceTrees,
              [workspaceId]: renameTreeNodePaths(tree, relativePath, newPath),
            },
          });
          const expandedForWs = get().expandedFileTreePaths[workspaceId];
          if (expandedForWs) {
            const remapped = remapExpandedTreePaths(expandedForWs, relativePath, newPath);
            if (remapped !== expandedForWs) {
              set({
                expandedFileTreePaths: {
                  ...get().expandedFileTreePaths,
                  [workspaceId]: remapped,
                },
              });
            }
          }
        }
        const expandedChanges = remapExpandedTreePaths(
          get().expandedChangesTreePaths,
          relativePath,
          newPath,
        );
        if (expandedChanges !== get().expandedChangesTreePaths) {
          set({ expandedChangesTreePaths: expandedChanges });
        }
        if (get().filePreviewModeByPath[relativePath] !== undefined) {
          get().carryFilePreviewModeForRename(relativePath, newPath);
        }
      }
      void refreshTreeByWorkspacePath(get, workspacePath);
      const target = resolvePostRenameOpenTarget(
        get().selectedFilePath,
        relativePath,
        newName,
        workspacePath,
        get().recentWorkspaces,
      );
      if (target) {
        if (target.kind === 'openFileForWorkspace') {
          await get().openFileForWorkspace(target.workspaceId, target.workspacePath, target.path);
        } else {
          await get().openFile(target.path);
        }
      }
    },

    /**
     * [deleteWorkspaceFile - 删除工作区中的文件]
     * @reads editorSlice.selectedFilePath, editorSlice.openTabs
     * @writes workspaceSlice.workspaceTrees (乐观移除节点 + refreshTreeByWorkspacePath 校准)
     * @writes editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.openTabs
     * @see shared/ipc.ts → workspace.deleteFile
     * @see mock-bridge.ts → workspace.deleteFile
     * @see preview-bridge/index.ts → workspace.deleteFile
     */
    deleteWorkspaceFile: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      // 乐观更新：先从文件树移除节点，让 UI 立即反馈，再异步删除并以刷新校准结果。
      const ws = workspacePath
        ? get().recentWorkspaces.find((r) => r.path === workspacePath)
        : undefined;
      const workspaceId = ws ? asWorkspaceID(ws.id) : undefined;
      if (workspaceId && get().workspaceTrees[workspaceId]) {
        set({
          workspaceTrees: {
            ...get().workspaceTrees,
            [workspaceId]: removeTreeNode(get().workspaceTrees[workspaceId], relativePath),
          },
        });
      }
      const currentPath = get().selectedFilePath;
      const result = await window.digitalLife.workspace.deleteFile(relativePath, workspacePath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        // 删除失败：刷新以恢复乐观移除的节点。
        await refreshTreeByWorkspacePath(get, workspacePath);
        return;
      }
      // 删除成功后，若被删除的正是当前打开文件，则关闭编辑器标签并清空其内容。
      if (currentPath === relativePath) {
        set({
          selectedFilePath: undefined,
          fileContent: undefined,
          openTabs: get().openTabs.filter((t) => t.path !== relativePath),
        });
      }
      await refreshTreeByWorkspacePath(get, workspacePath);
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
      await refreshTreeByWorkspacePath(get, workspacePath);
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
      await refreshTreeByWorkspacePath(get, workspacePath);
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
