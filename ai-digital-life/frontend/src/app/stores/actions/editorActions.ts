import type { StoreState } from '../StoreState';
import { createEditorTab } from '@utils/editorTabs';
import { buildOutlineFromContent } from '@shared/outline';
import { normalizeWorkspaceRelativePath, mergeDirtyEditorPaths } from '@utils/workspacePaths';
import {
  getWorkspaceScopedCacheKey,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  pendingChangePreviewPath,
  postMutationRefresh,
  scopedFileKey,
  nextFileGen,
  isCurrentFileGen,
} from '../shared';
import type { StoreApi } from 'zustand';
import {
  clearError,
  captureError,
  invalidateCachedChangePreview,
  invalidateCachedFileDocument,
  setCachedFileDocument,
} from '../cacheHelpers';
import { persistField } from '../persisted/apply';
import {
  openFileGeneric,
  openMediaFileGeneric,
  openChangePreviewGeneric,
} from './editorActionsHelpers';
import { categorizeFile, isMediaFileCategory } from '../../regions/right-panel/fileTypeRouter';
import { refreshTreeByWorkspacePath } from './workspaceActions';
import { insertTreeNode } from './workspaceTreeRename';
import { asWorkspaceID } from '../../../shared/branded';
import { TEXT_HEAVY_PREVIEW_CHARS } from '../../regions/right-panel/heavyPreviewLimits';
import { fileZh } from '../../i18n/zh-CN/file';
import { fileEn } from '../../i18n/en-US/file';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';
const SCOPE = 'editor';

/** 编辑器未落盘文本缓冲（模块级，不进 React 状态，避免每次键入重渲染）。 */
const pendingEditorText = new Map<string, string>();

/** 供脏判断定时器读取最新击键文本（不读闭包旧值）。 */
export function peekPendingEditorText(relativePath: string, workspaceId?: string): string | undefined {
  return pendingEditorText.get(scopedFileKey(workspaceId, relativePath));
}

/** 清掉指定路径的过期脏标记（无暂存配套时调用）。 */
function clearStaleDirtyMark(set: StoreApi<StoreState>['setState'], norm: string): void {
  set((state: StoreState) => {
    if (!state.dirtyEditorPaths.some((p) => normalizeWorkspaceRelativePath(p) === norm)) {
      return state;
    }
    const nextDirty = state.dirtyEditorPaths.filter(
      (p) => normalizeWorkspaceRelativePath(p) !== norm,
    );
    void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
    return { dirtyEditorPaths: nextDirty };
  });
}

/**
 * 若变更面板正预览着该文件，重拍 diff（缓存已由调用方失效，此处必读盘）。
 * 用户预览请求在途时让路（与 fetchGitStatus 的 H2 守卫同理），不作废点击。
 */
async function refreshOpenPreviewIfSelected(
  get: () => StoreState,
  relativePath: string,
): Promise<void> {
  if (pendingChangePreviewPath !== undefined) {
    return;
  }
  const previewPath = get().selectedChangePreviewPath;
  if (
    !previewPath ||
    normalizeWorkspaceRelativePath(previewPath) !== normalizeWorkspaceRelativePath(relativePath)
  ) {
    return;
  }
  extDebugLog('refreshing open change preview', { relativePath });
  await get().openChangePreview(relativePath);
}

/** 外部变更跟手防抖（方案 A）：日志类高频写入合并为一次重载/刷新。 */
const externalFollowTimers = new Map<string, number>();
const EXTERNAL_FOLLOW_DEBOUNCE_MS = 400;

function scheduleExternalFollow(get: () => StoreState, key: string, run: () => void): void {
  window.clearTimeout(externalFollowTimers.get(key));
  externalFollowTimers.set(
    key,
    window.setTimeout(() => {
      externalFollowTimers.delete(key);
      run();
    }, EXTERNAL_FOLLOW_DEBOUNCE_MS),
  );
}

function scheduleSelectedAutoReload(get: () => StoreState): void {
  const selected = get().selectedFilePath;
  const workspaceId = get().appInfo?.currentWorkspace?.id;
  if (!selected || !workspaceId) {
    return;
  }
  scheduleExternalFollow(get, `reload:${workspaceId}:${selected}`, () => {
    void get().reconcileSelectedFile();
  });
}

