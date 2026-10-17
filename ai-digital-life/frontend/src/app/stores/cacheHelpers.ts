import type {
  AppInfo,
  IpcResult,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
} from '@ai-digital-life/kernel';
import type { StoreState } from './StoreState';
import type { StoreApi } from 'zustand';
import { normalizeWorkspaceRelativePath } from '../utils/workspacePaths';
import { AppError, errorCodeMap, fromIpcErrorCode } from '../../shared/typedErrors';

/** 全局请求序列计数器 */
export let workspaceRequestSeq = 0;
export let sessionRequestSeq = 0;
export let fileRequestSeq = 0;
export let changePreviewRequestSeq = 0;

/**
 * 用户发起的变更预览请求正在进行时的目标路径（事项3 复审 H2）。
 * 后台 `fetchGitStatus` 落定后会按 selected 刷新预览，而"就绪才切换"使
 * pending 期 selected 仍是旧文件——若不设防，后台刷新会推进全局 seq 并
 * 作废用户刚点击的请求（点击被静默吞掉）。刷新入口据此守卫。
 */
export let pendingChangePreviewPath: string | undefined;

export function setPendingChangePreviewPath(path: string | undefined): void {
  pendingChangePreviewPath = path;
}

/**
 * 预览取消纪元（P4-R1-N3）：每次清空选中预览即推进；只写缓存的预取凭此作废，
 * 避免清空后落定的预取把刚失效的旧 diff 又种回缓存。
 */
export let previewCancelEpoch = 0;

/**
 * 取消在途变更预览 landing（P4-R1-F2/N1）：只清与被清空路径同名的 pending 槽，
 * 并推进被清空键的 `preview:` 代际（open landing 凭代际失配丢弃，不复活已清选中；
 * 作用域限定在被清空的键，不误伤其他工作区的在途打开）。
 * 同时失效被清空路径的缓存条目（N3）。
 */
export function cancelPreviewLanding(cacheKey: string, clearedPath: string | undefined): void {
  if (clearedPath !== undefined && pendingChangePreviewPath === clearedPath) {
    pendingChangePreviewPath = undefined;
  }
  nextFileGen(`preview:${cacheKey}`);
  invalidateCachedChangePreview(cacheKey);
  previewCancelEpoch += 1;
}

/** 缓存类型定义 */
export interface CachedFileDocument {
  content: string;
  lastModifiedAt: number;
}

export type CachedChangePreview = WorkspaceChangePreview;

/** 带 TTL 的缓存条目类型 */
interface TTLCacheEntry<V> {
  value: V;
  expiresAt: number; // timestamp in ms
}

/** 全局缓存实例 - 带 TTL 和 LRU 策略 */
const fileDocumentCache = new Map<string, TTLCacheEntry<CachedFileDocument>>();
const changePreviewCache = new Map<string, TTLCacheEntry<CachedChangePreview>>();

/** TTL 配置 (毫秒) */
export const FILE_DOCUMENT_TTL = 5 * 60 * 1000; // 5 分钟
export const CHANGE_PREVIEW_TTL = 1 * 60 * 1000; // 1 分钟

/** 常量定义 */
export const FILE_DOCUMENT_CACHE_LIMIT = 32;
export const CHANGE_PREVIEW_CACHE_LIMIT = 32;

/** LRU + TTL 缓存操作 — 每次 get 时将条目移到 Map 末尾，并检查过期 */
export function getCachedLruTTL<V>(
  cache: Map<string, TTLCacheEntry<V>>,
  key: string,
): V | undefined {
  const cachedEntry = cache.get(key);
  if (cachedEntry === undefined) {
    return undefined;
  }

  // 检查是否过期
  if (Date.now() > cachedEntry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  // 未过期，移到末尾（LRU）
  // 注意：JavaScript Map 没有直接移动条目的方法，delete + set 是标准做法
  cache.delete(key);
  cache.set(key, cachedEntry);
  return cachedEntry.value;
}

export function setCachedLruTTL<V>(
  cache: Map<string, TTLCacheEntry<V>>,
  key: string,
  value: V,
  limit: number,
  ttlMs: number,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    cache.delete(oldest);
  }
}

