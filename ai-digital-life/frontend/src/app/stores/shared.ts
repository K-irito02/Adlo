import type { AppInfo, WorkspaceChangePreview } from "@ai-digital-life/kernel";
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

/** 访问计数追踪（用于 LRU 提升） */
const accessCount = new Map<string, number>();
const ACCESS_PROMOTE_THRESHOLD = 3;

/** LRU 缓存操作 */
export function getCachedLru<T>(cache: Map<string, T>, key: string): T | undefined {
  const cached = cache.get(key);
  if (cached === undefined) {
    return undefined;
  }
  // 访问计数达到阈值才提升（避免每 get 一次就 delete+set 重哈希）
  const count = (accessCount.get(key) ?? 0) + 1;
  accessCount.set(key, count);
  if (count >= ACCESS_PROMOTE_THRESHOLD) {
    cache.delete(key);
    cache.set(key, cached);
    accessCount.set(key, 0);
  }
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
    accessCount.delete(oldest);
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
      accessCount.delete(key);
    }
  }
  for (const key of changePreviewCache.keys()) {
    if (key.startsWith(workspacePrefix)) {
      changePreviewCache.delete(key);
      accessCount.delete(key);
    }
  }
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
  return (query: string, doSearch: () => Promise<void>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void doSearch();
    }, ms);
  };
}