function scheduleGitFollowQuietly(get: () => StoreState): void {
  const currentWorkspace = get().appInfo?.currentWorkspace;
  if (!currentWorkspace) {
    return;
  }
  const workspaceId = currentWorkspace.id;
  const workspacePath = currentWorkspace.path;
  scheduleExternalFollow(get, `git:${workspaceId}`, () => {
    console.log('[ADL-EXTFOLLOW] git follow firing', { workspaceId });
    void get().refreshGitSnapshot(workspaceId, workspacePath, { silent: true });
  });
}

/**
 * 批次通道跟手（事项 13 补洞）：Tauri 下单事件 channel 无人 emit，
 * 唯一活路是 onFilesChanged 批次。命中选中文件即走同一调度器
 * （防抖 + 草稿保护 + 回声无害：重载/刷新均为只读，无循环）。
 */
function extDebugLog(message: string, detail?: unknown): void {
  console.log(`[ADL-EXTFOLLOW] ${message}`, detail ?? '');
}

export function handleExternalBatch(
  get: () => StoreState,
  batch: { changed: string[]; removed: string[] },
): void {
  const selected = get().selectedFilePath;
  const workspaceId = get().appInfo?.currentWorkspace?.id;
  extDebugLog('batch received', {
    changed: batch.changed,
    removed: batch.removed,
    selected,
  });
  if (!selected || !workspaceId) {
    return;
  }
  const norm = normalizeWorkspaceRelativePath(selected);
  const hit = [...batch.changed, ...batch.removed].some(
    (p) => normalizeWorkspaceRelativePath(p) === norm,
  );
  if (hit) {
    scheduleSelectedAutoReload(get);
  }
  if (batch.changed.length > 0 || batch.removed.length > 0) {
    scheduleGitFollowQuietly(get);
  }
}

