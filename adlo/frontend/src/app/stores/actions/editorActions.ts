import type { StoreState } from '../StoreState';
import { createEditorTab } from '@utils/editorTabs';
import { buildOutlineFromContent } from '@shared/outline';
import { normalizeWorkspaceRelativePath, mergeDirtyEditorPaths } from '@utils/workspacePaths';
import { sameWorkspacePath } from '@shared/workspacePathMatch';
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
import {
  beginSaveSequence,
  classifyDiskContent,
  clearExternalSignal,
  clearLocalWriteContent,
  enqueueEditorSave,
  hasRecentExternalSignal,
  isLatestSaveSequence,
  noteExternalSignal,
  noteLocalWriteContent,
} from '../editorSavePipeline';
import type { StoreApi } from 'zustand';
import {
  clearError,
  captureError,
  invalidateCachedChangePreview,
  invalidateCachedFileDocument,
  getCachedChangePreview,
  getCachedFileDocument,
  previewCancelEpoch,
  setCachedChangePreview,
  setCachedFileDocument,
  dropPendingEditorText,
} from '../cacheHelpers';
import { persistField } from '../persisted/apply';
import type { FileConflictChoice } from '../slices/fileOpNoticeSlice';
import {
  openFileGeneric,
  openMediaFileGeneric,
  openChangePreviewGeneric,
} from './editorActionsHelpers';
import {
  categorizeFile,
  isLegacyOfficeFile,
  isMediaFileCategory,
} from '../../regions/right-panel/fileTypeRouter';
import { refreshTreeByWorkspacePath } from './workspaceActions';
import { insertTreeNode } from './workspaceTreeRename';
import { asWorkspaceID } from '../../../shared/branded';
import { partitionBatchPaths } from './gitMetaBatch';
import {
  createExternalWorkspaceEntry,
  isExternalWorkspaceId,
  splitAbsolutePath,
} from './externalWorkspace';
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
  // 选中文件可能属于侧栏里的另一个工作区：草稿/回声键必须跟文件归属走，
  // 不能用当前工作区 id 组键（否则跨工作区选中时恒判「无草稿」）。
  const targetWorkspaceId = get().selectedFileWorkspaceId ?? workspaceId;
  const key = scopedFileKey(targetWorkspaceId, captured);
  scheduleExternalFollow(get, `reload:${key}`, () => {
    const current = get().selectedFilePath;
    if (!current || normalizeWorkspaceRelativePath(current) !== captured) {
      return;
    }
    // 有草稿时必须进 reconcile 做磁盘内容比对（自写回声/真外部变更都可能
    // 发生在保存前后）；保存回声静默窗口只用于「无草稿」的重载防抖。
    const hasPendingDraft = peekPendingEditorTextByKey(key) !== undefined;
    if (!hasPendingDraft && !hasRecentExternalSignal(key)) {
      // P4 F8：本次保存 1s 内的回声跳过重载（git 跟手照常），防自写自读抖动。
      // 但存在新鲜 watcher 信号时不能跳过：必须读盘分类，否则信号老化后
      // 自动保存会失去复核窗口。
      const savedAt = lastSavedAtOf(key);
      if (savedAt !== undefined && Date.now() - savedAt < SAVE_ECHO_QUIET_MS) {
        return;
      }
    }
    void get().reconcileSelectedFile();
  });
}

/** 外部旗是否指向该归一化路径（reconcile/写前比对共用，避免各处重复归一化）。 */
function externalMatchesFlag(get: () => StoreState, norm: string): boolean {
  const flag = get().externalFileChange;
  return flag !== undefined && normalizeWorkspaceRelativePath(flag.path) === norm;
}

/**
 * 取目标文件自己的基线内容。`fileContent` 只代表当前选中文件；保存非选中
 * 文件的暂存草稿（切前 flush）时必须回退到该键的文档缓存，不能拿选中文件
 * 的正文顶替。缓存缺失时返回 undefined，交由 classifyDiskContent 走保守路径。
 */
function baselineContentForTarget(
  get: () => StoreState,
  key: string,
  targetPath: string,
  targetWorkspaceId: string | undefined,
): string | undefined {
  const selected = get().selectedFilePath;
  const selectedNorm = selected ? normalizeWorkspaceRelativePath(selected) : undefined;
  const targetNorm = normalizeWorkspaceRelativePath(targetPath);
  if (
    selectedNorm !== undefined &&
    selectedNorm === targetNorm &&
    (targetWorkspaceId === undefined || get().selectedFileWorkspaceId === targetWorkspaceId)
  ) {
    return get().fileContent;
  }
  return getCachedFileDocument(key)?.content;
}

/**
 * 媒体/办公预览的对账：外部变更后重读字节并刷新预览。
 *
 * 文本通道的草稿保护不适用于媒体（没有可编辑缓冲区）：只要磁盘 mtime/size
 * 变了就整份替换；文件消失则清空为错误视图（与文本同语义）。旧的 OLE 办公格式
 * 不读字节（打开时即为占位文档），直接跳过。
 */
