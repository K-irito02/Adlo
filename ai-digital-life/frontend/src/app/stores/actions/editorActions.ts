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
  setPendingEditorText,
  peekPendingEditorTextByKey,
  pendingEditorTextKeys,
  lastSavedAtOf,
  markSavedAt,
} from '../shared';
import type { StoreApi } from 'zustand';
import {
  clearError,
  captureError,
  invalidateCachedChangePreview,
  invalidateCachedFileDocument,
  getCachedChangePreview,
  previewCancelEpoch,
  setCachedChangePreview,
  setCachedFileDocument,
  dropPendingEditorText,
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

/** 供脏判断定时器读取最新击键文本（不读闭包旧值）。 */
export function peekPendingEditorText(
  relativePath: string,
  workspaceId?: string,
): string | undefined {
  return peekPendingEditorTextByKey(scopedFileKey(workspaceId, relativePath));
}

const SAVE_ECHO_QUIET_MS = 1000;

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
  const previewWsId = get().selectedChangePreviewWorkspaceId;
  const previewWs =
    (get().recentWorkspaces ?? []).find((w) => w.id === previewWsId) ??
    get().appInfo?.currentWorkspace;
  if (!previewWs) {
    return;
  }
  if (previewWs.id === get().appInfo?.currentWorkspace?.id) {
    await get().openChangePreview(relativePath);
  } else {
    await get().openChangePreviewForWorkspace(previewWs.path, relativePath);
  }
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

function scheduleSelectedAutoReload(get: () => StoreState, eventPath?: string): void {
  const selected = get().selectedFilePath;
  const workspaceId = get().appInfo?.currentWorkspace?.id;
  if (!selected || !workspaceId) {
    return;
  }
  // P4 F9：闭包锁定事件时刻的归一化路径，触发时若选中已变则跳过；
  // 键同样归一化，斜杠/大小写变体不并存多定时器。
  const captured = normalizeWorkspaceRelativePath(eventPath ?? selected);
  const key = scopedFileKey(workspaceId, captured);
  scheduleExternalFollow(get, `reload:${key}`, () => {
    const current = get().selectedFilePath;
    if (!current || normalizeWorkspaceRelativePath(current) !== captured) {
      return;
    }
    // P4 F8：本次保存 1s 内的回声跳过重载（git 跟手照常），防自写自读抖动。
    const savedAt = lastSavedAtOf(key);
    if (savedAt !== undefined && Date.now() - savedAt < SAVE_ECHO_QUIET_MS) {
      return;
    }
    void get().reconcileSelectedFile();
  });
}

/** 外部旗是否指向该归一化路径（reconcile/写前比对共用，避免各处重复归一化）。 */
function externalMatchesFlag(get: () => StoreState, norm: string): boolean {
  const flag = get().externalFileChange;
  return flag !== undefined && normalizeWorkspaceRelativePath(flag.path) === norm;
}

function scheduleGitFollowQuietly(get: () => StoreState): void {
  const currentWorkspace = get().appInfo?.currentWorkspace;
  if (!currentWorkspace) {
    return;
  }
  const workspaceId = currentWorkspace.id;
  const workspacePath = currentWorkspace.path;
  scheduleExternalFollow(get, `git:${workspaceId}`, () => {
    void get().refreshGitSnapshot(workspaceId, workspacePath, { silent: true });
  });
}

function scheduleTreeFollowQuietly(
  get: () => StoreState,
  batch: { changed: string[]; removed: string[]; overflow?: boolean },
): void {
  // 文件树跟手（文件面板自动实时刷新）：当前工作区是后端 watcher 唯一监听根，
  // 批次路径即相对该根。silent 刷新不转刷新图标；溢出（批量改名/切分支/重连补发）
  // 退化为刷全部已展开工作区，与 kernel 溢出退化契约对齐。
  const currentWorkspace = get().appInfo?.currentWorkspace;
  if (!currentWorkspace) {
    return;
  }
  if (batch.overflow === true) {
    scheduleExternalFollow(get, `tree:${currentWorkspace.id}:all`, () => {
      void get().refreshAllWorkspaceTrees();
    });
    return;
  }
  if (batch.changed.length === 0 && batch.removed.length === 0) {
    return;
  }
  const workspaceId = currentWorkspace.id;
  const workspacePath = currentWorkspace.path;
  scheduleExternalFollow(get, `tree:${workspaceId}`, () => {
    void get().refreshOneWorkspaceTree(asWorkspaceID(workspaceId), workspacePath, {
      silent: true,
    });
  });
}

/**
 * 批次通道跟手（事项 13 补洞）：Tauri 下单事件 channel 无人 emit，
 * 唯一活路是 onFilesChanged 批次。命中选中文件即走同一调度器
 * （防抖 + 草稿保护 + 回声无害：重载/刷新均为只读，无循环）。
 */
export function handleExternalBatch(
  get: () => StoreState,
  batch: { changed: string[]; removed: string[]; overflow?: boolean },
): void {
  // 树跟手先行：无选中文件时同样刷新（只改了未打开的文件也要实时变），
  // 与选中重载/脏保护互不干扰。
  scheduleTreeFollowQuietly(get, batch);
  const selected = get().selectedFilePath;
  const workspaceId = get().appInfo?.currentWorkspace?.id;
  if (!selected || !workspaceId) {
    return;
  }
  const norm = normalizeWorkspaceRelativePath(selected);
  const hitPath = [...batch.changed, ...batch.removed].find(
    (p) => normalizeWorkspaceRelativePath(p) === norm,
  );
  if (hitPath !== undefined) {
    // 草稿保护前置标记（双端一致）：浏览器/预览模式没有单事件通道，
    // 批次是唯一外部信号。有未存草稿时同样立 externalFileChange 旗，
    // 供 saveFile 写前比对拦截（否则浏览器端冲突检测永不触发）；
    // 重载调度照常（reconcile 内对草稿跳过、文件消失则提示）。
    const hasDraft = get().dirtyEditorPaths.some(
      (p) => normalizeWorkspaceRelativePath(p) === norm,
    );
    if (hasDraft) {
      const prevExternal = get().externalFileChange?.path;
      const hadExternal =
        prevExternal !== undefined && normalizeWorkspaceRelativePath(prevExternal) === norm;
      if (!hadExternal) {
        get().setExternalFileChange({ path: hitPath, lastModifiedAt: Date.now() });
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const dict = locale === 'en-US' ? fileEn : fileZh;
        get().showToast(dict.fileExternalChangedWhileDirty, 'warning');
      }
    }
    scheduleSelectedAutoReload(get, hitPath);
  }
  // 溢出批次（重连补发/大批量截断）载荷为空但语义是"有变化"：
  // 同样跟手 git，否则断线窗口内的变更永不进变更面板，只能靠手动刷新。
  if (batch.changed.length > 0 || batch.removed.length > 0 || batch.overflow === true) {
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
     * [prefetchChangePreviewForWorkspace - hover 意图预取变更预览]
     * 只写缓存，不碰选择态/加载态，不推进全局请求 seq（与点击的 open 链无竞态，
     * 点击已在途或加载中时直接跳过）。重型预览不入缓存。
     * @see shared/ipc.ts → workspace.getChangePreviewForWorkspace
     */
    prefetchChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      const state = get();
      if (state.changePreviewLoading || pendingChangePreviewPath !== undefined) {
        return;
      }
      const workspaceId = state.recentWorkspaces.find((w) => w.path === workspacePath)?.id;
      const cacheKey = scopedFileKey(workspaceId, relativePath);
      if (getCachedChangePreview(cacheKey)) {
        return;
      }
      // 纪元快照（P4-R1-N3）：等待期间若发生过预览清空，落定即放弃写缓存，
      // 避免把刚失效的旧 diff 又种回去（选择态不受影响）。
      const cancelEpoch = previewCancelEpoch;
      const result = await window.digitalLife.workspace.getChangePreviewForWorkspace(
        workspacePath,
        relativePath,
      );
      if (!result.ok) {
        return;
      }
      // 落定再校验（P4-R1-F1）：点击已在途则其落定写新鲜值，此处跳过；
      // 已有缓存（点击先落定）同样跳过，避免旧预取覆盖新鲜缓存。
      // 清空纪元已推进（其间发生过清空）同样跳过（N3）。
      if (
        pendingChangePreviewPath !== undefined ||
        getCachedChangePreview(cacheKey) ||
        previewCancelEpoch !== cancelEpoch
      ) {
        return;
      }
      const isHeavy =
        result.data.baseContent.length > TEXT_HEAVY_PREVIEW_CHARS ||
        result.data.currentContent.length > TEXT_HEAVY_PREVIEW_CHARS;
      if (!isHeavy) {
        setCachedChangePreview(cacheKey, result.data);
      }
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
       * 注意：此处不再顺手打灰点（dirtyEditorPaths 只属于"用户未存输入"）。
       * 旧逻辑把外部变更也标脏，导致两害：①自动重载被"草稿优先"挡掉；
       * ② saveDirtyEditors 会用旧基线回写，覆盖外部新内容。外部态只走
       * externalFileChange（树上有独立标识），与脏点解耦。 */
      const prevExternal = get().externalFileChange?.path;
      const hadExternal =
        prevExternal !== undefined && normalizeWorkspaceRelativePath(prevExternal) === incoming;
      set({
        externalFileChange: { path, lastModifiedAt },
      });
      // P4 F7：仅真有脏草稿时提示一次（干净文件静默重载，对标 VSCode）；
      // hadExternal 归一化比较，斜杠/大小写变体不重复弹。
      const hasDraft = get().dirtyEditorPaths.some(
        (p) => normalizeWorkspaceRelativePath(p) === incoming,
      );
      if (hasDraft && !hadExternal) {
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const dict = locale === 'en-US' ? fileEn : fileZh;
        get().showToast(dict.fileExternalChangedWhileDirty, 'warning');
      }
      // 方案 A：干净即重载（防抖；触发时若用户刚开始打字，reconcile 按草稿跳过）。
      scheduleSelectedAutoReload(get, path);
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
    noteEditorText: (relativePath: string, text: string, workspaceId?: string) => {
      // P4 F1：键跟文件所属工作区走（跨工作区选中文件时用 selectedFileWorkspaceId），
      // 不再一律按当前工作区，避免草稿写入错误工作区的同名文件。
      const key = scopedFileKey(workspaceId ?? get().appInfo?.currentWorkspace?.id, relativePath);
      setPendingEditorText(key, text);
    },

    /**
     * [saveFile - 保存文件]
     * 写前比对：有未存草稿且 externalFileChange 指向同一文件（外部已改）时，
     * 非 force 调用一律拦截——推右下角冲突卡片供用户拍板，返回 false
     * （自动保存静默跳过、切换前 flush 计入 failed 中止切换）。
     * force=true 仅由冲突卡片"用我的覆盖"使用。
     * @writes editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.dirtyEditorPaths
     * @see shared/ipc.ts → workspace.updateFileContent
     * @see mock-bridge.ts → workspace.updateFileContent
     * @see preview-bridge/index.ts → workspace.updateFileContent
     */
    saveFile: async (
      relativePath?: string,
      workspacePath?: string,
      options?: { force?: boolean },
    ) => {
      const currentWorkspace = get().appInfo?.currentWorkspace;
      const targetPath = relativePath ?? get().selectedFilePath;
      if (!targetPath) {
        return true;
      }
      // P4 F1：目标工作区按"显式路径 > 选中文件所属 > 当前"解析，键与落盘同目标。
      const selectedWsId = get().selectedFileWorkspaceId;
      const allWorkspaces = get().recentWorkspaces ?? [];
      const targetWs =
        (workspacePath ? allWorkspaces.find((w) => w.path === workspacePath) : undefined) ??
        (relativePath === undefined || targetPath === get().selectedFilePath
          ? allWorkspaces.find((w) => w.id === selectedWsId)
          : undefined) ??
        currentWorkspace;
      const rootPath = workspacePath ?? targetWs?.path ?? currentWorkspace?.path;
      if (!rootPath || !targetWs) {
        return true;
      }
      const norm = normalizeWorkspaceRelativePath(targetPath);
      const key = scopedFileKey(targetWs.id, targetPath);
      const pending = peekPendingEditorTextByKey(key);
      if (pending === undefined) {
        // 脏而无暂存 = 过期标记（旧定时器闭包/重启恢复）：只清标记，绝不拿基线回写。
        clearStaleDirtyMark(set, norm);
        return true;
      }
      if (options?.force !== true) {
        // 写前比对：外部已改 + 本地有草稿 = 直接落盘会覆盖外部（1s 自动保存竞态）。
        // 拦截并推冲突卡片（同文件同工作区只一张，自动保存重试不刷屏），
        // 由用户在卡片上选"用我的覆盖 / 用磁盘覆盖 / 稍后再说"。
        const externalPath = get().externalFileChange?.path;
        if (
          externalPath !== undefined &&
          normalizeWorkspaceRelativePath(externalPath) === norm
        ) {
          get().pushFileConflictNotice(targetPath, targetWs.id, rootPath);
          return false;
        }
      }
      const content = pending;
      clearError(get, SCOPE);
      const bridgeWsPath =
        workspacePath ?? (targetWs.id !== currentWorkspace?.id ? targetWs.path : undefined);
      const result = await window.digitalLife.workspace.updateFileContent(
        targetPath,
        content,
        bridgeWsPath,
      );
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      // 精确删本条暂存（保留 savedAt 供回声窗口），落定推进代际。
      dropPendingEditorText(targetWs.id, targetPath);
      markSavedAt(key);
      nextFileGen(key);
      setCachedFileDocument(key, {
        content: result.data.content,
        lastModifiedAt: result.data.lastModifiedAt,
      });
      // diff 预览缓存同失效，否则变更面板的 diff 停在旧内容（60s TTL 缓存优先）。
      invalidateCachedChangePreview(key);
      // 落盘即跟手（报告 2）：本次保存的变更立刻进变更面板，不等 watcher 回声。
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
     * [resolveFileConflict - 裁决右下角存盘冲突卡片]
     * mine: 以 force 落盘覆盖磁盘（写前比对仅放行本次）；
     * disk: 丢本地草稿 + 清脏标 + 清外部旗 + 失效两端缓存 + 重读磁盘；
     * later: 仅关卡片（外部旗保留，下次保存/自动保存再推卡）。
     */
    resolveFileConflict: async (noticeId: string, choice: 'mine' | 'disk' | 'later') => {
      const notice = get().fileOpNotices.find((n) => n.id === noticeId);
      get().dismissFileOpNotice(noticeId);
      if (!notice || notice.kind !== 'conflict' || !notice.path) {
        return;
      }
      if (choice === 'later') {
        return;
      }
      const targetPath = notice.path;
      const targetWsId = notice.workspaceId;
      if (choice === 'mine') {
        await get().saveFile(targetPath, notice.workspacePath, { force: true });
        return;
      }
      // disk：用磁盘覆盖我的——草稿与脏标清掉，重读即干净基线。
      if (targetWsId) {
        dropPendingEditorText(targetWsId, targetPath);
      }
      const norm = normalizeWorkspaceRelativePath(targetPath);
      invalidateCachedFileDocument(scopedFileKey(targetWsId, targetPath));
      invalidateCachedChangePreview(scopedFileKey(targetWsId, targetPath));
      set((state: StoreState) => {
        const nextDirty = state.dirtyEditorPaths.filter(
          (p) => normalizeWorkspaceRelativePath(p) !== norm,
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        const externalMatches =
          state.externalFileChange !== undefined &&
          normalizeWorkspaceRelativePath(state.externalFileChange.path) === norm;
        return {
          dirtyEditorPaths: nextDirty,
          ...(externalMatches ? { externalFileChange: undefined } : {}),
        };
      });
      await get().reconcileSelectedFile();
    },

    /**
     * [saveDirtyEditors - 保存全部脏文件]
     * 切换文件/分支/工作区前的 flush 点；按暂存键（工作区归属明确）逐个落盘，
     * 单个失败不阻断其余（错误已上报），调用方按 failed 决定是否继续切换。
     * @returns {saved, failed}（saved 仅计真正写盘成功的；过期标记清理不计）
     */
    saveDirtyEditors: async () => {
      // P4 F1：按 pending 键（自带工作区归属）而非裸 dirty 路径遍历，避免跨工作区误定向。
      let saved = 0;
      let failed = 0;
      for (const key of pendingEditorTextKeys()) {
        const separator = key.indexOf(':');
        if (separator < 0) {
          continue;
        }
        const wsId = key.slice(0, separator);
        const relPath = key.slice(separator + 1);
        const ws =
          (get().recentWorkspaces ?? []).find((w) => w.id === wsId) ??
          get().appInfo?.currentWorkspace;
        const hadPending = peekPendingEditorTextByKey(key) !== undefined;
        const ok = await get().saveFile(
          relPath,
          ws && ws.id !== get().appInfo?.currentWorkspace?.id ? ws.path : undefined,
        );
        if (!ok) {
          failed += 1;
        } else if (hadPending && peekPendingEditorTextByKey(key) === undefined) {
          // 暂存被消费 = 真正落盘一次；no-op 路径（并发已存）不计。
          saved += 1;
        }
      }
      // 无暂存配套的脏标记（过期/重启残留）一并清掉；有暂存的一律保留（含刚失败的）。
      const liveRelPaths = new Set(
        pendingEditorTextKeys().map((key) => key.slice(key.indexOf(':') + 1)),
      );
      for (const dirtyPath of [...get().dirtyEditorPaths]) {
        const norm = normalizeWorkspaceRelativePath(dirtyPath);
        if (!liveRelPaths.has(norm)) {
          clearStaleDirtyMark(set, norm);
        }
      }
      return { saved, failed };
    },

    /**
     * [reconcileSelectedFile - 对账选中文件与磁盘]
     * 绕过缓存重读：有未存草稿则跳过（保草稿优先，外部旗保留供写前比对）；
     * 文件消失则清为空白内容（复用 fileOpenError 友好视图）；
     * 内容变化则更新基线。无草稿对账成功即清外部旗——内容区已与磁盘一致，
     * 残留旗会导致下次保存误弹冲突卡。供刷新按钮/分支切换后调用，
     * 解决“内容区不跟手”问题。
     */
    reconcileSelectedFile: async () => {
      const selected = get().selectedFilePath;
      const currentWorkspace = get().appInfo?.currentWorkspace;
      if (!selected || !currentWorkspace) {
        return;
      }
      // P4 F1：对账跟文件所属工作区走（跨工作区选中经 readFileForWorkspace），
      // 不再一律读当前工作区。
      const selectedWsId = get().selectedFileWorkspaceId;
      const targetWs =
        (get().recentWorkspaces ?? []).find((w) => w.id === selectedWsId) ?? currentWorkspace;
      const norm = normalizeWorkspaceRelativePath(selected);
      const hasDraft = get().dirtyEditorPaths.some(
        (p) => normalizeWorkspaceRelativePath(p) === norm,
      );
      const key = scopedFileKey(targetWs.id, selected);
      invalidateCachedFileDocument(key);
      clearError(get, SCOPE);
      const gen = nextFileGen(key);
      const result =
        targetWs.id === currentWorkspace.id
          ? await window.digitalLife.workspace.readFile(selected)
          : await window.digitalLife.workspace.readFileForWorkspace(targetWs.path, selected);
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
            workspaceId: targetWs.id,
            workspacePath: targetWs.path,
          },
          // 无草稿：内容区已按磁盘置空，外部旗同步清（有草稿分支早已 return）。
          ...(externalMatchesFlag(get, norm) ? { externalFileChange: undefined } : {}),
        });
        return;
      }
      if (hasDraft) {
        // P4 F6：草稿优先且不污染缓存——该读仅用于"还在不在"的判断，
        // 基线/缓存/视图一律不动。
        return;
      }
      setCachedFileDocument(key, {
        content: result.data.content,
        lastModifiedAt: result.data.lastModifiedAt,
      });
      const baseline = get().fileContent ?? '';
      if (baseline !== result.data.content) {
        // 预览缓存键跟预览所属工作区走（与文件所属可能不同），两边都失效。
        const previewWsId = get().selectedChangePreviewWorkspaceId;
        if (previewWsId && previewWsId !== targetWs.id) {
          invalidateCachedChangePreview(scopedFileKey(previewWsId, selected));
        }
        set({
          fileContent: result.data.content,
          fileLastModifiedAt: result.data.lastModifiedAt,
          fileOpenError: null,
          // 内容区已与磁盘一致：外部旗同步清，防下次保存误弹冲突卡。
          ...(externalMatchesFlag(get, norm) ? { externalFileChange: undefined } : {}),
          outline:
            result.data.content.length > TEXT_HEAVY_PREVIEW_CHARS
              ? []
              : buildOutlineFromContent(result.data.content, selected),
        });
        // 磁盘变了 diff 必变：清预览缓存并重拍打开中的 diff（用户预览请求在途则让路）。
        invalidateCachedChangePreview(key);
        await refreshOpenPreviewIfSelected(get, selected);
      } else if (externalMatchesFlag(get, norm)) {
        // 内容本来就一致（仅 mtime/回声类事件）：同样清旗，不碰内容区。
        set({ externalFileChange: undefined });
      }
    },

    /**
     * [reconcileSelectedFileAfterWorkspaceSwitch - 工作区切换后对账选中文件]
     * 供 openWorkspace 在 bootstrap 后调用（worktree 替换式分支切换等场景）。
     * 选中无归属（workspaceId 为空）→ 无法判定家园，不动（P4-R1-F7）；
     * 源工作区仍在侧栏 → 归属明确，走常规 reconcile 保鲜（错误卡语义不变）；
     * 源已不在 → 在新上下文重读，缺失则清空为空（事项5，不挂错误卡），
     * 命中则内存归属到新工作区（不写 lastFile，避免巧合重名污染重启恢复）；
     * 有未存草稿则一律不动（切前已落盘，此处为兜底）。
     */
    reconcileSelectedFileAfterWorkspaceSwitch: async () => {
      const selected = get().selectedFilePath;
      const currentWorkspace = get().appInfo?.currentWorkspace;
      if (!selected || !currentWorkspace) {
        return;
      }
      const norm = normalizeWorkspaceRelativePath(selected);
      const hasDraft = get().dirtyEditorPaths.some(
        (p) => normalizeWorkspaceRelativePath(p) === norm,
      );
      if (hasDraft) {
        return;
      }
      const selectedWsId = get().selectedFileWorkspaceId;
      if (selectedWsId === undefined) {
        return;
      }
      const sourceListed = (get().recentWorkspaces ?? []).some(
        (w) => w.id === selectedWsId && !w.removedFromSidebar && w.available,
      );
      if (sourceListed) {
        await get().reconcileSelectedFile();
        return;
      }
      const key = scopedFileKey(currentWorkspace.id, selected);
      invalidateCachedFileDocument(key);
      clearError(get, SCOPE);
      const gen = nextFileGen(key);
      const result = await window.digitalLife.workspace.readFile(selected);
      if (!isCurrentFileGen(key, gen)) {
        return;
      }
      if (!result.ok) {
        set({
          selectedFilePath: undefined,
          selectedFileWorkspaceId: undefined,
          fileContent: undefined,
          fileMedia: null,
          fileMediaLoading: false,
          fileLastModifiedAt: undefined,
          fileOpenError: null,
          outline: [],
          positioningPath: null,
        });
        return;
      }
      setCachedFileDocument(key, {
        content: result.data.content,
        lastModifiedAt: result.data.lastModifiedAt,
      });
      set({
        selectedFileWorkspaceId: currentWorkspace.id,
        fileContent: result.data.content,
        fileMedia: null,
        fileMediaLoading: false,
        fileLastModifiedAt: result.data.lastModifiedAt,
        fileOpenError: null,
        outline:
          result.data.content.length > TEXT_HEAVY_PREVIEW_CHARS
            ? []
            : buildOutlineFromContent(result.data.content, selected),
      });
      // 内存归属即可，不写 lastFile（P4-R1-F6）：跨仓重名巧合不应污染重启恢复。
    },
  };
}
