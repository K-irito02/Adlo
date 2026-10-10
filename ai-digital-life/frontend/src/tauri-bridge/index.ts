import { invoke } from '@tauri-apps/api/core';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import type {
  StorageApplyResult,
  StorageBridge,
  StorageForeignScan,
  StoragePathPatch,
  StoragePreflight,
  StorageStatus,
  TreeCacheOptions,
  TreeCacheStats,
} from '../shared/ipc/storage';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { createPtyWsClient } from '../shared/ipc/pty-ws';
import { createTauriAppBridge } from './tauri-app';
import { createTauriBrowserBridge } from './tauri-browser';
import { createTauriDshBridge } from './tauri-dsh';
import { createTauriReservedBridge } from './tauri-reserved';
import { createTauriWindowBridge } from './tauri-window';
import { createTauriWorkspaceBridge } from './tauri-workspace';
import { createTauriClipboardBridge } from './tauri-clipboard';
import { invokeIpc } from './tauri-shared';

/**
 * Compose the Tauri `DigitalLifeBridge` for the narrowed system shell (Task 10):
 * every business domain delegates to [`createHttpBridge`] against the spawned
 * `ad-server` (the desktop's base URL is discovered via `app_get_server_info`),
 * while the system/shell capabilities stay on Tauri invoke: `window`, `app`,
 * `browser`, `reserved`, `workspace.pickDirectory` / `revealInFileManager` /
 * `onFileChanged` and `setLogMode`. The stream subscriptions use the httpBridge
 * SSE `/event`
 * (the three v1-mapped `subscribe*` plus the raw `subscribeSessionPartEvents`
 * for the S2 PartStore) and the shared `/pty` WebSocket client — identical to
 * the browser preview.
 *
 * @param baseUrl ad-server base URL; when omitted, falls back to
 * `resolveAdlServerBaseUrl()` (used when the engine did not start, e.g. dev).
 */
export function createTauriBridge(baseUrl?: string): DigitalLifeBridge {
  const resolvedBaseUrl = baseUrl ?? resolveAdlServerBaseUrl();
  const http = createHttpBridge({ baseUrl: resolvedBaseUrl });
  const tauriWorkspace = createTauriWorkspaceBridge();
  const tauriClipboard = createTauriClipboardBridge();
  // Shared `/pty` WebSocket client — both `pty` RPC and `subscribePtyOutput`
  // share one socket (matches the preview `createPtyBridge`).
  const ptyWs = createPtyWsClient(resolvedBaseUrl);
  return {
    ...http,

    // `workspace.pickDirectory` (native folder dialog), `workspace.revealInFileManager`
    // (OS file-manager reveal) and `workspace.onFileChanged` (a Tauri channel
    // subscription) are Tauri shell capabilities with NO ad-server HTTP route.
    workspace: {
      ...http.workspace,
      pickDirectory: tauriWorkspace.pickDirectory,
      revealInFileManager: tauriWorkspace.revealInFileManager,
      onFileChanged: tauriWorkspace.onFileChanged,
    },

    // `clipboard.saveToFile` (native "Save as…" dialog + write) is a Tauri shell
    // capability with NO ad-server HTTP route — the ad-server only serves the
    // payload (`GET /clipboard/export`), the shell owns the destination.
    clipboard: {
      ...http.clipboard,
      saveToFile: tauriClipboard.saveToFile,
    },

    // PTY goes over the shared `/pty` WebSocket client (Task 6 protocol); the
    // terminal panel drives `pty.*` and subscribes to `subscribePtyOutput` over
    // the same socket. No Tauri `pty_*` invoke commands remain (Task 10).
    pty: ptyWs.pty,
    subscribePtyOutput: (listener) => ptyWs.subscribePtyOutput(listener),

    setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
      await invoke('app_set_log_mode', { target, mode });
    },

    // dsh 无专属视图：进程拉起/终止走 ad-server HTTP `/dsh/*`，承载页是普通浏览器
    // 中心标签，其 WebView 归浏览器池所有（见 tauri-dsh.ts）。
    dsh: createTauriDshBridge(http.dsh),

    window: createTauriWindowBridge(),
    app: createTauriAppBridge(),
    browser: createTauriBrowserBridge(),
    reserved: createTauriReservedBridge(),

    // Storage path management stays on Tauri invoke (Plan C Task 1 commands):
    // the desktop owns the locator writes and the process restart. The
    // migration itself runs on the next launch; `app_restart` is only invoked
    // by the UI after `storage_set_paths` reports `restartRequired === true`.
    storage: {
      getStatus: () => invokeIpc<StorageStatus>('storage_get_status'),
      scanForeign: () => invokeIpc<StorageForeignScan[]>('storage_scan_foreign_cmd'),
      preflight: (patch: StoragePathPatch) =>
        invokeIpc<StoragePreflight>('storage_preflight_cmd', { patch }),
      setPaths: (patch: StoragePathPatch, applyNow: boolean) =>
        invokeIpc<StorageApplyResult>('storage_set_paths', { patch, applyNow }),
      cancelPending: () => invokeIpc<void>('storage_cancel_pending'),
      restartApp: () => invokeIpc<void>('app_restart'),
      // 工作区树缓存（Task 5 `StorageBridge` 三方法）：命令名取自 Task 5 `@command`
      // 注解；对应 `#[tauri::command]` 尚无 Rust 实现，落地前 invoke 报错透传。
      getTreeCacheStats: () => invokeIpc<TreeCacheStats>('storage_tree_cache_stats'),
      setTreeCacheOptions: (opts: TreeCacheOptions) =>
        invokeIpc<void>('storage_tree_cache_options', { opts }),
      clearTreeCache: () => invokeIpc<void>('storage_tree_cache_clear'),
    } satisfies StorageBridge,
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
