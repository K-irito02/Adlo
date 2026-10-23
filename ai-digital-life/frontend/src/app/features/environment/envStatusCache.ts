import type { EnvStatus } from '../../../shared/ipc/env';

/**
 * 「环境」组进场缓存（照抄 storage-settings/storageStatusCache.ts 方案 B+C）。
 *
 * 缓存**最近一次成功渲染的快照**（stale-while-revalidate）：
 *
 * - **B（缓存 + 静默再验证）**：挂载命中即瞬显真实数据，同时后台 `getStatus()`
 *   再验证，回来后由组件内同步 effect 写回（唯一写回点）。
 * - **C（预取冷填充）**：`prefetchEnvSettings()` 在设置面板打开/悬停环境行时
 *   预热——**仅缓存为空时拉取并写入**（冷填充语义）；新鲜度由挂载再验证提供，
 *   因此命中后 no-op：不会用慢返回的旧快照覆盖新写回（时序覆盖），
 *   也不重复全量扫描。epoch 在 reset 时递增，在途预取过期后放弃写入。
 *
 * 失效约定：只存「成功渲染过的值」；失败/畸形体不入缓存。模块级生命周期 =
 * 页面会话（刷新即清），无持久化。失败一律 fail-open（不抛错）。
 */

let statusCache: EnvStatus | null = null;
/** 预取去重：并发调用共享同一在途 promise，settled 后放行下次预取。 */
let prefetchInFlight: Promise<void> | null = null;
/** 缓存纪元：`resetEnvSettingsCache` 递增，在途预取据此放弃写入（测试隔离）。 */
let epoch = 0;

/** 预取超时：防慢请求永久占用在途 latch（挂载路径另有超时与错误页）。 */
const PREFETCH_TIMEOUT_MS = 10_000;

export function getCachedEnvStatus(): EnvStatus | null {
  return statusCache;
}

export function setCachedEnvStatus(status: EnvStatus): void {
  statusCache = status;
}

/** `ok:true` 畸形体校验：缺段即视为版本错配，不入缓存也不渲染。 */
export function isWellFormedEnvStatus(data: unknown): data is EnvStatus {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<EnvStatus>;
  const deps = [
    candidate.node,
    candidate.git,
    candidate.bash,
    candidate.webview2,
    candidate.adlserver,
  ];
  return (
    deps.every(
      (dep) =>
        typeof dep === 'object' &&
        dep !== null &&
        typeof (dep as { meetsBaseline?: unknown }).meetsBaseline === 'boolean',
    ) &&
    typeof candidate.netprobe === 'object' &&
    candidate.netprobe !== null &&
    (candidate.task === null || typeof candidate.task === 'object') &&
    typeof candidate.dataDir === 'string' &&
    typeof candidate.dshReady === 'boolean'
  );
}

/** 测试隔离：模块级缓存跨用例泄漏会让「首帧加载态」类断言失真；
 * 同时递增 epoch 使在途预取过期，不回写已清空的缓存。 */
export function resetEnvSettingsCache(): void {
  statusCache = null;
  prefetchInFlight = null;
  epoch += 1;
}

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('env prefetch timeout')), ms);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * 预取（方案 C，冷填充语义）：仅缓存为空时静默拉取 `getStatus()` 并写入。
 * 失败/畸形/旧桥缺方法一律静默放弃（不写缓存、不抛错）——真正的加载与错误
 * 处理仍在环境设置组挂载路径。
 *
 * 缓存为不可变快照约定：写入后任何一方不得原地修改 status 对象
 * （组件侧同样 immutable 更新）；违者污染下次进场的瞬显内容。
 */
export function prefetchEnvSettings(): Promise<void> {
  if (statusCache !== null) {
    return Promise.resolve();
  }
  if (prefetchInFlight) {
    return prefetchInFlight;
  }
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.env : undefined;
  if (!bridge) {
    return Promise.resolve();
  }
  const fetchEpoch = epoch;
  // 经 Promise.resolve().then 包装：同步抛错转为拒绝，不逃逸出预取通道。
  const settled = withTimeout(
    Promise.resolve().then(() => bridge.getStatus()),
    PREFETCH_TIMEOUT_MS,
  )
    .then((result) => {
      if (
        fetchEpoch === epoch &&
        statusCache === null &&
        result.ok &&
        isWellFormedEnvStatus(result.data)
      ) {
        statusCache = result.data;
      }
    })
    .catch(() => undefined)
    .then(() => {
      // identity 守卫：reset 可能在本 promise 在途时清空并放行新一轮预取，
      // 旧 promise settle 不得清掉新 latch（否则并发去重失效）。
      if (prefetchInFlight === settled) {
        prefetchInFlight = null;
      }
    });
  prefetchInFlight = settled;
  return settled;
}
