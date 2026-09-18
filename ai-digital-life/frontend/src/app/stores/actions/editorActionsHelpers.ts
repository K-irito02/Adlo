/**
 * Editor Actions 辅助函数
 * 从 editorActions.ts 提取的通用文件/变更预览打开逻辑。
 *
 * `openFileGeneric` 与 `openChangePreviewGeneric` 接收 `set` / `get` 作为依赖，
 * 不直接导入 store，便于在多个 action 之间复用，也便于单测。
 *
 * Action 层（editorActions.ts）仅负责：
 * - 生成请求序号（getNextFileRequestSeq / getNextChangePreviewRequestSeq）
 * - 解析 cacheKey 与 workspaceId（基于 appInfo / recentWorkspaces）
 * - 调用对应的桥接方法（window.digitalLife.workspace.*）
 */
import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import { createEditorTab } from '@utils/editorTabs';
import { buildOutlineFromContent } from '@shared/outline';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import {
  fileRequestSeq,
  changePreviewRequestSeq,
  type CachedFileDocument,
  getCachedFileDocument,
  setCachedFileDocument,
  getCachedChangePreview,
  setCachedChangePreview,
} from '../shared';
import { clearError, captureError } from '../cacheHelpers';
import type {
  FileOutlineItem,
  IpcResult,
  WorkspaceFileDocument,
  WorkspaceChangePreview,
} from '@ai-digital-life/kernel';

const SCOPE = 'editor';

export interface OpenFileConfig {
  cacheKey: string;
  workspaceId: string | undefined;
  readFile: () => Promise<IpcResult<WorkspaceFileDocument>>;
}

export async function openFileGeneric(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
  requestSeq: number,
  config: OpenFileConfig,
) {
  clearError(get, SCOPE);
  const cachedDocument = getCachedFileDocument(config.cacheKey);

  const applyDocument = (document: CachedFileDocument, outlineOverride?: FileOutlineItem[]) => {
    const nextOutline = outlineOverride ?? buildOutlineFromContent(document.content, relativePath);
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
        selectedFileWorkspaceId: config.workspaceId,
        fileContent: document.content,
        fileLastModifiedAt: document.lastModifiedAt,
        fileOpenError: null,
        externalFileChange:
          state.externalFileChange?.path === relativePath ? undefined : state.externalFileChange,
        outline: nextOutline,
        dirtyEditorPaths: nextDirty,
      };
    });
  };

  if (cachedDocument) {
    applyDocument(cachedDocument);
    return;
  }
  // 就绪才切换（事项 46 调整项）：标签页即时出现作为点击反馈，
  // 但 selectedFilePath/fileContent 保持旧值直到内容读到，主区全程无中间态。
  set((state: StoreState) => ({
    openTabs: state.openTabs.some((tab) => tab.path === relativePath)
      ? state.openTabs
      : [...state.openTabs, createEditorTab(relativePath)],
    fileOpenError: null,
  }));

  const fileResult = await config.readFile();
  if (requestSeq !== fileRequestSeq) {
    return;
  }
  if (!fileResult.ok) {
    captureError(get, fileResult.error, SCOPE);
    const raw = fileResult.error as { code?: unknown; message?: unknown };
    // 失败不在主区回退显示旧文件内容：切到目标路径并展示友好错误（用户决策）。
    set({
      selectedFilePath: relativePath,
      selectedFileWorkspaceId: config.workspaceId,
      fileContent: undefined,
      fileLastModifiedAt: undefined,
      outline: [],
      fileOpenError: {
        path: relativePath,
        code: typeof raw.code === 'string' ? raw.code : 'UNKNOWN',
        message: typeof raw.message === 'string' ? raw.message : '',
      },
    });
    return;
  }
  const nextOutline = buildOutlineFromContent(fileResult.data.content, relativePath);
  const nextDocument: CachedFileDocument = {
    content: fileResult.data.content,
    lastModifiedAt: fileResult.data.lastModifiedAt,
  };
  setCachedFileDocument(config.cacheKey, nextDocument);
  applyDocument(nextDocument, nextOutline);
}

export interface OpenChangePreviewConfig {
  cacheKey: string;
  workspaceId: string | undefined;
  getPreview: () => Promise<IpcResult<WorkspaceChangePreview>>;
}

export async function openChangePreviewGeneric(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
  requestSeq: number,
  config: OpenChangePreviewConfig,
) {
  set({ changePreviewLoading: true });

  const cachedPreview = getCachedChangePreview(config.cacheKey);
  if (cachedPreview) {
    set({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: config.workspaceId,
      changePreview: cachedPreview,
      changePreviewLoading: false,
    });
    return;
  }

  set({
    selectedChangePreviewPath: relativePath,
    selectedChangePreviewWorkspaceId: config.workspaceId,
  });

  const result = await config.getPreview();
  if (requestSeq !== changePreviewRequestSeq) {
    return;
  }
  if (!result.ok) {
    captureError(get, result.error, SCOPE);
    set({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: config.workspaceId,
      changePreviewLoading: false,
      changePreview: get().changePreview?.path === relativePath ? undefined : get().changePreview,
    });
    return;
  }
  setCachedChangePreview(config.cacheKey, result.data);
  set({
    selectedChangePreviewPath: relativePath,
    selectedChangePreviewWorkspaceId: config.workspaceId,
    changePreviewLoading: false,
    changePreview: result.data,
  });
}