async function reconcileSelectedMedia(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  selected: string,
  targetWs: { id: string; path: string },
): Promise<void> {
  if (isLegacyOfficeFile(selected)) {
    return;
  }
  const genKey = `media:${targetWs.id}:${selected}`;
  const gen = nextFileGen(genKey);
  const norm = normalizeWorkspaceRelativePath(selected);
  try {
    clearError(get, SCOPE);
    const result =
      targetWs.id === get().appInfo?.currentWorkspace?.id
        ? await window.digitalLife.workspace.readMediaFile(selected)
        : await window.digitalLife.workspace.readMediaFileForWorkspace(targetWs.path, selected);
    if (!isCurrentFileGen(genKey, gen)) {
      return;
    }
    if (get().selectedFilePath !== selected || get().selectedFileWorkspaceId !== targetWs.id) {
      return;
    }
    if (!result.ok) {
      set({
        fileMedia: null,
        fileMediaLoading: false,
        fileContent: undefined,
        fileLastModifiedAt: undefined,
        outline: [],
        fileOpenError: {
          path: selected,
          code: 'NOT_FOUND',
          message: result.error.message,
          workspaceId: targetWs.id,
          workspacePath: targetWs.path,
        },
        ...(externalMatchesFlag(get, norm) ? { externalFileChange: undefined } : {}),
      });
      return;
    }
    const current = get().fileMedia;
    if (
      current &&
      current.path === result.data.path &&
      current.lastModifiedAt === result.data.lastModifiedAt &&
      current.size === result.data.size
    ) {
      // 内容未变（仅 mtime/回声类事件）：不重设，避免预览重建闪烁。
      return;
    }
    set({
      fileMedia: result.data,
      fileMediaLoading: false,
      fileContent: undefined,
      fileLastModifiedAt: result.data.lastModifiedAt,
      fileOpenError: null,
      outline: [],
      ...(externalMatchesFlag(get, norm) ? { externalFileChange: undefined } : {}),
    });
  } catch (err) {
    captureError(get, err, SCOPE);
  } finally {
    clearExternalSignal(scopedFileKey(targetWs.id, selected));
  }
}

function scheduleGitFollowQuietly(
  get: () => StoreState,
  workspaceId: string,
  workspacePath: string,
): void {
  scheduleExternalFollow(get, `git:${workspaceId}`, () => {
    void get().refreshGitSnapshot(workspaceId, workspacePath, { silent: true });
  });
}

interface WatchTarget {
  id: string;
  path: string;
}

/**
 * 批次归属解析：把一条批次落到一个或多个已添加工作区上。
 *
 * - 带 `rootPath`：只命中路径相同的工作区（桌面/浏览器多根 watcher 的正常形态）。
 * - 不带 `rootPath`（重连补发 / 慢订阅者 overflow）：视为"全部工作区"，
 *   逐根静默补刷，避免断线窗口内的变更永久丢失。
 */
function resolveWatchTargets(get: () => StoreState, rootPath?: string): WatchTarget[] {
  const state = get();
  const targets: WatchTarget[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined, path: string | undefined) => {
    if (!id || !path || seen.has(id)) {
      return;
    }
    seen.add(id);
    targets.push({ id, path });
  };
  for (const entry of state.recentWorkspaces ?? []) {
    if (entry.removedFromSidebar) {
      continue;
    }
    push(entry.id, entry.path);
  }
  // 当前工作区可能尚未出现在侧栏列表（首次打开/启动恢复的短暂窗口）：补上。
  push(state.appInfo?.currentWorkspace?.id, state.appInfo?.currentWorkspace?.path);
  if (!rootPath) {
    return targets;
  }
  const all = state.recentWorkspaces ?? [];
  return targets.filter((target) => {
    const entry = all.find((w) => w.id === target.id);
    return sameWorkspacePath(target.path, rootPath) || sameWorkspacePath(entry?.rootPath, rootPath);
  });
}

function scheduleTreeFollowQuietly(get: () => StoreState, target: WatchTarget): void {
  // 文件树跟手：只刷新"已有树数据"的工作区（未加载的没有陈旧数据，
  // 首次展开时本来就会全量拉取）。silent 不转刷新图标。
  if (get().workspaceTrees[target.id] === undefined) {
    return;
  }
  scheduleExternalFollow(get, `tree:${target.id}`, () => {
    void get().refreshOneWorkspaceTree(asWorkspaceID(target.id), target.path, { silent: true });
  });
}

function scheduleChangesFollowQuietly(get: () => StoreState, target: WatchTarget): void {
  const state = get();
  // 变更面板已展开，或该工作区快照已加载过：静默重拍快照（含已打开的 diff 预览）。
  if (state.gitSnapshots[target.id] === undefined && !state.workspaceChangesExpanded[target.id]) {
    return;
  }
  scheduleGitFollowQuietly(get, target.id, target.path);
}

/**
 * 批次通道跟手（事项 13 补洞）：Tauri 下单事件 channel 无人 emit，
 * 主要通路是 onFilesChanged 批次。批次带 `rootPath` 时只刷新该工作区，
 * 不带时按全部已添加工作区补刷；选中文件走同一调度器
 * （防抖 + 草稿保护 + 回声无害：重载/刷新均为只读，无循环）。
 */
