import type { StorageStatus, TreeCacheStats } from '@shared/ipc/storage';

/**
 * 「存储」组进场缓存（方案 B+C，根因修复 2026-09-27）。
 *
 * 背景：`StorageStatus` 原先只存组件本地 state、零缓存，每次切组都重发 IPC 并
 * 先画一帧「正在读取存储状态…」骨架 → 进场闪烁。本模块缓存**最近一次成功
 * 渲染的快照**（stale-while-revalidate）：
 *
 * - **B（缓存 + 静默再验证）**：挂载命中缓存即瞬显真实数据（非占位假值），
 *   同时后台 `getStatus()` 再验证，回来后静默 setState 更新；写路径由
 *   `StorageSettings` 的 status/treeStats 同步 effect 统一写回（单一写回点）。
 * - **C（预取热身）**：`prefetchStorageSettings()` 在设置面板打开 / 悬停侧边栏
 *   存储行时预热，首次进入也基本无加载态。
 *
 * 失效约定：缓存只存「成功渲染过的值」；失败/畸形体不入缓存（挂载路径仍有
 * 超时保护与错误页）。模块级生命周期 = 页面会话（刷新即清），无持久化。
 */

let statusCache: StorageStatus | null = null;
let treeStatsCache: TreeCacheStats | null = null;
/** 预取去重：并发调用共享同一在途 promise，settled 后放行下次预取。 */
let prefetchInFlight: Promise<void> | null = null;

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

/** `ok:true` 畸形体校验：缺 `data`/`categories` 即视为版本错配，不入缓存也不渲染（F1）。 */
export function isWellFormedStatus(data: unknown): data is StorageStatus {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<StorageStatus>;
  return (
    (candidate.mode === 'unified' || candidate.mode === 'per_category') &&
    typeof candidate.root === 'string' &&
    Array.isArray(candidate.categories)
  );
}

/** 测试隔离：模块级缓存跨用例泄漏会让「首帧加载态」类断言失真。 */
export function resetStorageSettingsCache(): void {
  statusCache = null;
  treeStatsCache = null;
  prefetchInFlight = null;
}

/**
 * 预取（方案 C）：静默填充 status + treeStats 缓存，无 UI 参与。
 * 失败/畸形/旧桥缺方法一律静默放弃（不写缓存、不抛错）——真正的加载与错误
 * 处理仍在 `StorageSettings` 挂载路径（带 30s 超时与错误页）。
 */
export function prefetchStorageSettings(): Promise<void> {
  if (prefetchInFlight) {
    return prefetchInFlight;
  }
  const bridge = window.digitalLife?.storage;
  if (!bridge) {
    return Promise.resolve();
  }
  // 经 Promise.resolve().then 包装：同步抛错转为拒绝，不逃逸出预取通道。
  const fetchStatus = Promise.resolve()
    .then(() => bridge.getStatus())
    .then((result) => {
      if (result.ok && isWellFormedStatus(result.data)) {
        statusCache = result.data;
      }
    })
    .catch(() => undefined);
  const fetchTreeStats = !bridge.getTreeCacheStats
    ? Promise.resolve()
    : Promise.resolve()
        .then(() => bridge.getTreeCacheStats!())
        .then((result) => {
          if (result.ok) {
            treeStatsCache = result.data;
          }
        })
        .catch(() => undefined);
  prefetchInFlight = Promise.all([fetchStatus, fetchTreeStats]).then(() => {
    prefetchInFlight = null;
  });
  return prefetchInFlight;
}
