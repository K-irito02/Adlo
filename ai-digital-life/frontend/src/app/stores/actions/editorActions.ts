import type { StoreState } from '../StoreState';
import { createEditorTab } from '@utils/editorTabs';
import { buildOutlineFromContent } from '@shared/outline';
import { normalizeWorkspaceRelativePath, mergeDirtyEditorPaths } from '@utils/workspacePaths';
import {
  getWorkspaceScopedCacheKey,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
} from '../shared';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../cacheHelpers';
import { openFileGeneric, openChangePreviewGeneric } from './editorActionsHelpers';

export function createEditorActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [openFile - 在编辑器中打开文件]
     * @reads workspaceSlice.appInfo
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.outline, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.readFile
     * @see mock-bridge.ts → workspace.readFile
     * @see preview-bridge/index.ts → workspace.readFile
     */
    openFile: async (relativePath: string) => {
      await openFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
        cacheKey: getWorkspaceScopedCacheKey(get().appInfo, relativePath),
        workspaceId: get().appInfo?.currentWorkspace?.id,
        readFile: () => window.digitalLife.workspace.readFile(relativePath),
      });
    },

    /**
     * [openFileForWorkspace - 为指定工作区打开文件]
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.selectedFileWorkspaceId, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.outline, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.readFileForWorkspace
     * @see mock-bridge.ts → workspace.readFileForWorkspace
     * @see preview-bridge/index.ts → workspace.readFileForWorkspace
     */
    openFileForWorkspace: async (
      workspaceId: string,
      workspacePath: string,
      relativePath: string,
    ) => {
      await openFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
        cacheKey: `${workspacePath}:${relativePath}`,
        workspaceId,
        readFile: () =>
          window.digitalLife.workspace.readFileForWorkspace(workspacePath, relativePath),
      });
    },

    /**
     * [openChangePreview - 打开文件变更预览]
     * @reads workspaceSlice.appInfo
     * @writes editorSlice.selectedChangePreviewPath, editorSlice.selectedChangePreviewWorkspaceId, editorSlice.changePreview, editorSlice.changePreviewLoading
     * @see shared/ipc.ts → workspace.getChangePreview
     * @see mock-bridge.ts → workspace.getChangePreview
     * @see preview-bridge/index.ts → workspace.getChangePreview
     */
    openChangePreview: async (relativePath: string) => {
      await openChangePreviewGeneric(set, get, relativePath, getNextChangePreviewRequestSeq(), {
        cacheKey: getWorkspaceScopedCacheKey(get().appInfo, relativePath),
        workspaceId: get().appInfo?.currentWorkspace?.id,
        getPreview: () => window.digitalLife.workspace.getChangePreview(relativePath),
      });
    },

    /**
     * [openChangePreviewForWorkspace - 为指定工作区打开文件变更预览]
     * @reads workspaceSlice.recentWorkspaces
     * @writes editorSlice.selectedChangePreviewPath, editorSlice.selectedChangePreviewWorkspaceId, editorSlice.changePreview, editorSlice.changePreviewLoading
     * @see shared/ipc.ts → workspace.getChangePreviewForWorkspace
     * @see mock-bridge.ts → workspace.getChangePreviewForWorkspace
     * @see preview-bridge/index.ts → workspace.getChangePreviewForWorkspace
     */
    openChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      await openChangePreviewGeneric(set, get, relativePath, getNextChangePreviewRequestSeq(), {
        cacheKey: getWorkspaceScopedCacheKey(get().appInfo, `${workspacePath}:${relativePath}`),
        workspaceId: get().recentWorkspaces.find((w) => w.path === workspacePath)?.id,
        getPreview: () =>
          window.digitalLife.workspace.getChangePreviewForWorkspace(workspacePath, relativePath),
      });
    },

    /**
     * [createWorkspaceFile - 创建工作区文件并在编辑器打开]
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.outline, editorSlice.dirtyEditorPaths, workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @see shared/ipc.ts → workspace.createFile
     * @see mock-bridge.ts → workspace.createFile
     * @see preview-bridge/index.ts → workspace.createFile
     */
    createWorkspaceFile: async (relativePath: string, content = '') => {
      clearError(get);
      const result = await window.digitalLife.workspace.createFile(relativePath, content);
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
      await get().refreshWorkspaceTree();
      const nextOutline = buildOutlineFromContent(result.data.content, relativePath);
      const norm = normalizeWorkspaceRelativePath(relativePath);
      set((state: StoreState) => {
        const nextDirty = state.dirtyEditorPaths.filter(
          (p) => normalizeWorkspaceRelativePath(p) !== norm,
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          openTabs: state.openTabs.some((tab) => tab.path === relativePath)
            ? state.openTabs
            : [...state.openTabs, createEditorTab(relativePath)],
          selectedFilePath: relativePath,
          fileContent: result.data.content,
          fileLastModifiedAt: result.data.lastModifiedAt,
          externalFileChange:
            state.externalFileChange?.path === relativePath ? undefined : state.externalFileChange,
          outline: nextOutline,
          dirtyEditorPaths: nextDirty,
        };
      });
      return relativePath;
    },

    /**
     * [createWorkspaceFolder - 创建工作区文件夹]
     * @writes workspaceSlice.workspaceTrees (通过 refreshWorkspaceTree)
     * @see shared/ipc.ts → workspace.createFolder
     * @see mock-bridge.ts → workspace.createFolder
     * @see preview-bridge/index.ts → workspace.createFolder
     */
    createWorkspaceFolder: async (relativePath: string) => {
      clearError(get);
      const result = await window.digitalLife.workspace.createFolder(relativePath);
      if (!result.ok) {
        captureError(get, result.error);
        return undefined;
      }
      await get().refreshWorkspaceTree();
      clearError(get);
      return relativePath;
    },

    /**
     * [markExternalFileChange - 标记外部文件变更，更新编辑器脏路径]
     * @reads editorSlice.selectedFilePath, editorSlice.fileLastModifiedAt
     * @writes editorSlice.externalFileChange, editorSlice.dirtyEditorPaths
     * @see — 无桥接调用 (本地状态更新)
     */
    markExternalFileChange: ({
      path,
      lastModifiedAt,
    }: {
      path: string;
      lastModifiedAt: number;
    }) => {
      const selected = normalizeWorkspaceRelativePath(get().selectedFilePath ?? '');
      const incoming = normalizeWorkspaceRelativePath(path);
      if (!selected || selected !== incoming) {
        return;
      }
      if (
        typeof get().fileLastModifiedAt === 'number' &&
        get().fileLastModifiedAt === lastModifiedAt
      ) {
        return;
      }
      /* external file changed */
      set((state: StoreState) => {
        const nextDirty = [...new Set([...state.dirtyEditorPaths, incoming])];
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          externalFileChange: { path, lastModifiedAt },
          dirtyEditorPaths: nextDirty,
        };
      });
    },

    /**
     * [notifyEditorBufferDirty - 通知编辑器缓冲区脏状态变更]
     * @reads editorSlice.dirtyEditorPaths
     * @writes editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.setEditorDirtyPaths
     * @see mock-bridge.ts → workspace.setEditorDirtyPaths
     * @see preview-bridge/index.ts → workspace.setEditorDirtyPaths
     */
    notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => {
      set((state: StoreState) => {
        const nextDirty = mergeDirtyEditorPaths(state.dirtyEditorPaths, relativePath, isDirty);
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return { dirtyEditorPaths: nextDirty };
      });
    },
  };
}