/**
 * 创建成功后本地插入新建节点到目标工作区文件树，避免立即全量 `listTree`
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
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(Boolean);
  const name = segments[segments.length - 1];
  const parentPath = segments.slice(0, -1).join('/');
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
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.fileOpenError, editorSlice.outline, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.readFile
     * @see mock-bridge.ts → workspace.readFile
     * @see preview-bridge/index.ts → workspace.readFile
     */
    openFile: async (relativePath: string) => {
      // 切文件前落盘脏缓冲（自动保存语义），再读新文件。
      extDebugLog('openFile start', {
        relativePath,
        dirty: get().dirtyEditorPaths,
        pendingKeys: [...pendingEditorText.keys()],
      });
      await get().saveDirtyEditors();
      const workspaceId = get().appInfo?.currentWorkspace?.id;
      const category = categorizeFile(relativePath);
      const opened = isMediaFileCategory(category)
        ? await openMediaFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            workspaceId,
            workspacePath: get().appInfo?.currentWorkspace?.path,
            readMediaFile: () => window.digitalLife.workspace.readMediaFile(relativePath),
          })
        : await openFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            cacheKey: getWorkspaceScopedCacheKey(get().appInfo, relativePath),
            workspaceId,
            workspacePath: get().appInfo?.currentWorkspace?.path,
            readFile: () => window.digitalLife.workspace.readFile(relativePath),
          });
      if (opened) {
        if (workspaceId) {
          get().rememberLastOpenedFile(workspaceId, relativePath);
        } else {
          // 无工作区上下文：无法记录可恢复的指向，但仍清空残留的恢复提示
          set({ sessionRestoreNotice: undefined });
        }
      }
    },

    /**
     * [openFileForWorkspace - 为指定工作区打开文件]
     * @writes editorSlice.openTabs, editorSlice.selectedFilePath, editorSlice.selectedFileWorkspaceId, editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.fileOpenError, editorSlice.outline, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.readFileForWorkspace
     * @see mock-bridge.ts → workspace.readFileForWorkspace
     * @see preview-bridge/index.ts → workspace.readFileForWorkspace
     */
    openFileForWorkspace: async (
      workspaceId: string,
      workspacePath: string,
      relativePath: string,
    ) => {
      await get().saveDirtyEditors();
      const category = categorizeFile(relativePath);
      const opened = isMediaFileCategory(category)
        ? await openMediaFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            workspaceId,
            workspacePath,
            readMediaFile: () =>
              window.digitalLife.workspace.readMediaFileForWorkspace(workspacePath, relativePath),
          })
        : await openFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            cacheKey: scopedFileKey(workspaceId, relativePath),
            workspaceId,
            workspacePath,
            readFile: () =>
              window.digitalLife.workspace.readFileForWorkspace(workspacePath, relativePath),
          });
      if (opened) {
        get().rememberLastOpenedFile(workspaceId, relativePath);
      }
    },

    /**
     * [rememberLastOpenedFile - 记录上次打开的文件]
     * 成功打开任意文件后调用（openFile / openFileForWorkspace /
     * createWorkspaceFile），经 persist 唯一写盘通道落盘；同时清空会话恢复提示
     * （提示不常驻）。
     *
     * 关闭文件时不清空：全仓唯一的关标签入口 removeOpenTab 当前无任何消费方
     * （文件标签尚不可关闭），且 lastFile 语义是"上次打开"而非"当前打开" ——
     * 重启后要恢复的正是它（Task 26）。
     */
    rememberLastOpenedFile: (workspaceId: string, relativePath: string) => {
      set({
        ...persistField('adl:session.lastFile', { workspaceId, relativePath }),
        sessionRestoreNotice: undefined,
      });
    },

    /**
     * [restoreLastOpenedFile - 启动时恢复上次打开的文件]
     * 由 useAppStartup 在 bootstrap 完成后调用一次（无轮询/重试）。
     * 工作区/文件不存在、权限不足、读取失败时不抛错，只置瞬态
     * sessionRestoreNotice，编辑器停在空态或既有错误视图。
     * 已打开文件或已尝试过（notice 已置位）时直接返回，保证启动只执行一次。
     */
    restoreLastOpenedFile: async () => {
      const state = get();
      if (state.selectedFilePath !== undefined || state.sessionRestoreNotice !== undefined) {
        return;
      }
      const last = state.lastOpenedFile;
      if (!last) {
        return;
      }
      const workspaces = state.recentWorkspaces;
      if (workspaces.length === 0) {
        // 参照清单未就绪：无法判定工作区是否存在，此时置位会误报，故静默返回
        return;
      }
      const ws = workspaces.find((w) => w.id === last.workspaceId);
      if (!ws) {
        set({ sessionRestoreNotice: 'sessionLastFileMissing' });
        return;
      }
      try {
        await get().openFileForWorkspace(last.workspaceId, ws.path, last.relativePath);
      } catch {
        // 读取失败即降级为提示，不抛错（Task 26）
      }
      const after = get();
      if (
        after.fileOpenError?.path === last.relativePath ||
        after.selectedFilePath !== last.relativePath ||
        after.selectedFileWorkspaceId !== last.workspaceId
      ) {
        set({ sessionRestoreNotice: 'sessionLastFileMissing' });
      }
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
        cacheKey: scopedFileKey(
          get().recentWorkspaces.find((w) => w.path === workspacePath)?.id,
          relativePath,
        ),
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
      const ws = workspacePath
        ? get().recentWorkspaces.find((r) => r.path === workspacePath)
        : undefined;
      if (ws) {
        // 新建即打开：同样记为上次打开的文件（成功打开即清空恢复提示）
        get().rememberLastOpenedFile(ws.id, relativePath);
      } else {
        set({ sessionRestoreNotice: undefined });
      }
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
          fileMedia: null,
          fileMediaLoading: false,
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
      extDebugLog('single event received', {
        path,
        lastModifiedAt,
        selected: get().selectedFilePath,
        baselineMtime: get().fileLastModifiedAt,
      });
      const selected = normalizeWorkspaceRelativePath(get().selectedFilePath ?? '');
      const incoming = normalizeWorkspaceRelativePath(path);
      if (!selected || selected !== incoming) {
        scheduleGitFollowQuietly(get);
        return;
      }
      if (
        typeof get().fileLastModifiedAt === 'number' &&
        get().fileLastModifiedAt === lastModifiedAt
      ) {
        // 自写回声（本次保存的 watcher 回音，mtime 一致）：忽略，防重载打转。
        return;
      }
      /* external file changed.
       * 注意：此处不再顺手打蓝点（dirtyEditorPaths 只属于"用户未存输入"）。
       * 旧逻辑把外部变更也标脏，导致两害：①自动重载被"草稿优先"挡掉；
       * ② saveDirtyEditors 会用旧基线回写，覆盖外部新内容。外部态只走
       * externalFileChange（树上有独立标识），与脏点解耦。 */
      const hadExternal = get().externalFileChange?.path === path;
      set({
        externalFileChange: { path, lastModifiedAt },
      });
      if (!hadExternal) {
        // 脏则只提示一次（方案 A）：草稿优先，不断用户打字。
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const dict = locale === 'en-US' ? fileEn : fileZh;
        get().showToast(dict.fileExternalChangedWhileDirty, 'warning');
      }
      // 方案 A：干净即重载（防抖；触发时若用户刚开始打字，reconcile 按草稿跳过）。
      scheduleSelectedAutoReload(get);
      scheduleGitFollowQuietly(get);
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

    /**
     * [noteEditorText - 暂存编辑器未落盘文本]
     * typing 只进 CodeMirror 内部 state；本缓冲是存盘链唯一内容来源
     * （Ctrl+S / 空闲自动保存 / 切换前 flush 均消费它）。
     */
    noteEditorText: (relativePath: string, text: string) => {
      const key = scopedFileKey(get().appInfo?.currentWorkspace?.id, relativePath);
      pendingEditorText.set(key, text);
    },

    /**
     * [saveFile - 保存文件]
     * @writes editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.updateFileContent
     * @see mock-bridge.ts → workspace.updateFileContent
     * @see preview-bridge/index.ts → workspace.updateFileContent
     */
    saveFile: async (relativePath?: string, workspacePath?: string) => {
      const currentWorkspace = get().appInfo?.currentWorkspace;
      const rootPath = workspacePath ?? currentWorkspace?.path;
      const targetPath = relativePath ?? get().selectedFilePath;
      if (!rootPath || !targetPath) {
        return true;
      }
      const norm = normalizeWorkspaceRelativePath(targetPath);
      // 跨工作区保存时钥匙跟目标工作区走（与 openFileForWorkspace 同口径）。
      const targetWsId = workspacePath
        ? (get().recentWorkspaces.find((w) => w.path === workspacePath)?.id ??
          currentWorkspace?.id)
        : currentWorkspace?.id;
      const key = scopedFileKey(targetWsId, targetPath);
      const pending = pendingEditorText.get(key);
      extDebugLog('saveFile attempt', {
        targetPath,
        key,
        hasPending: pending !== undefined,
        pendingLength: pending?.length,
        baselineLength: get().fileContent?.length,
      });
      if (pending === undefined) {
        // 脏而无暂存 = 过期标记（旧定时器闭包/重启恢复）：只清标记，绝不拿基线回写。
        clearStaleDirtyMark(set, norm);
        return true;
      }
      const content = pending;
      clearError(get, SCOPE);
      const result = await window.digitalLife.workspace.updateFileContent(
        targetPath,
        content,
        workspacePath,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      pendingEditorText.delete(key);
      // 落定即推进代际：在途的旧读落地时作废（存读互斥）。
      nextFileGen(key);
      setCachedFileDocument(key, {
        content: result.data.content,
        lastModifiedAt: result.data.lastModifiedAt,
      });
      // diff 预览缓存同失效，否则变更面板的 diff 停在旧内容（60s TTL 缓存优先）。
      invalidateCachedChangePreview(key);
      // 落盘即跟手（报告 2）：本次保存的变更立刻进变更面板，不等 watcher 回声。
      extDebugLog('saveFile ok, refreshing git status', { targetPath });
      await postMutationRefresh(get);
      set((state: StoreState) => {
        const nextDirty = state.dirtyEditorPaths.filter(
          (p) => normalizeWorkspaceRelativePath(p) !== norm,
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        const isSelected =
          state.selectedFilePath && normalizeWorkspaceRelativePath(state.selectedFilePath) === norm;
        return {
          dirtyEditorPaths: nextDirty,
          ...(isSelected
            ? {
                fileContent: result.data.content,
                fileLastModifiedAt: result.data.lastModifiedAt,
                fileOpenError: null,
                externalFileChange:
                  state.externalFileChange?.path === targetPath
                    ? undefined
                    : state.externalFileChange,
              }
            : {}),
        };
      });
      return true;
    },

    /**
     * [saveDirtyEditors - 保存全部脏文件]
     * 切换文件/分支/工作区前的 flush 点；单个失败不阻断其余（错误已上报）。
     * @returns 成功保存的文件数
     */
    saveDirtyEditors: async () => {
      const dirty = [...get().dirtyEditorPaths];
      let saved = 0;
      for (const path of dirty) {
        if (await get().saveFile(path)) {
          saved += 1;
        }
      }
      return saved;
    },

    /**
     * [reconcileSelectedFile - 对账选中文件与磁盘]
     * 绕过缓存重读：有未存草稿则跳过（保草稿优先）；文件消失则清为空状态
     * （复用 fileOpenError 友好视图）；内容变化则更新基线。供刷新按钮/
     * 分支切换后调用，解决“内容区不跟手”问题。
     */
    reconcileSelectedFile: async () => {
      const selected = get().selectedFilePath;
      const currentWorkspace = get().appInfo?.currentWorkspace;
      extDebugLog('reconcile start', { selected, workspaceId: currentWorkspace?.id });
      if (!selected || !currentWorkspace) {
        return;
      }
      const norm = normalizeWorkspaceRelativePath(selected);
      const hasDraft = get().dirtyEditorPaths.some(
        (p) => normalizeWorkspaceRelativePath(p) === norm,
      );
      const key = getWorkspaceScopedCacheKey(get().appInfo, selected);
      invalidateCachedFileDocument(key);
      clearError(get, SCOPE);
      const gen = nextFileGen(key);
      const result = await window.digitalLife.workspace.readFile(selected);
      if (!isCurrentFileGen(key, gen)) {
        // 对账读等待中被更新的意图超车（新保存/新打开）：旧回复丢弃。
        return;
      }
      if (!result.ok) {
        if (hasDraft) {
          // 草稿优先：文件虽没了，但未存内容保留在编辑器中，警告一次。
          const locale = resolveAppLanguage(get().appInfo?.config?.language);
          const dict = locale === 'en-US' ? fileEn : fileZh;
          get().showToast(dict.fileUnsavedKeptAfterGone, 'warning');
          return;
        }
        set({
          fileContent: undefined,
          fileMedia: null,
          fileMediaLoading: false,
          fileLastModifiedAt: undefined,
          outline: [],
          fileOpenError: {
            path: selected,
            code: 'NOT_FOUND',
            message: result.error.message,
            workspaceId: currentWorkspace.id,
            workspacePath: currentWorkspace.path,
          },
        });
        return;
      }
      setCachedFileDocument(key, {
        content: result.data.content,
        lastModifiedAt: result.data.lastModifiedAt,
      });
      if (hasDraft) {
        // 草稿优先：基线不动（脏比较口径不变），视图里的草稿不受影响。
        return;
      }
      const baseline = get().fileContent ?? '';
      if (baseline !== result.data.content) {
        set({
          fileContent: result.data.content,
          fileLastModifiedAt: result.data.lastModifiedAt,
          fileOpenError: null,
          outline:
            result.data.content.length > TEXT_HEAVY_PREVIEW_CHARS
              ? []
              : buildOutlineFromContent(result.data.content, selected),
        });
        // 磁盘变了 diff 必变：清预览缓存并重拍打开中的 diff（用户预览请求在途则让路）。
        invalidateCachedChangePreview(key);
        await refreshOpenPreviewIfSelected(get, selected);
      }
    },
  };
}
