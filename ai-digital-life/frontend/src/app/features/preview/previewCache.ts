/**
 * 预览结果缓存（会话级，仅内存）。
 *
 * 目的（用户选定方案 E）：扫光只在真正需要等待时出现；同一份文件再次打开时
 * 直接复用上次的解析/渲染结果，做到“回看不闪、秒开”。
 *
 * 失效策略：缓存键包含 `size + lastModifiedAt`，文件被外部修改（mtime 变化）
 * 会自动落到新键，旧条目由 LRU 自然淘汰——不引入"版本号/手动失效"这类兼容层。
 *
 * 容量：除条目数外还支持权重预算（`maxWeight` + `weigh`，由调用方定义；office 缓存按字符计）。office 渲染结果是
 * 整段 HTML（docx 的图片/字体内联为 base64），只按条数限制会让内存失控。
 */

export interface LruCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  readonly size: number;
}

export interface LruCacheOptions<T> {
  /** 最多保留的条目数 */
  limit: number;
  /** 单条权重（默认 1）；配合 maxWeight 做字节/字符预算 */
  weigh?: (value: T) => number;
  /** 总权重上限；超出时按 LRU 淘汰 */
  maxWeight?: number;
  /** 条目被淘汰/清空时的回调（如释放 pdf.js 文档） */
  onEvict?: (value: T) => void;
}

interface Entry<T> {
  value: T;
  weight: number;
}

export function createLruCache<T>(options: LruCacheOptions<T>): LruCache<T> {
  const config: LruCacheOptions<T> = options;
  const limit = Number.isFinite(config.limit) ? Math.max(0, Math.trunc(config.limit)) : 0;
  const maxWeight =
    config.maxWeight !== undefined && Number.isFinite(config.maxWeight)
      ? Math.max(0, config.maxWeight)
      : Number.POSITIVE_INFINITY;
  const weigh = config.weigh ?? (() => 1);

  const map = new Map<string, Entry<T>>();
  let totalWeight = 0;

  const evict = (key: string, entry: Entry<T>) => {
    map.delete(key);
    totalWeight -= entry.weight;
    config.onEvict?.(entry.value);
  };

  const trim = () => {
    while (map.size > limit || (totalWeight > maxWeight && map.size > 0)) {
      const oldest = map.entries().next().value as [string, Entry<T>] | undefined;
      if (!oldest) {
        break;
      }
      evict(oldest[0], oldest[1]);
    }
  };

  return {
    get(key: string): T | undefined {
      const entry = map.get(key);
      if (!entry) {
        return undefined;
      }
      // 触碰即刷新 LRU 顺序
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    set(key: string, value: T): void {
      const weight = Math.max(1, weigh(value));
      // 单条超过总预算：不入缓存（否则会把其它文档一起挤掉，等于清空缓存）。
      if (weight > maxWeight) {
        return;
      }
      const existing = map.get(key);
      if (existing) {
        // 同键替换：只扣权重，不触发 onEvict（旧值可能仍被其它消费者引用）。
        map.delete(key);
        totalWeight -= existing.weight;
      }
      map.set(key, { value, weight });
      totalWeight += weight;
      trim();
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

/**
 * 工作区 + 路径 + 体积 + mtime：任一变化都视为不同文档。
 * 用 JSON 编码而不是 `::` 拼接：路径/id 中可能带分隔符，拼接会产生跨工作区碰撞。
 */
export function buildPreviewCacheKey(
  workspaceId: string | undefined,
  doc: PreviewCacheKeyInput,
): string {
  return JSON.stringify([workspaceId ?? '', doc.path, doc.size, doc.lastModifiedAt]);
}
