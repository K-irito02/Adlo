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
import { refreshTreeByWorkspacePath } from './workspaceActions';
import { insertTreeNode } from './workspaceTreeRename';
import { asWorkspaceID } from '../../../shared/branded';
const SCOPE = 'editor';

/**
 * 乐观插入新建节点到目标工作区文件树，让 UI 立即反馈，无需等待全量 `listTree`
 * 递归扫描（大工作区下可达数秒）。之后再由调用方做后台静默刷新校准。
 */
function insertTreeNodeOptimistic(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  relativePath: string,
  kind: 'file' | 'directory',
  workspacePath?: string,
) {
  if (!workspacePath) {
    return;
  }
  const ws = get().recentWorkspaces.find((r) => r.path === workspacePath);
  if (!ws) {
    return;
  }
  const workspaceId = asWorkspaceID(ws.id);
  const tree = get().workspaceTrees[workspaceId];
  if (!tree) {
    return;
  }
  const segments = relativePath.split('/').filter(Boolean);
  const name = segments[segments.length - 1];
  const parentPath = segments.slice(0, -1).join('/');
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const newNode = { path: normalizedPath, name, kind, children: [] };
  set({
    workspaceTrees: {
      ...get().workspaceTrees,
      [workspaceId]: insertTreeNode(tree, parentPath, newNode),
    },
  });
}

/**
 * 判断新建文件/文件夹是否因"同路径下已存在同名项"而失败。
 * 后端 create_file/create_folder 在命中已存在路径时返回
 * "Invalid input: (file|path) already exists: <path>"，据此识别。
 */
function isAlreadyExistsError(error: unknown): error is { message: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: string }).message === 'string' &&
    (error as { message: string }).message.includes('already exists')
  );
}

/**
 * 判断新建文件失败是否因同路径下已存在同名目录（而非同名文件）。
 * 后端 create_file 对目录冲突返回 "file already exists (directory): <path>"。
 * 此时用户很可能遗漏了文件类型后缀，需要额外提示。
 */
function isExistingDirectoryCollision(error: { message: string }): boolean {
  return error.message.includes('file already exists (directory)');
}

function lastPathSegment(relativePath: string): string {
  return relativePath.split('/').filter(Boolean).pop() ?? relativePath;
}

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
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.outline, editorSlice.dirtyEditorPaths, workspaceSlice.workspaceTrees (乐观插入节点 + 后台静默刷新)
     * @see shared/ipc.ts → workspace.createFile
     * @see mock-bridge.ts → workspace.createFile
     * @see preview-bridge/index.ts → workspace.createFile
     */
    createWorkspaceFile: async (relativePath: string, content = '', workspacePath?: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.createFile(
        relativePath,
        content,
        workspacePath,
      );
      if (!result.ok) {
        if (isAlreadyExistsError(result.error)) {
          // 同路径同名冲突：右下角警告卡片提示，而非错误 toast。
          // 若冲突项是同名目录，额外提示检查文件类型后缀。
          get().pushFileOpNotice(
            'file',
            lastPathSegment(relativePath),
            isExistingDirectoryCollision(result.error),
          );
        } else {
          captureError(get, result.error, SCOPE);
        }
        return undefined;
      }
      // 乐观插入节点，立即显示；后台静默刷新校准，不阻塞 UI。
      insertTreeNodeOptimistic(get, set, relativePath, 'file', workspacePath);
      void refreshTreeByWorkspacePath(get, workspacePath);
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
     * @writes workspaceSlice.workspaceTrees (乐观插入节点 + 后台静默刷新)
     * @see shared/ipc.ts → workspace.createFolder
     * @see mock-bridge.ts → workspace.createFolder
     * @see preview-bridge/index.ts → workspace.createFolder
     */
    createWorkspaceFolder: async (relativePath: string, workspacePath?: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.createFolder(relativePath, workspacePath);
      if (!result.ok) {
        if (isAlreadyExistsError(result.error)) {
          // 同路径同名冲突：右下角警告卡片提示，而非错误 toast。
          get().pushFileOpNotice('folder', lastPathSegment(relativePath));
        } else {
          captureError(get, result.error, SCOPE);
        }
        return undefined;
      }
      // 乐观插入节点，立即显示；后台静默刷新校准，不阻塞 UI。
      insertTreeNodeOptimistic(get, set, relativePath, 'directory', workspacePath);
      void refreshTreeByWorkspacePath(get, workspacePath);
      clearError(get, SCOPE);
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
