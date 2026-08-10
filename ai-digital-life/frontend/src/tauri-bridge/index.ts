import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { createPtyWsClient } from '../shared/ipc/pty-ws';
import { createTauriAppBridge } from './tauri-app';
import { createTauriBrowserBridge } from './tauri-browser';
import { createTauriProviderBridge } from './tauri-provider';
import { createTauriReservedBridge } from './tauri-reserved';
import { createTauriWindowBridge } from './tauri-window';
import { createTauriWorkspaceBridge } from './tauri-workspace';
import { invokeIpc } from './tauri-shared';

/**
 * Compose the Tauri `DigitalLifeBridge` for the narrowed system shell (Task 10):
 * every business domain delegates to [`createHttpBridge`] against the spawned
 * `ad-server` (the desktop's base URL is discovered via `app_get_server_info`),
 * while the system/shell capabilities stay on Tauri invoke: `window`, `app`,
 * `browser`, `reserved`, `workspace.pickDirectory` / `revealInFileManager` /
 * `onFileChanged`, `provider.getProviderApiKey` / `hasProviderApiKey` and
 * `setLogMode`. The four stream subscriptions use the httpBridge SSE `/event`
 * and the shared `/pty` WebSocket client — identical to the browser preview.
 *
 * @param baseUrl ad-server base URL; when omitted, falls back to
 * `resolveAdlServerBaseUrl()` (used when the engine did not start, e.g. dev).
 */
export function createTauriBridge(baseUrl?: string): DigitalLifeBridge {
  const resolvedBaseUrl = baseUrl ?? resolveAdlServerBaseUrl();
  const http = createHttpBridge({ baseUrl: resolvedBaseUrl });
  const tauriProvider = createTauriProviderBridge();
  const tauriWorkspace = createTauriWorkspaceBridge();
  // Shared `/pty` WebSocket client — both `pty` RPC and `subscribePtyOutput`
  // share one socket (matches the preview `createPtyBridge`).
  const ptyWs = createPtyWsClient(resolvedBaseUrl);
  return {
    ...http,

    // Provider domain stays on httpBridge except the credential read-back:
    // `getProviderApiKey` / `hasProviderApiKey` go through the Tauri invoke
    // channel so the desktop settings key input can be re-filled after restart.
    provider: {
      ...http.provider,
      getProviderApiKey: tauriProvider.getProviderApiKey,
      hasProviderApiKey: tauriProvider.hasProviderApiKey,
    },

    // `workspace.pickDirectory` (native folder dialog), `workspace.revealInFileManager`
    // (OS file-manager reveal) and `workspace.onFileChanged` (a Tauri channel
    // subscription) are Tauri shell capabilities with NO ad-server HTTP route.
    workspace: {
      ...http.workspace,
      pickDirectory: tauriWorkspace.pickDirectory,
      revealInFileManager: tauriWorkspace.revealInFileManager,
      onFileChanged: tauriWorkspace.onFileChanged,
    },

    // PTY goes over the shared `/pty` WebSocket client (Task 6 protocol); the
    // terminal panel drives `pty.*` and subscribes to `subscribePtyOutput` over
    // the same socket. No Tauri `pty_*` invoke commands remain (Task 10).
    pty: ptyWs.pty,
    subscribePtyOutput: (listener) => ptyWs.subscribePtyOutput(listener),

    setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
      await invoke('app_set_log_mode', { target, mode });
    },

    window: createTauriWindowBridge(),
    app: createTauriAppBridge(),
    browser: createTauriBrowserBridge(),
    reserved: createTauriReservedBridge(),
  };
}

/**
 * Resolve the ad-server base URL for the desktop shell: invoke the new
 * `app_get_server_info` Tauri command (returns the spawned engine's URL), and
 * fall back to `resolveAdlServerBaseUrl()` when the engine is not running.
 */
export async function resolveTauriServerBaseUrl(): Promise<string> {
  try {
    const info = await invokeIpc<{ baseUrl?: string | null }>('app_get_server_info');
    if (info.ok && info.data?.baseUrl) {
      return info.data.baseUrl;
    }
  } catch {
    // fall through to the default
  }
  return resolveAdlServerBaseUrl();
}

export { isTauriShell } from './tauri-shared';
