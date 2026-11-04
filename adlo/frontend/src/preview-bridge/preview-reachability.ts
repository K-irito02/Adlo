/**
 * Shared ad-server reachability probe for the browser preview. Both the
 * `preferHttpWhenReachable` domain proxy (preview-bridge/index.ts) and the
 * preview PTY bridge (preview-pty-bridge.ts) consult this cached probe so the
 * browser preview routes HTTP business calls AND the `/pty` WebSocket to the
 * real ad-server when it is up, falling back to the preview/Vite implementations
 * offline.
 */
const AD_SERVER_PROBE_TIMEOUT_MS = 2000;
/**
 * 失败探针的负缓存 TTL（Closing H-1）：失败后 5s 内直接返回 false，不重探。
 * 否则 ad-server 宕机期间每个业务调用都要先付一次最高 2s 的 `/health` 超时。
 * 成功仍长期缓存；慢启动（5s 内起来）下次调用即重探接住。
 */
const NEGATIVE_CACHE_TTL_MS = 5000;

interface ProbeEntry {
  promise: Promise<boolean>;
  /** 失败时间戳（成功为 null，即长期有效）。 */
  failedAt: number | null;
}

const probeCache = new Map<string, ProbeEntry>();
const reachabilityListeners = new Set<(baseUrl: string, reachable: boolean) => void>();
const lastNotified = new Map<string, boolean>();

function notify(baseUrl: string, reachable: boolean): void {
  if (lastNotified.get(baseUrl) === reachable) {
    return;
  }
  lastNotified.set(baseUrl, reachable);
  for (const listener of reachabilityListeners) {
    try {
      listener(baseUrl, reachable);
    } catch {
      // 单监听器异常不影响其他监听器。
    }
  }
}

/**
 * 订阅可达性变化（如设置面板的"未连接后端"离线标识）。
 * 注意：bridge 层不得直接依赖 store（分层），由 `useAppStartup` 订阅后写入 store。
 */
export function onAdServerReachabilityChange(
  listener: (baseUrl: string, reachable: boolean) => void,
): () => void {
  reachabilityListeners.add(listener);
  return () => {
    reachabilityListeners.delete(listener);
  };
}

/**
 * Probe the ad-server `/health` endpoint (cached per baseUrl). A FAILED probe
 * is cached for `NEGATIVE_CACHE_TTL_MS` (no per-call 2s stall while down),
 * then re-probed — so an ad-server that starts slower than the first probe
 * still gets picked up without a page reload (Phase 4 R2). Successful probes
 * stay cached (the server rarely disappears; callers observe per-call
 * NETWORK_ERROR for mid-session drops).
 */
export function isAdServerReachable(baseUrl: string): Promise<boolean> {
  const cached = probeCache.get(baseUrl);
  if (cached) {
    // 成功长期有效；失败在 TTL 内直接返回，不重探（Closing H-1）。
    if (cached.failedAt === null || Date.now() - cached.failedAt < NEGATIVE_CACHE_TTL_MS) {
      return cached.promise;
    }
    probeCache.delete(baseUrl);
  }
  const startedAt = Date.now();
  const probe = (async () => {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(AD_SERVER_PROBE_TIMEOUT_MS),
      });
      const reachable = res.ok;
      // 失败只记时间戳：TTL 内复用本次结果，过期后删键重探。
      const entry = probeCache.get(baseUrl);
      if (entry) {
        entry.failedAt = reachable ? null : startedAt;
      }
      notify(baseUrl, reachable);
      return reachable;
    } catch {
      const entry = probeCache.get(baseUrl);
      if (entry) {
        entry.failedAt = startedAt;
      }
      notify(baseUrl, false);
      return false;
    }
  })();
  probeCache.set(baseUrl, { promise: probe, failedAt: null });
  return probe;
}

/** Test seam: reset the cached probe (vitest `vi.resetModules` also works). */
export function resetAdServerReachability(): void {
  probeCache.clear();
  lastNotified.clear();
}
