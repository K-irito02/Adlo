import {
  createPtyWsClient,
  toWsUrl,
  type PtyWsClient,
  type PtyWsClientOptions,
} from '../shared/ipc/pty-ws';
import type { PtyOutputEvent } from '../shared/ipc/pty';
import { resolveAdlServerBaseUrl } from '../httpBridge';
import { isAdServerReachable } from './preview-reachability';

/**
 * Preview-mode PTY bridge: a wrapper over the shared `/pty` WebSocket client
 * (`shared/ipc/pty-ws.ts`) pointed at the **ad-server** base URL when the
 * ad-server is reachable, else the same origin the page is served from (the
 * Vite dev server, which answers `ws://<host>/pty` via
 * `frontend/dev/previewTerminalService.ts`).
 *
 * Finding 4: previously this always used `window.location.origin`, so a
 * `pnpm dev:preview` session with the ad-server running still sent browser
 * terminals to the Vite node-pty mock instead of the engine's `/pty`. Now it
 * mirrors `preferHttpWhenReachable` / how httpBridge gets its baseUrl
 * (`resolveAdlServerBaseUrl()`): the shared `/health` probe decides the target
 * once, and the Vite mock is kept only as the offline fallback.
 *
 * The base URL is resolved lazily — the probe is async but the bridge contract
 * requires `subscribePtyOutput` to return a synchronous unsubscribe. So a
 * default (no `wsFactory`) bridge buffers listeners until the client resolves,
 * while the `pty.*` methods are already promise-returning and simply await the
 * client. An injected `wsFactory` (existing tests / explicit wiring) keeps the
 * historical synchronous behavior: the factory owns socket construction, so the
 * base URL is irrelevant and the client is created immediately.
 */

export function createPtyBridge(options?: PtyWsClientOptions) {
  const viteOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Explicit wsFactory → synchronous, base-agnostic (the factory owns socket
  // construction). Preserves the historical behavior exactly.
  if (options?.wsFactory) {
    return createPtyWsClient(viteOrigin, options);
  }

  const adlServerBaseUrl = resolveAdlServerBaseUrl();
  let client: PtyWsClient | null = null;
  let clientPromise: Promise<PtyWsClient> | null = null;
  // Listener → unsubscribe, buffered until the client resolves (the socket URL
  // depends on the async reachability probe).
  const pendingListeners = new Map<(e: PtyOutputEvent) => void, () => void>();

  const getClient = (): Promise<PtyWsClient> => {
    if (client) {
      return Promise.resolve(client);
    }
    clientPromise ??= isAdServerReachable(adlServerBaseUrl).then((reachable) => {
      const baseUrl = reachable ? adlServerBaseUrl : viteOrigin;
      const resolved = createPtyWsClient(baseUrl, {
        ...options,
        wsFactory: () => new WebSocket(toWsUrl(baseUrl)),
      });
      client = resolved;
      // Forward buffered listeners onto the real client.
      for (const [listener] of pendingListeners) {
        const unsub = resolved.subscribePtyOutput(listener);
        pendingListeners.set(listener, unsub);
      }
      return resolved;
    });
    return clientPromise;
  };

  return {
    subscribePtyOutput: (listener: (e: PtyOutputEvent) => void) => {
      if (client) {
        return client.subscribePtyOutput(listener);
      }
      const placeholder = () => {
        pendingListeners.delete(listener);
      };
      pendingListeners.set(listener, placeholder);
      void getClient();
      return () => {
        const unsub = pendingListeners.get(listener);
        if (unsub) {
          unsub();
          pendingListeners.delete(listener);
        }
      };
    },
    pty: {
      create: (input: { shell?: string; cwd?: string; cols: number; rows: number }) =>
        getClient().then((c) => c.pty.create(input)),
      input: (sessionId: string, data: string) =>
        getClient().then((c) => c.pty.input(sessionId, data)),
      resize: (sessionId: string, cols: number, rows: number) =>
        getClient().then((c) => c.pty.resize(sessionId, cols, rows)),
      kill: (sessionId: string) => getClient().then((c) => c.pty.kill(sessionId)),
      list: () => getClient().then((c) => c.pty.list()),
    },
    close: () => {
      void getClient().then((c) => c.close());
    },
  };
}
