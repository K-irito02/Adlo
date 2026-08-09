import { createPtyWsClient, type PtyWsClientOptions } from '../shared/ipc/pty-ws';

/**
 * Preview-mode PTY bridge: a thin wrapper over the shared `/pty` WebSocket
 * client (`shared/ipc/pty-ws.ts`) pointed at the same origin the page is
 * served from. During `pnpm dev` the Vite dev server answers `ws://<host>/pty`
 * (see `frontend/dev/previewTerminalService.ts`); once the preview spawns the
 * real ad-server (Task 9) the same client reaches the real `/pty` endpoint.
 */
export function createPtyBridge(options?: PtyWsClientOptions) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return createPtyWsClient(baseUrl, options);
}