/**
 * 文件文档缓存访问器 - 带 TTL 和 LRU
 */
export function getCachedFileDocument(key: string): CachedFileDocument | undefined {
  return getCachedLruTTL(fileDocumentCache, key);
}

export function setCachedFileDocument(key: string, value: CachedFileDocument): void {
  setCachedLruTTL(fileDocumentCache, key, value, FILE_DOCUMENT_CACHE_LIMIT, FILE_DOCUMENT_TTL);
}

/**
 * 变更预览缓存访问器 - 带 TTL 和 LRU
 */
export function getCachedChangePreview(key: string): CachedChangePreview | undefined {
  return getCachedLruTTL(changePreviewCache, key);
}

export function setCachedChangePreview(key: string, value: CachedChangePreview): void {
  setCachedLruTTL(changePreviewCache, key, value, CHANGE_PREVIEW_CACHE_LIMIT, CHANGE_PREVIEW_TTL);
}

/** 精确失效单个文件文档缓存（保存/删除/外部变更后调用，防旧内容复活） */
export function invalidateCachedFileDocument(key: string): void {
  fileDocumentCache.delete(key);
}

/**
 * 编辑器未落盘文本缓冲（P4 F1/F2：键自带工作区归属 `工作区ID:归一化路径`。
 * 模块级，不进 React 状态，避免每次键入重渲染；删除/移除工作区时按前缀清理）。
 */
const pendingEditorText = new Map<string, string>();

export function setPendingEditorText(key: string, text: string): void {
  pendingEditorText.set(key, text);
}

export function peekPendingEditorTextByKey(key: string): string | undefined {
  return pendingEditorText.get(key);
}

export function pendingEditorTextKeys(): string[] {
  return [...pendingEditorText.keys()];
}

/** 最近一次落盘成功的时刻（P4 F8：批次回声在此窗口内到达即跳过重载）。 */
const lastSavedAt = new Map<string, number>();
const LAST_SAVED_MAP_LIMIT = 1000;

export function markSavedAt(key: string, now: number = Date.now()): void {
  // P4 N2：FIFO 上限（回声窗口只读 1s 新鲜度，旧条目纯占内存）。
  if (!lastSavedAt.has(key) && lastSavedAt.size >= LAST_SAVED_MAP_LIMIT) {
    const oldest = lastSavedAt.keys().next();
    if (!oldest.done) {
      lastSavedAt.delete(oldest.value);
    }
  }
  lastSavedAt.set(key, now);
}

export function lastSavedAtOf(key: string): number | undefined {
  return lastSavedAt.get(key);
}

/**
 * 按工作区丢弃暂存草稿与落盘时刻（P4 F2/F3/F10：删除文件、移除工作区时调用）。
 * 路径精确 + 后代前缀双边界；只传工作区时清整区。
 */
export function dropPendingEditorText(workspaceId: string, relativePath?: string): void {
  if (relativePath === undefined) {
    const boundary = `${workspaceId}:`;
    for (const key of [...pendingEditorText.keys()]) {
      if (key.startsWith(boundary)) {
        pendingEditorText.delete(key);
      }
    }
    for (const key of [...lastSavedAt.keys()]) {
      if (key.startsWith(boundary)) {
        lastSavedAt.delete(key);
      }
    }
    return;
  }
  const norm = normalizeWorkspaceRelativePath(relativePath);
  const exact = scopedFileKey(workspaceId, norm);
  const prefix = `${exact}/`;
  for (const key of [...pendingEditorText.keys()]) {
    if (key === exact || key.startsWith(prefix)) {
      pendingEditorText.delete(key);
    }
  }
  // P4 L4：savedAt 同边界清理（文件夹后代不泄漏）。
  lastSavedAt.delete(exact);
  for (const key of [...lastSavedAt.keys()]) {
    if (key.startsWith(prefix)) {
      lastSavedAt.delete(key);
    }
  }
}

/** 精确失效单个变更预览缓存 */
export function invalidateCachedChangePreview(key: string): void {
  changePreviewCache.delete(key);
}

/**
 * 失效某工作区下指定路径（含后代，用于删除文件夹场景）。
 * 按 `${workspaceId}:${归一化路径}` 前缀 + `/` 边界匹配，避免 `foo` 误伤 `foobar`。
 */
