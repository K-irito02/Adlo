/**
 * Shared ad-server reachability probe for the browser preview. Both the
 * `preferHttpWhenReachable` domain proxy (preview-bridge/index.ts) and the
 * preview PTY bridge (preview-pty-bridge.ts) consult this cached probe so the
 * browser preview routes HTTP business calls AND the `/pty` WebSocket to the
 * real ad-server when it is up, falling back to the preview/Vite implementations
 * offline.
 */
const AD_SERVER_PROBE_TIMEOUT_MS = 2000;

const probeCache = new Map<string, Promise<boolean>>();
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
 * is NOT cached long-term — the next call re-probes, so an ad-server that
 * starts slower than the first probe still gets picked up without a page
 * reload (Phase 4 R2). Successful probes stay cached (the server rarely
 * disappears; callers observe per-call NETWORK_ERROR for mid-session drops).
 */
export function isAdServerReachable(baseUrl: string): Promise<boolean> {
  const cached = probeCache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const probe = (async () => {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(AD_SERVER_PROBE_TIMEOUT_MS),
      });
      const reachable = res.ok;
      // 失败不长期缓存：删键使下次调用重探；成功则保留缓存。
      if (!reachable) {
        probeCache.delete(baseUrl);
      }
      notify(baseUrl, reachable);
      return reachable;
    } catch {
      probeCache.delete(baseUrl);
      notify(baseUrl, false);
      return false;
    }
  })();
  probeCache.set(baseUrl, probe);
  return probe;
}

/** Test seam: reset the cached probe (vitest `vi.resetModules` also works). */
export function resetAdServerReachability(): void {
  probeCache.clear();
  lastNotified.clear();
}
