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

/** 缓存键生成 */
export function getWorkspaceCachePrefix(appInfo?: AppInfo): string {
  return appInfo?.currentWorkspace?.id ?? 'global';
}

export function getWorkspaceScopedCacheKey(
  appInfo: AppInfo | undefined,
  relativePath: string,
): string {
  return `${getWorkspaceCachePrefix(appInfo)}:${normalizeWorkspaceRelativePath(relativePath)}`;
}

/** 清理指定工作区的缓存条目 */
export function clearWorkspaceCaches(workspacePrefix: string) {
  for (const key of fileDocumentCache.keys()) {
    if (key.startsWith(workspacePrefix)) {
      fileDocumentCache.delete(key);
    }
  }
  for (const key of changePreviewCache.keys()) {
    if (key.startsWith(workspacePrefix)) {
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

/** 创建防抖搜索工具 */
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
  const visibleEntries = recentWorkspaces.filter(
    (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available,
  );
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
  console.log(
    '[ADL-DEBUG] expandSingle: workspaceId=',
    workspaceId,
    'wasExpanded=',
    !!currentExpanded[workspaceId],
    'hasData=',
    hasData,
  );
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
      const tLazyStart = performance.now();
      console.log(
        '[ADL-DEBUG] lazyLoad: enter workspaceId=',
        workspaceId,
        'path=',
        workspacePath,
        'hasData=',
        guard.hasData,
        'isLoading=',
        guard.isLoading,
      );
      if (guard.hasData && !guard.isLoading) {
        console.log(
          '[ADL-DEBUG] lazyLoad: skipped (hasData) workspaceId=',
          workspaceId,
          'elapsedMs=0',
        );
        return;
      }
      set(getInitialState(get_, workspaceId));
      try {
        const result = await fetchFn(workspacePath);
        console.log(
          '[ADL-DEBUG] lazyLoad: resolved workspaceId=',
          workspaceId,
          'ok=',
          result.ok,
          'elapsedMs=',
          (performance.now() - tLazyStart).toFixed(1),
        );
        if (!result.ok) {
          set(getErrorState(get_, workspaceId, result.error.message));
          return;
        }
        set(getSuccessState(get_, workspaceId, result.data));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          '[ADL-DEBUG] lazyLoad: rejected workspaceId=',
          workspaceId,
          'msg=',
          message,
          'elapsedMs=',
          (performance.now() - tLazyStart).toFixed(1),
        );
        set(getErrorState(get_, workspaceId, message));
      }
    };
  };
}
