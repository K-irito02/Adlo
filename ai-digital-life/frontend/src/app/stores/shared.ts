import type { AppInfo, IpcResult, RecentWorkspaceEntry, WorkspaceChangePreview } from "@ai-digital-life/kernel";
import type { StoreState } from "./StoreState";
import type { StoreApi } from "zustand";
import { normalizeWorkspaceRelativePath } from "../workspacePaths";

/** 全局请求序列计数器 */
export let workspaceRequestSeq = 0;
export let sessionRequestSeq = 0;
export let fileRequestSeq = 0;
export let changePreviewRequestSeq = 0;

/** 缓存类型定义 */
export type CachedFileDocument = {
  content: string;
  lastModifiedAt: number;
};

export type CachedChangePreview = WorkspaceChangePreview;

/** 全局缓存实例 */
const fileDocumentCache = new Map<string, CachedFileDocument>();
const changePreviewCache = new Map<string, CachedChangePreview>();

/** 获取缓存访问器 */
export function getFileDocumentCache() {
  return fileDocumentCache;
}

export function getChangePreviewCache() {
  return changePreviewCache;
}

/** 常量定义 */
export const FILE_DOCUMENT_CACHE_LIMIT = 32;
export const CHANGE_PREVIEW_CACHE_LIMIT = 32;

/** LRU 缓存操作 — 每次 get 时将条目移到 Map 末尾，确保最近访问的在末尾 */
export function getCachedLru<T>(cache: Map<string, T>, key: string): T | undefined {
  const cached = cache.get(key);
  if (cached === undefined) {
    return undefined;
  }
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

export function setCachedLru<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    cache.delete(oldest);
  }
}

/** 缓存键生成 */
export function getWorkspaceCachePrefix(appInfo?: AppInfo): string {
  return appInfo?.currentWorkspace?.id ?? "global";
}

export function getWorkspaceScopedCacheKey(appInfo: AppInfo | undefined, relativePath: string): string {
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

/** 清除全局错误 */
export function clearError(get: () => StoreState): void {
  if (get().error) {
    get().setError(undefined);
  }
}

/** 捕获错误并设置到全局错误状态 */
export function captureError(get: () => StoreState, error: unknown): void {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String((error as { message: string }).message)
          : String(error);
  get().setError(message);
}

/** 设置全局错误消息 */
export function setError(get: () => StoreState, message: string): void {
  get().setError(message);
}

/** 低优先级刷新辅助（使用微任务队列，比 setTimeout(0) 更早执行） */
export function queueLowPriorityRefresh(refresh: () => Promise<void>): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => { void refresh(); });
  } else {
    window.setTimeout(() => { void refresh(); }, 0);
  }
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
    if (timer) clearTimeout(timer);
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
  await Promise.allSettled([
    get().refreshTaskCenter(),
    get().fetchAuditEntries(40),
    get().fetchCommandHistory(),
    get().fetchGitStatus(),
  ]).then((results) => {
    const errors = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
    if (errors.length > 0) {
      console.warn("[postMutationRefresh] Some refreshes failed:", errors);
    }
  });
}

export async function batchExpandAll(
  recentWorkspaces: RecentWorkspaceEntry[],
  expandedState: Record<string, boolean>,
  setExpanded: (state: Record<string, boolean>) => void,
  loader: (entry: RecentWorkspaceEntry) => Promise<void>,
  loadedCheck: (workspaceId: string) => boolean,
  concurrency = 3
): Promise<void> {
  const visibleEntries = recentWorkspaces.filter(
    (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
  );
  const expandedAll: Record<string, boolean> = {};
  for (const entry of visibleEntries) {
    expandedAll[entry.id] = true;
  }
  setExpanded(expandedAll);
  const toLoad = visibleEntries.filter((e) => !loadedCheck(e.id));
  for (let i = 0; i < toLoad.length; i += concurrency) {
    const batch = toLoad.slice(i, i + concurrency);
    await Promise.allSettled(batch.map((entry) => loader(entry)));
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
  return function(
    set: StoreApi<StoreState>["setState"],
    get_: () => StoreState,
  ): (workspaceId: string, workspacePath: string) => Promise<void> {
    return async (workspaceId: string, workspacePath: string) => {
      const state = get_();
      const guard = getGuardState(state, workspaceId);
      if (guard.hasData && !guard.isLoading) return;
      set(getInitialState(get_, workspaceId));
      const result = await fetchFn(workspacePath);
      if (!result.ok) {
        set(getErrorState(get_, workspaceId, result.error.message));
        return;
      }
      set(getSuccessState(get_, workspaceId, result.data));
    };
  };
}
