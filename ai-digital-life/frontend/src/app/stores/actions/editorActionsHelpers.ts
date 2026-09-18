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
  workspacePath?: string;
  readFile: () => Promise<IpcResult<WorkspaceFileDocument>>;
}

/**
 * 开文件失败的统一提交（Phase 4 审查 M1/M4/L2）：{ok:false} 与 readFile 抛异常
 * 共用。失败是终态——切到目标路径并展示友好错误，不回退旧内容；
 * 同时清掉定位帘（错误视图即揭示结果）。
 */
function submitOpenFailure(
  set: StoreApi<StoreState>['setState'],
  relativePath: string,
  config: OpenFileConfig,
  error: unknown,
) {
  const raw = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof raw?.code === 'string' ? raw.code : 'UNKNOWN';
  const rawMessage = typeof raw?.message === 'string' ? raw.message : '';
  set({
    selectedFilePath: relativePath,
    selectedFileWorkspaceId: config.workspaceId,
    fileContent: undefined,
    fileLastModifiedAt: undefined,
    outline: [],
    positioningPath: null,
    fileOpenError: {
      path: relativePath,
      code,
      message: rawMessage || code,
      workspaceId: config.workspaceId,
      workspacePath: config.workspacePath,
    },
  });
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
  // pending 期不变量：除 openTabs 外一切派生状态（selected/content/outline/
  // diagnostics/preview/fileOpenError）均保持旧值；fileOpenError 刻意不清，
  // 使重试 pending 期仍显示错误视图而非跌落空编辑器（Phase 4 审查 M2）。
  set((state: StoreState) => ({
    openTabs: state.openTabs.some((tab) => tab.path === relativePath)
      ? state.openTabs
      : [...state.openTabs, createEditorTab(relativePath)],
  }));

  let fileResult: IpcResult<WorkspaceFileDocument>;
  try {
    fileResult = await config.readFile();
  } catch (err) {
    if (requestSeq !== fileRequestSeq) {
      return;
    }
    captureError(get, err, SCOPE);
    submitOpenFailure(set, relativePath, config, err);
    return;
  }
  if (requestSeq !== fileRequestSeq) {
    return;
  }
  if (!fileResult.ok) {
    captureError(get, fileResult.error, SCOPE);
    // 失败不在主区回退显示旧文件内容：切到目标路径并展示友好错误（用户决策）。
    submitOpenFailure(set, relativePath, config, fileResult.error);
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
