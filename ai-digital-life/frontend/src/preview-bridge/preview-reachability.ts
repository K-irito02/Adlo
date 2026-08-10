/**
 * Shared ad-server reachability probe for the browser preview. Both the
 * `preferHttpWhenReachable` domain proxy (preview-bridge/index.ts) and the
 * preview PTY bridge (preview-pty-bridge.ts) consult this cached probe so the
 * browser preview routes HTTP business calls AND the `/pty` WebSocket to the
 * real ad-server when it is up, falling back to the preview/Vite implementations
 * offline.
 */
const AD_SERVER_PROBE_TIMEOUT_MS = 2000;

let adServerReachability: Promise<boolean> | null = null;

/**
 * Probe the ad-server `/health` endpoint once (cached). Until Task 9 wires the
 * dev-script startup + port injection, the browser preview uses this to decide
 * whether business calls should hit the real ad-server (httpBridge) or fall
 * back to the preview/mock implementations that keep the demo working.
 */
export function isAdServerReachable(baseUrl: string): Promise<boolean> {
  adServerReachability ??= (async () => {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(AD_SERVER_PROBE_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  })();
  return adServerReachability;
}

/** Test seam: reset the cached probe (vitest `vi.resetModules` also works). */
export function resetAdServerReachability(): void {
  adServerReachability = null;
}
