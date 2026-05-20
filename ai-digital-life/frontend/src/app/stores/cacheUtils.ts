/**
 * 缓存工具函数
 * @deprecated 请优先使用 `./shared.ts` 中的函数
 */

// 为了向后兼容，从 shared.ts 重导出
export {
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
  getWorkspaceCachePrefix,
  getWorkspaceScopedCacheKey,
  getCachedLru,
  setCachedLru,
  getFileDocumentCache,
  getChangePreviewCache,
  type CachedFileDocument,
  type CachedChangePreview
} from "./shared";