export function handleExternalBatch(
  get: () => StoreState,
  batch: { rootPath?: string; changed: string[]; removed: string[]; overflow?: boolean },
): void {
  const targets = resolveWatchTargets(get, batch.rootPath);
  if (targets.length === 0) {
    return;
  }
  // git 元数据批次（HEAD/index/refs/logs 等 watcher 合成路径）：无 overflow 时只触发
  // git 快照静默刷新，不做文件树全量重扫、不记外部信号、不打选中文件对账；
  // overflow 批次无法归因，按整轮重扫 + 选中 reconcile 处理（契约既定）。
  // 否则 `git status`（人写一次可能回写 index）会放大成树重扫风暴。
  const { git: gitChanged, normal: normalChanged } = partitionBatchPaths(batch.changed);
  const { git: gitRemoved, normal: normalRemoved } = partitionBatchPaths(batch.removed);
  const hasNormalPayload =
    batch.overflow === true || normalChanged.length > 0 || normalRemoved.length > 0;
  const hasGitPayload = gitChanged.length > 0 || gitRemoved.length > 0;
  if (!hasNormalPayload && !hasGitPayload) {
    return;
  }
  for (const target of targets) {
    if (hasNormalPayload) {
      scheduleTreeFollowQuietly(get, target);
    }
    scheduleChangesFollowQuietly(get, target);
    if (!hasNormalPayload) {
      continue;
    }
    for (const path of normalChanged) {
      noteExternalSignal(scopedFileKey(target.id, path));
    }
    for (const path of normalRemoved) {
      noteExternalSignal(scopedFileKey(target.id, path));
    }
  }

  const selected = get().selectedFilePath;
  if (!selected) {
    return;
  }
  const selectedWorkspaceId = get().selectedFileWorkspaceId ?? get().appInfo?.currentWorkspace?.id;
  const selectedTarget = targets.find((target) => target.id === selectedWorkspaceId);
  if (!selectedTarget) {
    // 选中文件属于未被本批次覆盖的工作区：不动它（该工作区自己的批次会处理）。
    return;
  }
  if (batch.overflow === true) {
    // 溢出批次载荷为空但语义是「有变化」：选中文件同样要进 reconcile
    // 读盘分类，否则外部修改只留下 3s 信号，之后自动保存可能静默覆盖。
    noteExternalSignal(scopedFileKey(selectedTarget.id, selected));
    scheduleSelectedAutoReload(get, selected);
    return;
  }
  const norm = normalizeWorkspaceRelativePath(selected);
  const hitPath = [...normalChanged, ...normalRemoved].find(
    (p) => normalizeWorkspaceRelativePath(p) === norm,
  );
  if (hitPath !== undefined) {
    // 批次是浏览器/预览模式唯一的外部信号。是否有草稿、是自写回声还是
    // 真外部修改，统一交给 reconcile 读磁盘内容后判定（不能只看路径+脏标：
    // watcher 会回传应用自身的新建/保存写入）。
    scheduleSelectedAutoReload(get, hitPath);
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

/**
 * 编辑器动作集合（导航索引，按 action 名定位；文件较大，优先用 grep/索引）：
 *
 * - 打开与恢复：openFile / openFileForWorkspace / openFileOutsideWorkspaces /
 *   rememberLastOpenedFile / restoreLastOpenedFile
 * - 变更预览：openChangePreview / openChangePreviewForWorkspace /
 *   prefetchChangePreviewForWorkspace
 * - 新建：createWorkspaceFile / createWorkspaceFolder
 * - 草稿与保存：markExternalFileChange / notifyEditorBufferDirty / noteEditorText /
 *   saveFile / resolveFileConflict / saveDirtyEditors
 * - 对账：reconcileSelectedFile / reconcileSelectedFileAfterWorkspaceSwitch
 *
 * 外部文件的根解析与隐藏工作区身份在 ./externalWorkspace.ts；保存目标按
 * `saveFile(rel, path, { workspaceId })` 显式定向，不要按“当前选中文件”反推。
 */
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
      // 切文件前落盘脏缓冲（自动保存语义），再读新文件。落盘失败（例如冲突卡
      // 未裁决）时中止切换：否则读盘会把磁盘内容写回 fileContent 并清外部旗，
      // 残留草稿随后 flush 会在无旗保护下覆盖外部版本。
      const flush = await get().saveDirtyEditors();
      const workspaceId = get().appInfo?.currentWorkspace?.id;
      if (
        flush.failed > 0 &&
        peekPendingEditorTextByKey(scopedFileKey(workspaceId, relativePath)) !== undefined
      ) {
        // 目标文件自身仍有未落盘草稿（冲突未裁决）：不能读盘覆盖当前草稿。
        // 其它文件失败不阻塞打开目标文件，其外部旗会保留到下次 flush。
        return;
      }
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
      options: { silentError?: boolean } = {},
    ) => {
      const flush = await get().saveDirtyEditors();
      if (
        flush.failed > 0 &&
        peekPendingEditorTextByKey(scopedFileKey(workspaceId, relativePath)) !== undefined
      ) {
        return;
      }
      const category = categorizeFile(relativePath);
      const opened = isMediaFileCategory(category)
        ? await openMediaFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            workspaceId,
            workspacePath,
            silentError: options.silentError,
            readMediaFile: () =>
              window.digitalLife.workspace.readMediaFileForWorkspace(workspacePath, relativePath),
          })
        : await openFileGeneric(set, get, relativePath, getNextFileRequestSeq(), {
            cacheKey: scopedFileKey(workspaceId, relativePath),
            workspaceId,
            workspacePath,
            silentError: options.silentError,
            readFile: () =>
              window.digitalLife.workspace.readFileForWorkspace(workspacePath, relativePath),
          });
      if (opened) {
        get().rememberLastOpenedFile(workspaceId, relativePath);
      }
    },

    /**
     * [openFileOutsideWorkspaces - 打开不属于任何侧栏工作区的绝对路径文件]
     *
     * 仅创建内存隐藏工作区（`removedFromSidebar: true`）：侧栏不出现、不落盘、
     * 不触发服务端 `detect_root` 上溯（旧实现会把文件所在目录登记成工作区，
     * 用户从未添加的目录会突然出现在侧栏）。读取/保存仍走既有工作区链路，
     * 根目录就是文件所在目录。
     *
     * 根同时写入 `externalFileRoots`：`recentWorkspaces` 会被 `setRecentWorkspaces`
     * 整体替换（添加/移除工作区、切换、启动），只靠数组条目会让保存/对账失去目标。
     * @returns false 表示路径不可解析（调用方负责提示）。
     * @see externalWorkspace.ts → createExternalWorkspaceEntry
     */
    openFileOutsideWorkspaces: async (absPath: string) => {
      const split = splitAbsolutePath(absPath);
      if (!split) {
        return false;
      }
      const { rootPath, fileName } = split;
      const entry = createExternalWorkspaceEntry(rootPath);
      const state = get();
      const existing = state.recentWorkspaces.find((w) => w.id === entry.id);
      const previousRoots = state.externalFileRoots ?? {};
      // 复用命中时把 key 移到末尾，使对象插入顺序即 LRU 顺序。
      const { [entry.id]: _existingRoot, ...restRoots } = previousRoots;
      let nextRoots: Record<string, string> = { ...restRoots, [entry.id]: entry.rootPath };
      if (Object.keys(nextRoots).length > 20) {
        // 保护当前选中与仍有暂存草稿的外部根，其余按 LRU 淘汰。
        const protectedIds = new Set<string>();
        if (state.selectedFileWorkspaceId) {
          protectedIds.add(state.selectedFileWorkspaceId);
        }
        for (const key of pendingEditorTextKeys()) {
          const id = key.slice(0, key.indexOf(':'));
          if (isExternalWorkspaceId(id)) {
            protectedIds.add(id);
          }
        }
        const removable = Object.keys(nextRoots).filter(
          (id) => id !== entry.id && !protectedIds.has(id),
        );
        while (Object.keys(nextRoots).length > 20 && removable.length > 0) {
          const evicted = removable.shift();
          if (evicted === undefined) {
            break;
          }
          const { [evicted]: _evictedRoot, ...kept } = nextRoots;
          nextRoots = kept;
        }
      }
      const keptExternalIds = new Set(Object.keys(nextRoots));
      let nextWorkspaces: typeof state.recentWorkspaces;
      if (!existing) {
        nextWorkspaces = [...state.recentWorkspaces.filter((w) => w.id !== entry.id), entry].filter(
          (w) => !isExternalWorkspaceId(w.id) || keptExternalIds.has(w.id),
        );
      } else {
        nextWorkspaces = state.recentWorkspaces
          .map((w) =>
            w.id === entry.id
              ? { ...w, path: entry.path, rootPath: entry.rootPath, lastOpenedAt: Date.now() }
              : w,
          )
          .filter((w) => !isExternalWorkspaceId(w.id) || keptExternalIds.has(w.id));
      }
      set({ externalFileRoots: nextRoots, recentWorkspaces: nextWorkspaces });
      await get().openFileForWorkspace(entry.id, rootPath, fileName);
      return true;
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
        if (isExternalWorkspaceId(last.workspaceId)) {
          // 外部文件工作区只存在于会话内存，重启即失效：静默跳过，不提示"文件缺失"。
          return;
        }
        set({ sessionRestoreNotice: 'sessionLastFileMissing' });
        return;
      }
      try {
        await get().openFileForWorkspace(last.workspaceId, ws.path, last.relativePath, {
          silentError: true,
        });
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
     * @writes editorSlice.selectedChangePreviewPath, editorSlice.selectedChangePreviewWorkspaceId, editorSlice.changePreview, editorSlice.changePreviewMedia, editorSlice.changePreviewMediaError, editorSlice.changePreviewLoading, editorSlice.changePreviewMediaLoading
     * @see shared/ipc.ts → workspace.getChangePreview
     * @see mock-bridge.ts → workspace.getChangePreview
     * @see preview-bridge/index.ts → workspace.getChangePreview
     */
    openChangePreview: async (relativePath: string) => {
      await openChangePreviewGeneric(set, get, relativePath, getNextChangePreviewRequestSeq(), {
        cacheKey: getWorkspaceScopedCacheKey(get().appInfo, relativePath),
        workspaceId: get().appInfo?.currentWorkspace?.id,
        workspacePath:
          get().appInfo?.currentWorkspace?.rootPath ?? get().appInfo?.currentWorkspace?.path,
        getPreview: () => window.digitalLife.workspace.getChangePreview(relativePath),
      });
    },

    /**
     * [openChangePreviewForWorkspace - 为指定工作区打开文件变更预览]
     * @reads workspaceSlice.recentWorkspaces
     * @writes editorSlice.selectedChangePreviewPath, editorSlice.selectedChangePreviewWorkspaceId, editorSlice.changePreview, editorSlice.changePreviewMedia, editorSlice.changePreviewMediaError, editorSlice.changePreviewLoading, editorSlice.changePreviewMediaLoading
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
        workspacePath,
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
      // 新建即本地写入：清掉同路径可能残留的旧草稿，并登记按 key 的磁盘基线。
      // 创建回声（磁盘内容 == 初始基线）由此被 classifyDiskContent 判为 unchanged。
      const createdWsId = ws?.id ?? get().appInfo?.currentWorkspace?.id;
      if (createdWsId) {
        dropPendingEditorText(createdWsId, relativePath);
        const createdKey = scopedFileKey(createdWsId, relativePath);
        // 创建回声由「磁盘内容 == 初始基线」识别；这里只登记按 key 的磁盘基线，
        // 供随后切换到其它文件时保存前复核。
        setCachedFileDocument(createdKey, {
          content: result.data.content,
          lastModifiedAt: result.data.lastModifiedAt,
        });
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
          // 新建可能发生在侧栏里非当前工作区的目录：归属必须回填，否则
          // 首次自动保存/对账会按旧工作区定向（跨仓同名文件会被覆盖）。
          selectedFileWorkspaceId: createdWsId,
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
      if (
        selected !== '' &&
        selected === incoming &&
        typeof get().fileLastModifiedAt === 'number' &&
        get().fileLastModifiedAt === lastModifiedAt
      ) {
        // 自写回声（本次保存的 watcher 回音，mtime 一致）：忽略，防重载打转。
        return;
      }
      const workspaceId = get().appInfo?.currentWorkspace?.id;
      if (workspaceId) {
        noteExternalSignal(scopedFileKey(workspaceId, path));
      }
      if (!selected || selected !== incoming) {
        const currentWorkspace = get().appInfo?.currentWorkspace;
        if (currentWorkspace) {
          scheduleGitFollowQuietly(get, currentWorkspace.id, currentWorkspace.path);
        }
        return;
      }
      /* external file changed.
       * 注意：此处不再顺手打灰点（dirtyEditorPaths 只属于"用户未存输入"）。
       * 外部态只走 externalFileChange（树上有独立标识），与脏点解耦。
       * mtime 只作为快速回声过滤；真正的「自写回声 / 真外部修改」判定
       * 交给 reconcile 读磁盘内容后完成（批次通道没有 mtime，单事件通道
       * 也不能只凭 mtime 区分应用自身写入）。 */
      scheduleSelectedAutoReload(get, path);
      const currentWorkspace = get().appInfo?.currentWorkspace;
      if (currentWorkspace) {
        scheduleGitFollowQuietly(get, currentWorkspace.id, currentWorkspace.path);
      }
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
     * 同一文件保存串行执行；任务内部重新读取暂存缓冲，保证写最新草稿。
     * 写前比对：外部旗指向同一文件时先读磁盘内容，只有「与基线/草稿/最近
     * 本地写入都不同」才拦截并推冲突卡片（过期旗会自愈清除）。
     * 保存响应永不把旧快照覆盖到新草稿上：若在途期间又有输入，保留草稿与
     * 脏标，仅同步 mtime，等待下一次自动保存。
     * force=true 仅由冲突卡片"用我的覆盖"使用。
     * @writes editorSlice.fileContent, editorSlice.fileLastModifiedAt, editorSlice.dirtyEditorPaths, fileOpNoticeSlice.fileOpNotices (冲突拦截时推卡)
     * @see shared/ipc.ts → workspace.updateFileContent
     * @see mock-bridge.ts → workspace.updateFileContent
     * @see preview-bridge/index.ts → workspace.updateFileContent
     */
    saveFile: async (
      relativePath?: string,
      workspacePath?: string,
      options?: { force?: boolean; workspaceId?: string },
    ) => {
      const currentWorkspace = get().appInfo?.currentWorkspace;
      const targetPath = relativePath ?? get().selectedFilePath;
      if (!targetPath) {
        return true;
      }
      const selectedWsId = get().selectedFileWorkspaceId;
      const allWorkspaces = get().recentWorkspaces ?? [];
      const externalRoots = get().externalFileRoots ?? {};
      const isSelectedTarget = relativePath === undefined || targetPath === get().selectedFilePath;
      const byId = (id: string | undefined): { id: string; path: string } | undefined => {
        if (!id) {
          return undefined;
        }
        const found = allWorkspaces.find((w) => w.id === id);
        if (found) {
          return { id: found.id, path: found.path };
        }
        if (externalRoots[id]) {
          return { id, path: externalRoots[id] };
        }
        if (id === currentWorkspace?.id && currentWorkspace?.path) {
          return { id, path: currentWorkspace.path };
        }
        return undefined;
      };
      const byPath = (path: string): { id: string; path: string } | undefined => {
        const found = allWorkspaces.find((w) => sameWorkspacePath(w.path, path));
        if (found) {
          return { id: found.id, path: found.path };
        }
        const externalId = Object.keys(externalRoots).find((id) =>
          sameWorkspacePath(externalRoots[id], path),
        );
        return externalId ? { id: externalId, path: externalRoots[externalId] } : undefined;
      };
      // 目标工作区按「显式 workspaceId > 显式路径 > 选中文件所属 > 当前」解析。
      // saveDirtyEditors 必须传 workspaceId：遍历的是「键」而不是当前选中文件，
      // 只按路径/选中重算会把 A 工作区的草稿落到 B 工作区的同名路径。
      const requestedWsId = options?.workspaceId;
      const intendedWsId = requestedWsId ?? (isSelectedTarget ? selectedWsId : undefined);
      const targetWs =
        (requestedWsId ? byId(requestedWsId) : undefined) ??
        (workspacePath ? byPath(workspacePath) : undefined) ??
        (isSelectedTarget ? byId(selectedWsId) : undefined) ??
        (requestedWsId || workspacePath
          ? undefined
          : currentWorkspace?.path
            ? { id: currentWorkspace.id, path: currentWorkspace.path }
            : undefined);
      if (!targetWs) {
        // 目标不可解析（外部根已不在、工作区被移除）：不能再返回 true 假装成功，
        // 否则调用方会清掉脏点、编辑区看起来"已保存"。
        return false;
      }
      // 暂存键按「文件真正所属的工作区」生成；目标解析若发生偏移（例如外部条目
      // 消失后回退到当前工作区），旧键上的草稿还在 → 不能当过期标记清掉。
      const intendedPending =
        peekPendingEditorTextByKey(scopedFileKey(intendedWsId ?? targetWs.id, targetPath)) !==
        undefined;
      const targetIsExternal = isExternalWorkspaceId(targetWs.id);

      const norm = normalizeWorkspaceRelativePath(targetPath);
      const key = scopedFileKey(targetWs.id, targetPath);
      const bridgeWsPath =
        workspacePath ?? (targetWs.id !== currentWorkspace?.id ? targetWs.path : undefined);

      // 保存代际在「请求入队时」推进：若期间又有新的保存请求，当前这次响应
      // 即使晚到也直接丢弃，不更新基线/mtime/脏标。串行链负责写入顺序。
      const seq = beginSaveSequence(key);
      // 同一文件的保存串行执行：任务在真正执行时读取暂存缓冲，避免排队期间
      // 使用旧草稿；执行期间的新输入由下一次串行保存消费。
      return enqueueEditorSave(key, async () => {
        let pending = peekPendingEditorTextByKey(key);
        if (pending === undefined) {
          if (intendedPending) {
            // 目标键与暂存键不一致（外部根/工作区解析偏移）：绝不把草稿当过期标记清掉。
            return false;
          }
          // 脏而无暂存 = 过期标记（旧定时器闭包/重启恢复）：只清标记，绝不拿基线回写。
          clearStaleDirtyMark(set, norm);
          return true;
        }
        const isSelected = () => {
          const selected = get().selectedFilePath;
          return (
            selected !== undefined &&
            normalizeWorkspaceRelativePath(selected) === norm &&
            get().selectedFileWorkspaceId === targetWs.id
          );
        };

        const hasExternalFlag = externalMatchesFlag(get, norm);
        const hasFreshWatcherSignal = hasRecentExternalSignal(key);
        const baseline = baselineContentForTarget(get, key, targetPath, targetWs.id);
        // 外部文件的隐藏根不进后端 watcher，因此有基线时每次保存都读盘比对（F9），
        // 保证别的进程改过时走冲突卡片而不是静默覆盖。基线缺失（缓存过期/被挤出）
        // 时不升级为阻塞式冲突：否则非选中文件的 flush 会误判 external 并挡住切换。
        const shouldPreflight =
          hasExternalFlag || hasFreshWatcherSignal || (targetIsExternal && baseline !== undefined);
        if (options?.force !== true && shouldPreflight) {
          // 写前比对：外部旗/watcher 信号可能来自已过期的批次。落盘前读一次磁盘，
          // 只有「磁盘内容与基线/草稿/最近本地写入都不同」才真正拦截。
          const preflight =
            targetWs.id === currentWorkspace?.id
              ? await window.digitalLife.workspace.readFile(targetPath)
              : await window.digitalLife.workspace.readFileForWorkspace(targetWs.path, targetPath);
          if (!isLatestSaveSequence(key, seq)) {
            // 预检期间已有更新的保存请求：本次不能再推冲突卡或继续写。
            return true;
          }
          // 读盘期间用户可能继续输入：重新取一次暂存缓冲，避免用旧草稿判定。
          const latestPending = peekPendingEditorTextByKey(key);
          if (latestPending === undefined) {
            clearStaleDirtyMark(set, norm);
            return true;
          }
          pending = latestPending;
          if (preflight && preflight.ok) {
            const verdict = classifyDiskContent(key, preflight.data.content, baseline, pending);
            clearExternalSignal(key);
            if (verdict === 'external') {
              // 信号尚未被 reconcile 消费：这里补立外部旗，保证冲突卡片拿到同一版本。
              set({
                externalFileChange: {
                  path: targetPath,
                  lastModifiedAt: preflight.data.lastModifiedAt,
                },
              });
              get().pushFileConflictNotice(targetPath, targetWs.id, targetWs.path);
              return false;
            }
            // 回声/内容一致：外部旗已过期，清掉后继续落盘。
            set((state: StoreState) =>
              state.externalFileChange !== undefined &&
              normalizeWorkspaceRelativePath(state.externalFileChange.path) === norm
                ? { externalFileChange: undefined }
                : state,
            );
          } else {
            // 文件已不可读（删除/权限）：仍交给冲突卡片裁决，避免静默覆盖失败。
            clearExternalSignal(key);
            get().pushFileConflictNotice(targetPath, targetWs.id, targetWs.path);
            return false;
          }
        }

        // 有预检时已在上面的 await 之后重取 pending；无预检则中途没有 await，
        // 因此这里直接使用 pending，不再重复读取。
        const content = pending;
        clearError(get, SCOPE);
        noteLocalWriteContent(key, content);
        const result = await window.digitalLife.workspace.updateFileContent(
          targetPath,
          content,
          bridgeWsPath,
        );
        if (!result.ok) {
          // 写失败：清掉本次本地写入回声标记，避免把之后同内容的外部写误判为回声。
          clearLocalWriteContent(key);
          captureError(get, result.error, SCOPE);
          return false;
        }
        if (!isLatestSaveSequence(key, seq)) {
          // 已有更新的保存在排队/落定：本次响应只代表旧版本，不碰基线/草稿。
          return true;
        }
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

        const latestPending = peekPendingEditorTextByKey(key);
        if (latestPending !== undefined && latestPending !== content) {
          // 保存在途期间又有新草稿：保留草稿与脏标，只同步磁盘 mtime；
          // 绝不把旧响应写回 fileContent（受控 value 会把编辑器拉回旧内容）。
          // 下一次自动保存（击键已重置 1s 定时器）会消费新草稿。
          set((state: StoreState) => {
            const nextDirty = mergeDirtyEditorPaths(state.dirtyEditorPaths, targetPath, true);
            void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
            return {
              dirtyEditorPaths: nextDirty,
              ...(isSelected()
                ? {
                    fileLastModifiedAt: result.data.lastModifiedAt,
                    externalFileChange:
                      state.externalFileChange !== undefined &&
                      normalizeWorkspaceRelativePath(state.externalFileChange.path) === norm
                        ? undefined
                        : state.externalFileChange,
                  }
                : {}),
            };
          });
          return true;
        }

        // 无更新草稿：本次响应即新基线，精确删暂存（保留 savedAt 供回声窗口）。
        dropPendingEditorText(targetWs.id, targetPath);
        noteLocalWriteContent(key, result.data.content);
        markSavedAt(key);
        set((state: StoreState) => {
          const nextDirty = state.dirtyEditorPaths.filter(
            (p) => normalizeWorkspaceRelativePath(p) !== norm,
          );
          void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
          return {
            dirtyEditorPaths: nextDirty,
            ...(isSelected()
              ? {
                  fileContent: result.data.content,
                  fileLastModifiedAt: result.data.lastModifiedAt,
                  fileOpenError: null,
                  externalFileChange:
                    state.externalFileChange !== undefined &&
                    normalizeWorkspaceRelativePath(state.externalFileChange.path) === norm
                      ? undefined
                      : state.externalFileChange,
                }
              : {}),
          };
        });
        return true;
      });
    },

    /**
     * [resolveFileConflict - 裁决右下角存盘冲突卡片]
     * mine: 以 force 落盘覆盖磁盘（写前比对仅放行本次）；
     * disk: 丢本地草稿 + 清脏标 + 清外部旗 + 失效两端缓存 + 重读磁盘；
     * later: 仅关卡片（外部旗保留，下次保存再推）。
     * @reads editorSlice.fileOpNotices, editorSlice.externalFileChange, editorSlice.dirtyEditorPaths
     * @writes editorSlice.fileOpNotices, editorSlice.dirtyEditorPaths, editorSlice.externalFileChange, editorSlice.fileContent, editorSlice.fileLastModifiedAt (经 saveFile/reconcileSelectedFile)
     * @see shared/ipc.ts → workspace.updateFileContent (mine 分支经 saveFile)
     * @see mock-bridge.ts → workspace.updateFileContent (mine 分支经 saveFile)
     * @see preview-bridge/index.ts → workspace.updateFileContent (mine 分支经 saveFile)
     */
    resolveFileConflict: async (noticeId: string, choice: FileConflictChoice) => {
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
        await get().saveFile(targetPath, notice.workspacePath, {
          force: true,
          workspaceId: notice.workspaceId,
        });
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
        const currentWs = get().appInfo?.currentWorkspace;
        const ws = (get().recentWorkspaces ?? []).find((w) => w.id === wsId);
        const externalRoot = get().externalFileRoots?.[wsId];
        if (!ws && !externalRoot && wsId !== currentWs?.id && wsId !== 'global') {
          if (isExternalWorkspaceId(wsId)) {
            // 外部隐藏根意外丢失：不能回退当前工作区写同名文件，也不能假装成功。
            failed += 1;
          } else {
            // 工作区已被移除：其草稿在移除时已提示并处理，这里只清残键，
            // 不计失败（否则会永久阻塞工作区/分支切换）。
            dropPendingEditorText(wsId, relPath);
          }
          continue;
        }
        const hadPending = peekPendingEditorTextByKey(key) !== undefined;
        const targetPath = externalRoot ?? (ws && ws.id !== currentWs?.id ? ws.path : undefined);
        // 显式传键所属工作区：saveFile 不能按「当前选中文件」重算目标，否则
        // 跨作用域同名草稿会被写错或静默丢弃。
        const effectiveWsId = wsId === 'global' ? (currentWs?.id ?? undefined) : wsId;
        const ok = await get().saveFile(relPath, targetPath, { workspaceId: effectiveWsId });
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
     * 绕过缓存重读，分两种情形：
     * - 有未存草稿（以暂存缓冲为准，不看防抖脏标）：不覆盖编辑器，读取磁盘后
     *   用内容比对区分自写回声 / 内容未变 / 真外部修改；只有后者立外部旗并提示。
     * - 无草稿：正常刷新基线；文件消失则清为空白内容（复用 fileOpenError 视图）。
     * 供刷新按钮/分支切换/watcher 批次/保存回声共用。
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
      const externalRoot =
        selectedWsId && get().externalFileRoots?.[selectedWsId]
          ? get().externalFileRoots[selectedWsId]
          : undefined;
      const targetWs =
        (get().recentWorkspaces ?? []).find((w) => w.id === selectedWsId) ??
        (externalRoot ? { id: selectedWsId as string, path: externalRoot } : undefined) ??
        (isExternalWorkspaceId(selectedWsId) ? undefined : currentWorkspace);
      if (!targetWs) {
        // 外部根已失效：不回退当前工作区读入同名文件（内容会串），静默跳过。
        return;
      }
      const norm = normalizeWorkspaceRelativePath(selected);
      if (isMediaFileCategory(categorizeFile(selected))) {
        await reconcileSelectedMedia(get, set, selected, {
          id: targetWs.id,
          path: targetWs.path,
        });
        return;
      }
      const key = scopedFileKey(targetWs.id, selected);
      try {
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
        const selectedNow = get().selectedFilePath;
        if (
          selectedNow === undefined ||
          normalizeWorkspaceRelativePath(selectedNow) !== norm ||
          get().selectedFileWorkspaceId !== targetWs.id
        ) {
          // 读盘期间用户已切到别的文件/工作区：不能把旧文件正文写进新选区。
          return;
        }
        // 草稿判据以模块级暂存缓冲为准（dirtyEditorPaths 是 300ms 防抖的 UI
        // 状态，刚输入时可能尚未置位）。必须在 await 之后重取：读盘期间用户
        // 可能刚开始输入，用旧快照会把磁盘内容写回编辑器导致回退。
        const pending = peekPendingEditorTextByKey(key);
        if (!result.ok) {
          if (pending !== undefined) {
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
        if (pending !== undefined) {
          const baseline = get().fileContent ?? '';
          const verdict = classifyDiskContent(key, result.data.content, baseline, pending);
          if (verdict === 'external') {
            // 不要把外部内容写进文档缓存：否则之后保存非选中草稿时，
            // baselineContentForTarget 会把外部内容误当成「已知基线」而放行覆盖。
            const hadExternal = externalMatchesFlag(get, norm);
            set({
              externalFileChange: { path: selected, lastModifiedAt: result.data.lastModifiedAt },
            });
            if (!hadExternal) {
              const locale = resolveAppLanguage(get().appInfo?.config?.language);
              const dict = locale === 'en-US' ? fileEn : fileZh;
              get().showToast(dict.fileExternalChangedWhileDirty, 'warning');
            }
            return;
          }
          // self-echo（自写回声）或 unchanged（磁盘仍是基线）：磁盘内容可信，
          // 可入缓存；基线内容保持不动（草稿优先），只同步已知磁盘 mtime。
          setCachedFileDocument(key, {
            content: result.data.content,
            lastModifiedAt: result.data.lastModifiedAt,
          });
          set((state: StoreState) => {
            const clearExternal =
              state.externalFileChange !== undefined &&
              normalizeWorkspaceRelativePath(state.externalFileChange.path) === norm;
            if (!clearExternal && state.fileLastModifiedAt === result.data.lastModifiedAt) {
              return state;
            }
            return {
              ...(clearExternal ? { externalFileChange: undefined } : {}),
              fileLastModifiedAt: result.data.lastModifiedAt,
            };
          });
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
      } finally {
        // 本次对账已消费该 path 的 watcher 信号（成功/失败/超车都算）。
        clearExternalSignal(key);
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
      const pending = peekPendingEditorTextByKey(
        scopedFileKey(get().selectedFileWorkspaceId, selected),
      );
      if (pending !== undefined) {
        return;
      }
      const selectedWsId = get().selectedFileWorkspaceId;
      if (selectedWsId === undefined) {
        return;
      }
      // 外部文件不随工作区切换失效：根还在就正常对账，根丢了也绝不把新工作区的
      // 同名文件读进当前视图。
      if (get().externalFileRoots?.[selectedWsId]) {
        await get().reconcileSelectedFile();
        return;
      }
      if (isExternalWorkspaceId(selectedWsId)) {
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
      if (
        get().selectedFilePath !== selected ||
        get().selectedFileWorkspaceId !== selectedWsId ||
        get().appInfo?.currentWorkspace?.id !== currentWorkspace.id
      ) {
        // 读盘期间选中/工作区又变了：旧上下文的结果直接丢弃。
        return;
      }
      // 读盘期间用户可能开始输入：草稿键仍跟旧工作区归属，出现草稿就放弃本次覆盖。
      if (peekPendingEditorTextByKey(scopedFileKey(selectedWsId, selected)) !== undefined) {
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
