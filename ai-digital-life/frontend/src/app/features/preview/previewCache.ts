/**
 * 预览结果缓存（会话级，仅内存）。
 *
 * 目的（用户选定方案 E）：扫光只在真正需要等待时出现；同一份文件再次打开时
 * 直接复用上次的解析/渲染结果，做到“回看不闪、秒开”。
 *
 * 失效策略：缓存键包含 `size + lastModifiedAt`，文件被外部修改（mtime 变化）
 * 会自动落到新键，旧条目由 LRU 自然淘汰——不引入"版本号/手动失效"这类兼容层。
 */

export interface LruCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
  readonly size: number;
}

export function createLruCache<T>(limit: number): LruCache<T> {
  const map = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      if (!map.has(key)) {
        return undefined;
      }
      const value = map.get(key) as T;
      // 触碰即刷新 LRU 顺序
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key: string, value: T): void {
      if (map.has(key)) {
        map.delete(key);
      }
      map.set(key, value);
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        map.delete(oldest);
      }
    },
    clear(): void {
      map.clear();
    },
    get size(): number {
      return map.size;
    },
  };
}

export interface PreviewCacheKeyInput {
  path: string;
  size: number;
  lastModifiedAt: number;
}

/** 工作区 + 路径 + 体积 + mtime：任一变化都视为不同文档。 */
export function buildPreviewCacheKey(
  workspaceId: string | undefined,
  doc: PreviewCacheKeyInput,
): string {
  return `${workspaceId ?? ''}::${doc.path}::${doc.size}::${doc.lastModifiedAt}`;
}
