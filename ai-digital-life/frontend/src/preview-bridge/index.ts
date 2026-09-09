import type { AudioStatePayload, BrowserBridge, PageMeta } from '../shared/ipc/browser';
import type { AppBridge } from '../shared/ipc/app';
import type { WorkspaceBridge } from '../shared/ipc/workspace';
import type { PatchBridge } from '../shared/ipc/patch';
import type { DurableBridge } from '../shared/ipc/durable';
import type { GitHubBridge } from '../shared/ipc/github';
import type { ReferenceBridge } from '../shared/ipc/reference';
import type { RetrievalBridge } from '../shared/ipc/retrieval';
import type { SnapshotBridge } from '../shared/ipc/snapshot';
import type { ClipboardBridge } from '../shared/ipc/clipboard';
import type { SystemMonitorBridge } from '../shared/ipc/system_monitor';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { createPtyBridge } from './preview-pty-bridge';
import { loadRecentWorkspaces } from './preview-storage';
import { createPreviewWorkspaceBridge } from './preview-workspace';
import { createPreviewGitBridge } from './preview-git';
import { createPreviewSearchBridge } from './preview-search';
import { createPreviewEventsBridge } from './preview-events';
import { createPreviewWindowBridge } from './preview-window';
import { createPreviewDiagnosticBridge } from './preview-diagnostic';
import { createPreviewPatchBridge } from './preview-patch';
import { BrowserAudioMonitor } from './preview-browser-audio';
import { isAdServerReachable } from './preview-reachability';

const fallbackWarned = new Set<string>();
// Debug instrumentation (Task 9): log once per baseUrl when the httpBridge
// routes to the real ad-server, so a `pnpm dev:preview` session is verifiable
// by eye in the console. Dev-only observability — no behavior impact.
const adServerConnected = new Set<string>();

/**
 * Domain-level wrapper: routes every method to the httpBridge implementation
 * once the ad-server is reachable, otherwise to the preview/mock fallback.
 * The single cast keeps the Proxy typed as `T`; the fallback path preserves
 * the existing browser demo without a running ad-server.
 *
 * `syncReturnMethods` lists methods that return a SYNCHRONOUS value (e.g. the
 * `WorkspaceBridge.onFileChanged` unsubscribe `() => void`) rather than a
 * `Promise<IpcResult<T>>`. They are returned as-is (never async-wrapped) so
 * callers receive the real synchronous unsubscribe, exactly per the bridge
 * contract.
 */
function preferHttpWhenReachable<T extends object>(
  baseUrl: string,
  httpImpl: T,
  fallbackImpl: T,
  syncReturnMethods?: readonly (keyof T)[],
): T {
  const proxy = new Proxy(fallbackImpl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      if (syncReturnMethods?.includes(prop as keyof T)) {
        return value;
      }
      return async (...args: unknown[]) => {
        const reachable = await isAdServerReachable(baseUrl);
        const source = (reachable ? httpImpl : target) as Record<
          string,
          (...callArgs: unknown[]) => unknown
        >;
        if (reachable) {
          const key = `connected:${baseUrl}`;
          if (!adServerConnected.has(key)) {
            adServerConnected.add(key);
            console.log(`[adl-bridge] using ad-server at ${baseUrl}`);
          }
        } else {
          const key = `${String(prop)}:${baseUrl}`;
          if (!fallbackWarned.has(key)) {
            fallbackWarned.add(key);
            console.warn(
              `[adl-bridge] ad-server at ${baseUrl} is not reachable — "${String(
                prop,
              )}" falls back to the preview/mock implementation.`,
            );
          }
        }
        const fn = source[prop as string];
        return typeof fn === 'function' ? fn.apply(source, args) : undefined;
      };
    },
  });
  return proxy as unknown as T;
}

/**
 * Set up the browser-mode DigitalLifeBridge on `window.digitalLife`.
 *
 * @returns {Promise<void>} Must be `await`-ed by the caller. Skipping the
 *   `await` causes a race condition where React renders before the bridge is
 *   ready.
 */
