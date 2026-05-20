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

/** LRU 缓存操作 */
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

/** 低优先级刷新辅助 */
export function queueLowPriorityRefresh(refresh: () => Promise<void>): void {
  window.setTimeout(() => {
    void refresh();
  }, 0);
}

/** 重置所有请求序列 */
export function resetRequestSeqs() {
  workspaceRequestSeq += 1;
  fileRequestSeq += 1;
  changePreviewRequestSeq += 1;
  sessionRequestSeq += 1;
}
