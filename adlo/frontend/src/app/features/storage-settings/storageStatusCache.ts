import type { StorageCategoryStatus, StorageStatus, TreeCacheStats } from '@shared/ipc/storage';

/**
 * 「存储」组进场缓存（方案 B+C，根因修复 2026-09-27）。
 *
 * 背景：`StorageStatus` 原先只存组件本地 state、零缓存，每次切组都重发 IPC 并
 * 先画一帧「正在读取存储状态…」骨架 → 进场闪烁。本模块缓存**最近一次成功
 * 渲染的快照**（stale-while-revalidate）：
 *
 * - **B（缓存 + 静默再验证）**：挂载命中缓存即瞬显真实数据（非占位假值），
 *   同时后台 `getStatus()` 再验证，回来后静默 setState 更新；组件内
 *   status/treeStats 同步 effect 为唯一写回点。
 * - **C（预取冷填充）**：`prefetchStorageSettings()` 在设置面板打开/悬停存储行时
 *   预热——**仅缓存为空时拉取并写入**（冷填充语义）；新鲜度由挂载再验证提供，
 *   因此命中后 no-op：既不会用慢返回的旧快照覆盖新写回（时序覆盖），
 *   也不重复全量扫描。epoch 在 reset 时递增，在途预取过期后放弃写入。
 *
 * 失效约定：缓存只存「成功渲染过的值」；失败/畸形体不入缓存（挂载路径仍有
 * 30s 超时保护与错误页）。模块级生命周期 = 页面会话（刷新即清），无持久化。
 */

let statusCache: StorageStatus | null = null;
let treeStatsCache: TreeCacheStats | null = null;
/** 预取去重：并发调用共享同一在途 promise，settled 后放行下次预取。 */
let prefetchInFlight: Promise<void> | null = null;
/** 缓存纪元：`resetStorageSettingsCache` 递增，在途预取据此放弃写入（测试隔离）。 */
let epoch = 0;

/** 预取超时：防慢请求永久占用在途 latch（挂载路径另有 30s 超时与错误页）。 */
const PREFETCH_TIMEOUT_MS = 10_000;

export function getCachedStorageStatus(): StorageStatus | null {
  return statusCache;
}

export function setCachedStorageStatus(status: StorageStatus): void {
  statusCache = status;
}

export function getCachedTreeStats(): TreeCacheStats | null {
  return treeStatsCache;
}

export function setCachedTreeStats(stats: TreeCacheStats): void {
  treeStatsCache = stats;
}

/** `ok:true` 畸形体校验：缺 `data`/`categories` 即视为版本错配，不入缓存也不渲染（F1）。
 * 除信封外逐分类校验元素形状（`key`/`path` 字符串）与 `defaultRoot`：
 * 版本错位后端若返回空/畸形分类项，须在入缓存前拦截 —— 否则坏快照污染整个会话，
 * 每次进场都渲染错行。 */
export function isWellFormedStatus(data: unknown): data is StorageStatus {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<StorageStatus>;
  return (
    (candidate.mode === 'unified' || candidate.mode === 'per_category') &&
    typeof candidate.root === 'string' &&
    typeof candidate.defaultRoot === 'string' &&
    Array.isArray(candidate.categories) &&
    candidate.categories.every(
      (category) =>
        typeof category === 'object' &&
        category !== null &&
        typeof (category as Partial<StorageCategoryStatus>).key === 'string' &&
        typeof (category as Partial<StorageCategoryStatus>).path === 'string',
    )
  );
}

/** 测试隔离：模块级缓存跨用例泄漏会让「首帧加载态」类断言失真；
 * 同时递增 epoch 使在途预取过期，不回写已清空的缓存。 */
export function resetStorageSettingsCache(): void {
  statusCache = null;
  treeStatsCache = null;
  prefetchInFlight = null;
  epoch += 1;
}

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('storage prefetch timeout')), ms);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * 预取（方案 C，冷填充语义）：仅两侧缓存皆为空时静默拉取 status + treeStats 并写入。
 * 任一侧已有值时**只拉缺失侧**：新鲜度由挂载再验证负责；慢返回的旧快照
 * 不可能覆盖新写回（时序覆盖），也不重复全量扫描缺失侧之外的内容。
 * 失败/畸形/旧桥缺方法一律静默放弃（不写缓存、不抛错）——真正的加载与错误
 * 处理仍在 `StorageSettings` 挂载路径（带 30s 超时与错误页）。
 *
 * 缓存为不可变快照约定：写入后任何一方不得原地修改 status/treeStats 对象
 * （组件侧同样 immutable 更新）；违者污染下次进场的瞬显内容。
 */
export function prefetchStorageSettings(): Promise<void> {
  if (statusCache !== null && treeStatsCache !== null) {
    return Promise.resolve();
  }
  if (prefetchInFlight) {
    return prefetchInFlight;
  }
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.storage : undefined;
  if (!bridge) {
    return Promise.resolve();
  }
  const fetchEpoch = epoch;
  // 经 Promise.resolve().then 包装：同步抛错转为拒绝，不逃逸出预取通道。
  const fetchStatus =
    statusCache !== null
      ? Promise.resolve()
      : withTimeout(
          Promise.resolve().then(() => bridge.getStatus()),
          PREFETCH_TIMEOUT_MS,
        )
          .then((result) => {
            if (
              fetchEpoch === epoch &&
              statusCache === null &&
              result.ok &&
              isWellFormedStatus(result.data)
            ) {
              statusCache = result.data;
            }
          })
          .catch(() => undefined);
  const fetchTreeStats =
    treeStatsCache !== null || !bridge.getTreeCacheStats
      ? Promise.resolve()
      : withTimeout(
          Promise.resolve().then(() => bridge.getTreeCacheStats!()),
          PREFETCH_TIMEOUT_MS,
        )
          .then((result) => {
            if (fetchEpoch === epoch && treeStatsCache === null && result.ok) {
              treeStatsCache = result.data;
            }
          })
          .catch(() => undefined);
  const settled = Promise.all([fetchStatus, fetchTreeStats]).then(() => {
    // identity 守卫：reset 可能在本 promise 在途时清空并放行新一轮预取，
    // 旧 promise settle 不得清掉新 latch（否则并发去重失效）。
    if (prefetchInFlight === settled) {
      prefetchInFlight = null;
    }
  });
  prefetchInFlight = settled;
  return settled;
}