export async function setupPreviewBridge(): Promise<void> {
  if (typeof window === 'undefined' || (window as { digitalLife?: unknown }).digitalLife) {
    return;
  }

  const { mockDigitalLifeBridge, setMockActiveWorkspace } = await import('../mock-bridge');

  const adlServerBaseUrl = resolveAdlServerBaseUrl();
  const http = createHttpBridge({ baseUrl: adlServerBaseUrl });

  setMockActiveWorkspace(undefined);

  const ptyBridge = createPtyBridge();
  const audioMonitor = new BrowserAudioMonitor();
  window.__adlAudioMonitor = audioMonitor;
  const { workspace, retrieval } = createPreviewWorkspaceBridge(
    {
      recentWorkspaces: loadRecentWorkspaces(),
      currentWorkspace: undefined,
      retrievalStatus: undefined,
    },
    setMockActiveWorkspace,
  );
  const gitBridge = createPreviewGitBridge(
    {
      recentWorkspaces: loadRecentWorkspaces(),
      currentWorkspace: undefined,
      retrievalStatus: undefined,
    },
    setMockActiveWorkspace,
  );
  const searchBridge = createPreviewSearchBridge({
    recentWorkspaces: loadRecentWorkspaces(),
    currentWorkspace: undefined,
    retrievalStatus: undefined,
  });
  const eventsBridge = createPreviewEventsBridge();
  const windowBridge = createPreviewWindowBridge(mockDigitalLifeBridge.window);
  const diagnosticBridge = createPreviewDiagnosticBridge(mockDigitalLifeBridge.app);
  const patchBridge = createPreviewPatchBridge(mockDigitalLifeBridge.patch);

  const workspacePreview: WorkspaceBridge = {
    ...workspace,
    ...searchBridge,
    ...gitBridge,
    onFileChanged: eventsBridge.onFileChanged,
  };

  // `workspace.pickDirectory` (native folder dialog) and
  // `workspace.revealInFileManager` (OS file-manager reveal) are system
  // capabilities with NO ad-server HTTP route — the httpBridge implementations
  // are `NOT_SUPPORTED` stubs (httpBridge.ts 279/297). The desktop merge keeps
  // them on the Tauri invoke impl (tauri-bridge/index.ts); the browser merge
  // keeps them on the real preview impls (`preview-workspace.ts` pickDirectory
  // → `/workspace/pick-directory`, revealInFileManager → `/workspace/reveal`)
  // while every other `workspace.*` RPC stays on httpBridge.
  const workspaceHttp: WorkspaceBridge = {
    ...http.workspace,
    pickDirectory: workspacePreview.pickDirectory,
    revealInFileManager: workspacePreview.revealInFileManager,
    onFileChanged: workspacePreview.onFileChanged,
  };

  const previewBridge: DigitalLifeBridge = {
    subscribePtyOutput: ptyBridge.subscribePtyOutput,
    pty: ptyBridge.pty,
    window: windowBridge.window,
    app: {
      ...diagnosticBridge,
      getInfo: http.app.getInfo,
      updatePreferences: http.app.updatePreferences,
    } satisfies AppBridge,
    workspace: preferHttpWhenReachable<WorkspaceBridge>(
      adlServerBaseUrl,
      workspaceHttp,
      workspacePreview,
      // `onFileChanged` returns a synchronous unsubscribe (`() => void`) per
      // the `WorkspaceBridge` contract — it must NOT be async-wrapped by the
      // proxy, otherwise `useAppStartup` captures a `Promise` instead of the
      // real unsubscribe (breaks the sync-unsubscribe contract + React effect
      // cleanup). It is returned as-is from the preview impl (same in both
      // reachable and fallback paths).
      ['onFileChanged'],
    ),
    retrieval: preferHttpWhenReachable<RetrievalBridge>(
      adlServerBaseUrl,
      http.retrieval,
      retrieval,
    ),
    dsh: mockDigitalLifeBridge.dsh,
    patch: preferHttpWhenReachable<PatchBridge>(adlServerBaseUrl, http.patch, patchBridge),
    browser: {
      createForTab: (_tabId: string, _url: string, _colorScheme?: 'light' | 'dark') =>
        Promise.resolve(null),
      activateTab: (_tabId: string) => Promise.resolve(),
      destroyTab: (_tabId: string) => {
        audioMonitor.stopMonitoring(_tabId);
        return Promise.resolve();
      },
      navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
      setTabBounds: (
        _tabId: string,
        _bounds: { x: number; y: number; width: number; height: number },
      ) => Promise.resolve(),
      setDshBounds: (_bounds: { x: number; y: number; width: number; height: number }) =>
        Promise.resolve(),
      memoryPressure: () => Promise.resolve(false),
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      canGoBackTab: (_tabId: string) => Promise.resolve(false),
      canGoForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: (tabId: string, url: string) => void) => () => {},
      onMetaChanged: (_listener: (tabId: string, meta: PageMeta) => void) => () => {},
      onOpenNewTab: (_listener: (url: string) => void) => () => {},
      muteTab: (tabId: string, muted: boolean) => {
        audioMonitor.setMuted(tabId, muted);
        return Promise.resolve();
      },
      onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) =>
        audioMonitor.onStateChange(listener),
      setBrowserColorScheme: (_resolvedTheme: 'light' | 'dark') => Promise.resolve(),
      setZoom: (_tabId: string, _zoomFactor: number) => Promise.resolve(),
      clearCookies: (_tabId: string) => Promise.resolve(),
      clearCache: (_tabId: string) => Promise.resolve(),
    } satisfies BrowserBridge,
    github: preferHttpWhenReachable<GitHubBridge>(
      adlServerBaseUrl,
      http.github,
      mockDigitalLifeBridge.github,
    ),
    snapshot: preferHttpWhenReachable<SnapshotBridge>(
      adlServerBaseUrl,
      http.snapshot,
      mockDigitalLifeBridge.snapshot,
    ),
    reference: preferHttpWhenReachable<ReferenceBridge>(
      adlServerBaseUrl,
      http.reference,
      mockDigitalLifeBridge.reference,
    ),
    durable: preferHttpWhenReachable<DurableBridge>(
      adlServerBaseUrl,
      http.durable,
      mockDigitalLifeBridge.durable,
    ),
    clipboard: {
      ...preferHttpWhenReachable<ClipboardBridge>(
        adlServerBaseUrl,
        http.clipboard,
        mockDigitalLifeBridge.clipboard,
      ),
      // getThumbUrl 是纯 URL 构造器（无网络副作用），始终走 http 实现拼接
      // ad-server base URL。不能放进 syncReturnMethods / mock fallback，
      // 否则 mock 的 getThumbUrl 恒返回 ''，导致预览模式缩略图渲染为图标占位。
      getThumbUrl: http.clipboard.getThumbUrl,
    },
    systemMonitor: preferHttpWhenReachable<SystemMonitorBridge>(
      adlServerBaseUrl,
      http.systemMonitor,
      mockDigitalLifeBridge.systemMonitor,
    ),
    // `reserved` (ACP/HTTP-API/CodeMode) has NO ad-server HTTP routes — the
    // httpBridge implementations are all `NOT_SUPPORTED` stubs. The desktop
    // keeps `reserved: createTauriReservedBridge()` on Tauri invoke; the
    // browser keeps the preview/mock impl unconditionally (never wrapped in
    // preferHttpWhenReachable).
    reserved: mockDigitalLifeBridge.reserved,
    subscribeModelStream: http.subscribeModelStream,
    subscribeRunActivity: http.subscribeRunActivity,
    subscribeTerminalStream: http.subscribeTerminalStream,
    // Raw SessionPartEvent stream (S2 PartStore): delegates to httpBridge like
    // the other SSE subscriptions — the PartStore needs the full wire, so this
    // is intentionally not the preview/mock fallback (which no-ops).
    subscribeSessionPartEvents: http.subscribeSessionPartEvents,
    setLogMode: mockDigitalLifeBridge.setLogMode,
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