export function invalidateCachedPathTree(workspaceId: string, relativePath: string): void {
  const norm = normalizeWorkspaceRelativePath(relativePath);
  const exact = `${workspaceId}:${norm}`;
  const prefix = `${exact}/`;
  for (const key of [...fileDocumentCache.keys()]) {
    if (key === exact || key.startsWith(prefix)) {
      fileDocumentCache.delete(key);
    }
  }
  for (const key of [...changePreviewCache.keys()]) {
    if (key === exact || key.startsWith(prefix)) {
      changePreviewCache.delete(key);
    }
  }
}

/** 单真相源钥匙（事项 13 收敛）：文件/预览缓存只认这一种键。 */
export function scopedFileKey(workspaceId: string | undefined, relativePath: string): string {
  return `${workspaceId ?? 'global'}:${normalizeWorkspaceRelativePath(relativePath)}`;
}

/**
 * 文件读写 generation 守卫（事项 13 收敛）：同一路径的并发读/写按号排队，
 * 迟到的旧回复直接丢弃，不覆盖新鲜状态。保存落定即 bump，使其之前起飞的
 * 读在落地时作废。
 */
const fileGenMap = new Map<string, number>();
const FILE_GEN_MAP_LIMIT = 1000;

export function nextFileGen(key: string): number {
  // P4 F10：FIFO 淘汰最旧键防无界膨胀（在途键都是最近写入，淘汰不到它们）。
  if (!fileGenMap.has(key) && fileGenMap.size >= FILE_GEN_MAP_LIMIT) {
    const oldest = fileGenMap.keys().next();
    if (!oldest.done) {
      fileGenMap.delete(oldest.value);
    }
  }
  const next = (fileGenMap.get(key) ?? 0) + 1;
  fileGenMap.set(key, next);
  return next;
}

export function isCurrentFileGen(key: string, gen: number): boolean {
  return (fileGenMap.get(key) ?? 0) === gen;
}

/** 缓存键生成 */
export function getWorkspaceCachePrefix(appInfo?: AppInfo): string {
  return appInfo?.currentWorkspace?.id ?? 'global';
}

export function getWorkspaceScopedCacheKey(
  appInfo: AppInfo | undefined,
  relativePath: string,
): string {
  return scopedFileKey(appInfo?.currentWorkspace?.id, relativePath);
}

/** 清理指定工作区的缓存条目（P4 F10：按 `${id}:` 边界匹配，`ws-1` 不误伤 `ws-10`）。 */
export function clearWorkspaceCaches(workspacePrefix: string) {
  const boundary = `${workspacePrefix}:`;
  for (const key of fileDocumentCache.keys()) {
    if (key.startsWith(boundary)) {
      fileDocumentCache.delete(key);
    }
  }
  for (const key of changePreviewCache.keys()) {
    if (key.startsWith(boundary)) {
      changePreviewCache.delete(key);
    }
  }
}

/** 清除错误 toast（scope 提供时仅清除该作用域，缺省清空全部） */
export function clearError(get: () => StoreState, scope?: string): void {
  if (get().errorToasts.length > 0) {
    get().clearErrorToasts(scope);
  }
}

/** 捕获错误并入队错误 toast（code 与完整 message 分离；scope 标记来源模块） */
export function captureError(get: () => StoreState, error: unknown, scope?: string): void {
  let code = '';
  let detail = '';
  if (error instanceof AppError) {
    code = error.code;
    detail = error.message;
  } else if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code: c, message } = error as { code: string; message: string };
    if (c in errorCodeMap) {
      const typed = fromIpcErrorCode(c, message);
      code = typed.code;
      detail = typed.message;
    } else {
      // 未知 code：保留原始 code 与 message，交由 UI 的通用标题兜底
      code = c;
      detail = message;
    }
  } else {
    detail =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
            ? String((error as { message: string }).message)
            : error
              ? String(error)
              : 'An unknown error occurred';
  }
  get().reportError(code, detail, scope);
}

/** 低优先级刷新辅助（使用 setTimeout(0) 允许浏览器先渲染再执行） */
export function queueLowPriorityRefresh(refresh: () => Promise<void>): void {
  window.setTimeout(() => {
    void refresh();
  }, 0);
}

