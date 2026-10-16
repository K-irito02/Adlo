import type { StoreState } from '../StoreState';
import { asWorkspaceID } from '../../../shared/branded';
import { clearError, captureError, invalidateCachedPathTree } from '../shared';
import { dropPendingEditorText } from '../cacheHelpers';
import type { StoreApi } from 'zustand';
import { createBrowserCleanupActions } from './browserCleanupActions';
import { createWorkspaceTreeActions } from './workspaceTreeActions';
import { createWorkspaceLifecycleActions } from './workspaceLifecycleActions';
import { renameTreeNodePaths, remapTreeExpansion, removeTreeNode } from './workspaceTreeRename';
import { persistField } from '../persisted/apply';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import { prunePathPrefix } from '../persisted/prune';
import { repairManualCollapsed } from '../persisted/parsers';
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
     * [carryExpandedPathsForRename - 重命名后搬运文件树展开态]
     * @reads uiSlice.expandedFileTreePaths
     * @writes uiSlice.expandedFileTreePaths（内存 + 经 persistField 落盘）
     * @see workspaceTreeRename.ts → remapTreeExpansion（搬运两侧 + 保引用等价 + 不变量修复，复用 T12 实现）
     */
    carryExpandedPathsForRename: (workspaceId: string, oldPath: string, newPath: string) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId];
        if (!current) {
          return state;
        }
        const remapped = remapTreeExpansion(current, oldPath, newPath);
        if (remapped === current) {
          return state;
        }
        return persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: remapped,
        });
      }),

    /**
     * [dropExpandedPathsUnder - 删除目录后剔除文件树展开态]
     * @writes uiSlice.expandedFileTreePaths（内存 + 经 persistField 落盘）
     * @see persisted/prune.ts → prunePathPrefix（剔除路径自身及其子孙）
     * @see persisted/parsers.ts → repairManualCollapsed（空标记归一为 undefined + 不变量修复）
     */
    dropExpandedPathsUnder: (workspaceId: string, removedPath: string) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId];
        if (!current) {
          return state;
        }
        const expandedPruned = prunePathPrefix(current.expanded, removedPath);
        const manualPruned = prunePathPrefix<Record<string, true>>(
          current.manualCollapsed ?? {},
          removedPath,
        );
        if (!expandedPruned.changed && !manualPruned.changed) {
          return state;
        }
        return persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: {
            expanded: expandedPruned.value,
            manualCollapsed: repairManualCollapsed(expandedPruned.value, manualPruned.value),
          },
        });
      }),

    /**
     * [carryChangesExpandedPathsForRename - 重命名后搬运变更树展开态]
     * 文件侧 carryExpandedPathsForRename 的同构（键 adl:changes.dirExpanded + 表 expandedChangesTreePaths）。
     */
    carryChangesExpandedPathsForRename: (workspaceId: string, oldPath: string, newPath: string) =>
      set((state) => {
        const current = state.expandedChangesTreePaths[workspaceId];
        if (!current) {
          return state;
        }
        const remapped = remapTreeExpansion(current, oldPath, newPath);
        if (remapped === current) {
          return state;
        }
        return persistField('adl:changes.dirExpanded', {
          ...state.expandedChangesTreePaths,
          [workspaceId]: remapped,
        });
      }),

    /**
     * [dropChangesExpandedPathsUnder - 删除目录后剔除变更树展开态]
     * 文件侧 dropExpandedPathsUnder 的同构。
     */
    dropChangesExpandedPathsUnder: (workspaceId: string, removedPath: string) =>
      set((state) => {
        const current = state.expandedChangesTreePaths[workspaceId];
        if (!current) {
          return state;
        }
        const expandedPruned = prunePathPrefix(current.expanded, removedPath);
        const manualPruned = prunePathPrefix<Record<string, true>>(
          current.manualCollapsed ?? {},
          removedPath,
        );
        if (!expandedPruned.changed && !manualPruned.changed) {
          return state;
        }
        return persistField('adl:changes.dirExpanded', {
          ...state.expandedChangesTreePaths,
          [workspaceId]: {
            expanded: expandedPruned.value,
            manualCollapsed: repairManualCollapsed(expandedPruned.value, manualPruned.value),
          },
        });
      }),

    /**
     * [renameWorkspaceFile - 重命名工作区中的文件]
     * @reads editorSlice.selectedFilePath
     * @writes workspaceSlice.workspaceTrees (乐观重命名节点 + refreshTreeByWorkspacePath 静默校准)
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
          get().carryExpandedPathsForRename(workspaceId, relativePath, newPath);
        }
        get().carryChangesExpandedPathsForRename(ws.id, relativePath, newPath);
        if (get().filePreviewModeByPath[ws.id]?.[relativePath] !== undefined) {
          get().carryFilePreviewModeForRename(ws.id, relativePath, newPath);
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
      const result = await window.digitalLife.workspace.deleteFile(relativePath, workspacePath);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        // 删除失败：刷新以恢复乐观移除的节点。
        await refreshTreeByWorkspacePath(get, workspacePath);
        return;
      }
      // 删除成功后：被删路径自身及子孙的标签一律关闭（收尾 F-19：
      // 此前仅精确路径匹配，删除文件夹时其下已打开文件的残留标签点击即跌入失败视图），
      // 再清空当前文件内容。路径归一化复用编辑器脏路径同口径。
      const normDeleted = normalizeWorkspaceRelativePath(relativePath);
      const isUnderDeleted = (p: string) => {
        const norm = normalizeWorkspaceRelativePath(p);
        return norm === normDeleted || norm.startsWith(`${normDeleted}/`);
      };
      set({
        openTabs: get().openTabs.filter((t) => !isUnderDeleted(t.path)),
      });
      // P4 F2/F12：删暂存草稿 + 脏标记（防下次 flush 复活文件）；
      // 选中/外部态按同一后代边界清理（P4 F12，归一化比较）。
      // P4 N3/L5：回落链——显式工作区 > 被删即选中文件所属 > 当前（未知条目不再默认清当前区）；
      // 缓存失效与暂存清理共用同一 dropWsId（此前两段回落不一致）。
      const selectedNow = get().selectedFilePath;
      const dropWsId =
        ws?.id ??
        (selectedNow !== undefined && normalizeWorkspaceRelativePath(selectedNow) === normDeleted
          ? get().selectedFileWorkspaceId
          : undefined) ??
        get().appInfo?.currentWorkspace?.id;
      // 失效被删路径（含后代）的文件/预览缓存，防旧内容复活。
      invalidateCachedPathTree(dropWsId ?? 'global', relativePath);
      // 删除成功后：剔除被删路径自身及其子孙的展开态（内存 + 落盘），
      // 否则内存与磁盘分叉、重启后回落旧路径（与重命名搬运同一不变量）。
      if (workspaceId && ws) {
        get().dropExpandedPathsUnder(workspaceId, relativePath);
        get().dropChangesExpandedPathsUnder(ws.id, relativePath);
      }
      if (dropWsId) {
        dropPendingEditorText(dropWsId, relativePath);
      }
      set((state: StoreState) => {
        const nextDirty = state.dirtyEditorPaths.filter((p) => !isUnderDeleted(p));
        let nextExternal = state.externalFileChange;
        if (nextExternal && isUnderDeleted(nextExternal.path)) {
          nextExternal = undefined;
        }
        const selectedGone =
          state.selectedFilePath !== undefined && isUnderDeleted(state.selectedFilePath);
        if (
          nextDirty.length === state.dirtyEditorPaths.length &&
          nextExternal === state.externalFileChange &&
          !selectedGone
        ) {
          return state;
        }
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          dirtyEditorPaths: nextDirty,
          ...(selectedGone
            ? {
                selectedFilePath: undefined,
                fileContent: undefined,
                fileMedia: null,
                fileMediaLoading: false,
                fileLastModifiedAt: undefined,
                outline: [],
              }
            : {}),
          externalFileChange: nextExternal,
        };
      });
      await refreshTreeByWorkspacePath(get, workspacePath);
    },

    /**
     * [moveWorkspaceFile - 移动工作区中的文件]
     * @writes workspaceSlice.workspaceTrees (通过 refreshTreeByWorkspacePath 静默校准)
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
     * @writes workspaceSlice.workspaceTrees (通过 refreshTreeByWorkspacePath 静默校准)
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
      const result = await window.digitalLife.workspace.listTree({ force: true });
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      const appInfo = get().appInfo;
      // 畸形载荷显式判 miss（F7）：`data?.tree` 失格即记错，不写脏树。
      const freshTree = result.data?.tree;
      if (!Array.isArray(freshTree)) {
        captureError(get, new Error('malformed tree payload'), SCOPE);
        return;
      }
      if (appInfo?.currentWorkspace?.id) {
        set({
          workspaceTrees: {
            ...get().workspaceTrees,
            [appInfo.currentWorkspace.id]: freshTree,
          },
        });
      }
    },
  };
}
