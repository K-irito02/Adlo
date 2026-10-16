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
import { TEXT_HEAVY_PREVIEW_CHARS } from '../../regions/right-panel/heavyPreviewLimits';
import { isLegacyOfficeFile } from '../../regions/right-panel/fileTypeRouter';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import {
  fileRequestSeq,
  changePreviewRequestSeq,
  type CachedFileDocument,
  getCachedFileDocument,
  setCachedFileDocument,
  getCachedChangePreview,
  setCachedChangePreview,
  setPendingChangePreviewPath,
  nextFileGen,
  isCurrentFileGen,
} from '../shared';
import { clearError, captureError } from '../cacheHelpers';
import type {
  FileOutlineItem,
  IpcResult,
  WorkspaceFileDocument,
  WorkspaceMediaDocument,
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
  config: Pick<OpenFileConfig, 'workspaceId' | 'workspacePath'>,
  error: unknown,
) {
  const raw = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = typeof raw?.code === 'string' ? raw.code : 'UNKNOWN';
  const rawMessage = typeof raw?.message === 'string' ? raw.message : '';
  set({
    selectedFilePath: relativePath,
    selectedFileWorkspaceId: config.workspaceId,
    fileContent: undefined,
    fileMedia: null,
    fileMediaLoading: false,
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

/**
 * 打开文件前奏（Phase 4 审查 D2 抽取，双 generic 共用）：清作用域错误 +
 * 乐观插入标签页（点击反馈）。pending 期其余派生状态保持旧值（就绪才切换）。
 */
function beginFileOpen(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
) {
  clearError(get, SCOPE);
  set((state: StoreState) => ({
    openTabs: state.openTabs.some((tab) => tab.path === relativePath)
      ? state.openTabs
      : [...state.openTabs, createEditorTab(relativePath)],
  }));
}

export async function openFileGeneric(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
  requestSeq: number,
  config: OpenFileConfig,
): Promise<boolean> {
  // 同路径读写排队：占号；缓存命中是同步意图，直接推进代际；
  // 落盘读若在等待中被更新的意图超车，落地时作废。
  const gen = nextFileGen(config.cacheKey);
  const cachedDocument = getCachedFileDocument(config.cacheKey);

  const applyDocument = (document: CachedFileDocument, outlineOverride?: FileOutlineItem[]) => {
    // 重型文本（超阈值）跳过大纲解析：大文件大纲 walk 是确认前卡顿来源之一，
    // 且巨型压缩文件的符号大纲本就无意义；渲染由内容区重型门把关。
    const nextOutline =
      outlineOverride ??
      (document.content.length > TEXT_HEAVY_PREVIEW_CHARS
        ? []
        : buildOutlineFromContent(document.content, relativePath));
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
        fileMedia: null,
        fileMediaLoading: false,
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
    return true;
  }
  // 就绪才切换（事项 46 调整项）：标签页即时出现作为点击反馈，
  // 但 selectedFilePath/fileContent 保持旧值直到内容读到，主区全程无中间态。
  // pending 期不变量：除 openTabs 外一切派生状态（selected/content/outline/
  // diagnostics/preview/fileOpenError）均保持旧值；fileOpenError 刻意不清，
  // 使重试 pending 期仍显示错误视图而非跌落空编辑器（Phase 4 审查 M2）。
  beginFileOpen(set, get, relativePath);

  let fileResult: IpcResult<WorkspaceFileDocument>;
  try {
    fileResult = await config.readFile();
  } catch (err) {
    if (requestSeq !== fileRequestSeq) {
      return false;
    }
    captureError(get, err, SCOPE);
    submitOpenFailure(set, relativePath, config, err);
    return false;
  }
  if (requestSeq !== fileRequestSeq) {
    return false;
  }
  if (!isCurrentFileGen(config.cacheKey, gen)) {
    // 已被更新的同路径意图（新打开/新保存）超车：旧回复丢弃，不写缓存不进主区。
    return false;
  }
  if (!fileResult.ok) {
    captureError(get, fileResult.error, SCOPE);
    // 失败不在主区回退显示旧文件内容：切到目标路径并展示友好错误（用户决策）。
    submitOpenFailure(set, relativePath, config, fileResult.error);
    return false;
  }
  // 重型文本（超阈值）跳过大纲解析：大文件大纲 walk 是确认前卡顿来源之一，
  // 且巨型压缩文件的符号大纲本就无意义；渲染由内容区重型门把关。
  const nextOutline =
    fileResult.data.content.length > TEXT_HEAVY_PREVIEW_CHARS
      ? []
      : buildOutlineFromContent(fileResult.data.content, relativePath);
  const nextDocument: CachedFileDocument = {
    content: fileResult.data.content,
    lastModifiedAt: fileResult.data.lastModifiedAt,
  };
  // 重型文本不入文本缓存（Phase 4 审查 S1）：缓存按 32 条数淘汰，
  // 8MB 条目最坏常驻 256MB；超阈值按次读取（本地读 + 大纲已跳过，成本可接受）。
  if (nextDocument.content.length <= TEXT_HEAVY_PREVIEW_CHARS) {
    setCachedFileDocument(config.cacheKey, nextDocument);
  }
  applyDocument(nextDocument, nextOutline);
  return true;
}

export interface OpenMediaFileConfig {
  workspaceId: string | undefined;
  workspacePath?: string;
  readMediaFile: () => Promise<IpcResult<WorkspaceMediaDocument>>;
}

/**
 * 媒体/办公二进制打开（与 openFileGeneric 同"就绪才切换"语义）：
 * 成功时置 fileMedia 并清空 fileContent/outline；失败走同一 submitOpenFailure。
 * 媒体不进文本缓存（base64 体积大，按次读取）。
 */
export async function openMediaFileGeneric(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  relativePath: string,
  requestSeq: number,
  config: OpenMediaFileConfig,
): Promise<boolean> {
  // P4 F11：媒体链同享代际守卫（独立 `media:` 命名空间，不与文本代际串扰）。
  const mediaGen = nextFileGen(`media:${config.workspaceId ?? ''}:${relativePath}`);
  beginFileOpen(set, get, relativePath);
  set({ fileMediaLoading: true });

  // 已知旧格式短路（收尾 F-18）：`.doc/.dot/.ppt` 解析必失败，不读字节，
  // 直接落占位文档；渲染层按 fileName 给转存指引。lastModifiedAt 取此刻
  // （占位文档不参与外部变更比对，可接受）。
  if (isLegacyOfficeFile(relativePath)) {
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
        fileContent: undefined,
        fileMedia: {
          path: relativePath,
          mime: 'application/octet-stream',
          base64: '',
          size: 0,
          lastModifiedAt: Date.now(),
        },
        fileMediaLoading: false,
        fileLastModifiedAt: undefined,
        fileOpenError: null,
        externalFileChange:
          state.externalFileChange?.path === relativePath ? undefined : state.externalFileChange,
        outline: [],
        dirtyEditorPaths: nextDirty,
      };
    });
    return true;
  }

  let mediaResult: IpcResult<WorkspaceMediaDocument>;
  try {
    mediaResult = await config.readMediaFile();
  } catch (err) {
    if (requestSeq !== fileRequestSeq) {
      return false;
    }
    captureError(get, err, SCOPE);
    submitOpenFailure(set, relativePath, config, err);
    set({ fileMediaLoading: false });
    return false;
  }
  if (requestSeq !== fileRequestSeq) {
    // 过期返回不碰 fileMediaLoading：新请求拥有该 flag 的后续状态，
    // 此处清零会熄灭仍在 pending 的新请求的骨架。
    return false;
  }
  if (!isCurrentFileGen(`media:${config.workspaceId ?? ''}:${relativePath}`, mediaGen)) {
    return false;
  }
  if (!mediaResult.ok) {
    captureError(get, mediaResult.error, SCOPE);
    submitOpenFailure(set, relativePath, config, mediaResult.error);
    set({ fileMediaLoading: false });
    return false;
  }
  set((state: StoreState) => {
    const nextDirty = state.dirtyEditorPaths.filter(
      (p) => normalizeWorkspaceRelativePath(p) !== normalizeWorkspaceRelativePath(relativePath),
    );
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    return {
      openTabs: state.openTabs.some((tab) => tab.path === relativePath)
        ? state.openTabs
        : [...state.openTabs, createEditorTab(relativePath)],
      selectedFilePath: relativePath,
      selectedFileWorkspaceId: config.workspaceId,
      fileContent: undefined,
      fileMedia: mediaResult.data,
      fileMediaLoading: false,
      fileLastModifiedAt: mediaResult.data.lastModifiedAt,
      fileOpenError: null,
      externalFileChange:
        state.externalFileChange?.path === relativePath ? undefined : state.externalFileChange,
      outline: [],
      dirtyEditorPaths: nextDirty,
    };
  });
  return true;
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

  // 就绪才切换（与 openFileGeneric 同语义）：pending 期 selected/内容保持旧值，
  // 成功/失败终态再原子切换。此前请求开始即切 selected，导致跨工作区切换时
  // 确认门 key（新选中工作区 + 旧内容路径）错配，大切小必闪一次门。
  // 登记 pending 目标：后台 fetchGitStatus 刷新据此让路，避免作废本请求（复审 H2）。
  setPendingChangePreviewPath(relativePath);
  // P4 F11：预览链同享代际守卫（独立 `preview:` 命名空间，不与文件代际串扰）。
  const previewGen = nextFileGen(`preview:${config.cacheKey}`);
  const result = await config.getPreview();
  if (requestSeq !== changePreviewRequestSeq) {
    // 已被更新的请求取代：pending 目标归新请求所有，不在此清除。
    return;
  }
  if (!isCurrentFileGen(`preview:${config.cacheKey}`, previewGen)) {
    return;
  }
  setPendingChangePreviewPath(undefined);
  if (!result.ok) {
    captureError(get, result.error, SCOPE);
    set({
      selectedChangePreviewPath: relativePath,
      selectedChangePreviewWorkspaceId: config.workspaceId,
      changePreviewLoading: false,
      // 失败是终态：清掉旧预览，不回退显示旧文件内容（与 openFileGeneric 的
      // submitOpenFailure 同语义）。此前保留旧预览，切到超限大文件时内容区仍是
      // 上一个文件、重型门也出不来（事项3"被侵占"）。
      changePreview: undefined,
    });
    return;
  }
  // 重型预览不入缓存（复审 M3，与 openFileGeneric 重型不入文本缓存同例）：
  // 上限抬到 8MB 后单条 base+current 最坏约 16MB，32 条 LRU 最坏 ~512MB 常驻。
  const isHeavyPreview =
    result.data.baseContent.length > TEXT_HEAVY_PREVIEW_CHARS ||
    result.data.currentContent.length > TEXT_HEAVY_PREVIEW_CHARS;
  if (!isHeavyPreview) {
    setCachedChangePreview(config.cacheKey, result.data);
  }
  set({
    selectedChangePreviewPath: relativePath,
    selectedChangePreviewWorkspaceId: config.workspaceId,
    changePreviewLoading: false,
    changePreview: result.data,
  });
}