/** 自增并返回下一个序列值 */
export function getNextFileRequestSeq(): number {
  return ++fileRequestSeq;
}

export function getNextWorkspaceRequestSeq(): number {
  return ++workspaceRequestSeq;
}

export function getNextChangePreviewRequestSeq(): number {
  return ++changePreviewRequestSeq;
}

export function getNextSessionRequestSeq(): number {
  return ++sessionRequestSeq;
}

/** 重置所有请求序列 */
export function resetRequestSeqs() {
  workspaceRequestSeq = 0;
  fileRequestSeq = 0;
  changePreviewRequestSeq = 0;
  sessionRequestSeq = 0;
}

/** 创建防抖搜索工具（回调必须内部处理自身异常：debounce 以 `void` 悬空调用，不捕获回调的 rejection）。 */
export function createDebouncedSearch(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (query: string, doSearch: () => Promise<void>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void doSearch();
    }, ms);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return debounced;
}

export async function postMutationRefresh(get: () => StoreState): Promise<void> {
  await Promise.allSettled([get().fetchGitStatus()]).then((results) => {
    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason);
    if (errors.length > 0) {
      /* some refreshes failed */
    }
  });
}

export async function batchExpandAll(
  recentWorkspaces: RecentWorkspaceEntry[],
  expandedState: Record<string, boolean>,
  setExpanded: (state: Record<string, boolean>) => void,
  loader: (entry: RecentWorkspaceEntry) => Promise<void>,
  loadedCheck: (workspaceId: string) => boolean,
  concurrency = 3,
): Promise<void> {
  const visibleEntries = recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available);
  const expandedAll: Record<string, boolean> = {};
  for (const entry of visibleEntries) {
    expandedAll[entry.id] = true;
  }
  setExpanded(expandedAll);
  const toLoad = visibleEntries.filter((e) => !loadedCheck(e.id));
  for (let i = 0; i < toLoad.length; i += concurrency) {
    const batch = toLoad.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((entry) => loader(entry)));
    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason);
    if (errors.length > 0) {
      /* batch load failures */
    }
  }
}

export async function expandSingle(
  currentExpanded: Record<string, boolean>,
  workspaceId: string,
  setExpanded: (next: Record<string, boolean>) => void,
  hasData: boolean,
  loadData: () => Promise<void>,
): Promise<void> {
  if (currentExpanded[workspaceId]) {
    setExpanded({
      ...currentExpanded,
      [workspaceId]: false,
    });
    return;
  }
  setExpanded({
    ...currentExpanded,
    [workspaceId]: true,
  });
  if (!hasData) {
    await loadData();
  }
}

export function createLazyLoader<T>(
  fetchFn: (path: string) => Promise<IpcResult<T>>,
  getGuardState: (state: StoreState, id: string) => { hasData: boolean; isLoading: boolean },
  getInitialState: (get_: () => StoreState, id: string) => Partial<StoreState>,
  getSuccessState: (get_: () => StoreState, id: string, data: T) => Partial<StoreState>,
  getErrorState: (get_: () => StoreState, id: string, message: string) => Partial<StoreState>,
) {
  return function (
    set: StoreApi<StoreState>['setState'],
    get_: () => StoreState,
  ): (workspaceId: string, workspacePath: string) => Promise<void> {
    return async (workspaceId: string, workspacePath: string) => {
      const state = get_();
      const guard = getGuardState(state, workspaceId);
      // 已有数据或正在加载时都跳过：避免与 bootstrap loadBatch/其它懒加载并发重复扫描。
      // 需要强制刷新时请走显式 refresh 路径（refreshOneWorkspaceTree 带 force）。
      if (guard.hasData || guard.isLoading) {
        return;
      }
      set(getInitialState(get_, workspaceId));
      try {
        const result = await fetchFn(workspacePath);
        if (!result.ok) {
          set(getErrorState(get_, workspaceId, result.error.message));
          return;
        }
        set(getSuccessState(get_, workspaceId, result.data));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set(getErrorState(get_, workspaceId, message));
      }
    };
  };
}
