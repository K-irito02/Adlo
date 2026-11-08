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
import { createPreviewFileSaveBridge } from './preview-file-save';
import type { SystemMonitorBridge } from '../shared/ipc/system_monitor';
import type { StorageBridge } from '../shared/ipc/storage';
import type { EnvBridge } from '../shared/ipc/env';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { requestPreviewApi } from '../shared/ipc/preview-api';
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
            console.log(`[adl-bridge] using adl-server at ${baseUrl}`);
          }
        } else {
          const key = `${String(prop)}:${baseUrl}`;
          if (!fallbackWarned.has(key)) {
            fallbackWarned.add(key);
            console.warn(
              `[adl-bridge] adl-server at ${baseUrl} is not reachable — "${String(
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
  // 工作区 ctx 由 workspace bridge 维护（open 时更新），events 轮询共享同一对象以读取 rootPath。
  const previewWorkspaceCtx = {
    recentWorkspaces: loadRecentWorkspaces(),
    currentWorkspace: undefined,
    retrievalStatus: undefined,
  };
  const { workspace, retrieval } = createPreviewWorkspaceBridge(
    previewWorkspaceCtx,
    setMockActiveWorkspace,
  );
  // search/git/events 三桥共享同一 ctx（open 时更新 currentWorkspace）：
  // 独立字面量会导致切换后 search/git 恒读 undefined（事项 45 Phase 4 G3-1.5 同类）。
  const gitBridge = createPreviewGitBridge(previewWorkspaceCtx, setMockActiveWorkspace);
  const searchBridge = createPreviewSearchBridge(previewWorkspaceCtx);
  const eventsBridge = createPreviewEventsBridge(previewWorkspaceCtx);
  const windowBridge = createPreviewWindowBridge(mockDigitalLifeBridge.window);
  const diagnosticBridge = createPreviewDiagnosticBridge(mockDigitalLifeBridge.app);
  const patchBridge = createPreviewPatchBridge(mockDigitalLifeBridge.patch);

  const workspacePreview: WorkspaceBridge = {
    ...workspace,
    ...searchBridge,
    ...gitBridge,
    onFileChanged: eventsBridge.onFileChanged,
    onFilesChanged: eventsBridge.onFilesChanged,
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
    // app 域必须直连真实 `/app/*`（Phase 4 R5，用户决策）：不可达即失败，
    // 不回退 mock —— 静默 mock 会掩盖"后端没起来"的真实故障（如 Coulson 命名漂移
    // 致端口未注入），失败经 bootstrap 的 captureError 以错误卡响亮呈现。
    // mock.app 仅供测试等明确批准的场景直接使用。
    app: {
      ...diagnosticBridge,
      getInfo: http.app.getInfo,
      updatePreferences: http.app.updatePreferences,
    } satisfies AppBridge,
    workspace: preferHttpWhenReachable<WorkspaceBridge>(
      adlServerBaseUrl,
      workspaceHttp,
      workspacePreview,
      // `onFileChanged` / `onFilesChanged` return a synchronous unsubscribe
      // (`() => void`) per the `WorkspaceBridge` contract — they must NOT be
      // async-wrapped by the proxy, otherwise `useAppStartup` captures a
      // `Promise` instead of the real unsubscribe (breaks the sync-unsubscribe
      // contract + React effect cleanup). They are returned as-is from the
      // preview impl (same in both reachable and fallback paths).
      ['onFileChanged', 'onFilesChanged'],
    ),
    retrieval: preferHttpWhenReachable<RetrievalBridge>(
      adlServerBaseUrl,
      http.retrieval,
      retrieval,
    ),
    dsh: mockDigitalLifeBridge.dsh,
    opencode: mockDigitalLifeBridge.opencode,
    // env 复用 storage 的可达性代理模式：ad-server 可达走 http `/env/*`，
    // 否则回退 mock 固定可用快照。注：与 dsh（mock-only）有意不同 —— env 有真实 GET 路由故走 http 优先，勿“对齐”回 mock-only。
    env: preferHttpWhenReachable<EnvBridge>(adlServerBaseUrl, http.env, mockDigitalLifeBridge.env),
    patch: preferHttpWhenReachable<PatchBridge>(adlServerBaseUrl, http.patch, patchBridge),
    browser: {
      createForTab: (
        _tabId: string,
        _url: string,
        _colorScheme?: 'light' | 'dark',
        _location?: 'panel' | 'center',
        _agentOrigins?: string[],
        _agentInterceptEnabled?: boolean,
      ) => Promise.resolve(null),
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
      dividerStripShow: (
        _bounds: { x: number; y: number; width: number; height: number },
        _theme: { line: string; glow: string },
        _ariaLabel: string,
        _lang: string,
      ) => Promise.resolve(),
      dividerStripSetBounds: (_bounds: { x: number; y: number; width: number; height: number }) =>
        Promise.resolve(),
      dividerStripHide: () => Promise.resolve(),
      memoryPressure: () => Promise.resolve(false),
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      canGoBackTab: (_tabId: string) => Promise.resolve(false),
      canGoForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: (tabId: string, url: string) => void) => () => {},
      onMetaChanged: (_listener: (tabId: string, meta: PageMeta) => void) => () => {},
      onPageReady: (_listener: (tabId: string) => void) => () => {},
      onOpenNewTab: (_listener: (url: string) => void) => () => {},
      onAgentLink:
        (_listener: (payload: { kind: 'url' | 'file'; url: string }) => void) => () => {},
      setAgentIntercept: (_origins: string[], _enabled: boolean) => Promise.resolve(),
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
    fileSave: createPreviewFileSaveBridge(),
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
      // getImageUrl 同理：纯 URL 构造器，恒走 http 实现。
      getImageUrl: http.clipboard.getImageUrl,
      getHtmlUrl: http.clipboard.getHtmlUrl,
      getRtfUrl: http.clipboard.getRtfUrl,
      // exportUrl 同样是纯 URL 构造器（返回 `/clipboard/export?id=…`，作为
      // `saveToFile` 的载荷来源），必须覆盖在 spread 之后，避免被 Proxy 异步包裹。
      exportUrl: http.clipboard.exportUrl,
      // onChanged 返回同步 unsubscribe（与 workspace.onFilesChanged 同契约），
      // 必须放在 spread 之外：Proxy 会把方法异步包裹，破坏「同步返回 unsubscribe」。
      // 代价：离线预览下它恒绑定 http WS（不走可达性 / mock 回退），会按退避策略反复尝试
      // 连接 `/ws/workspace` 并在控制台留下重连噪声——订阅方仍有 10s 轮询兜底，功能不受影响。
      onChanged: http.clipboard.onChanged,
    },
    systemMonitor: preferHttpWhenReachable<SystemMonitorBridge>(
      adlServerBaseUrl,
      http.systemMonitor,
      mockDigitalLifeBridge.systemMonitor,
    ),
    // Storage domain: httpBridge against the Task 2 `/storage/*` routes when the
    // ad-server is reachable, mock otherwise. B5: the browser cannot restart the
    // host process — `http.storage.restartApp` returns `NOT_SUPPORTED`, while
    // the Tauri shell overrides it with `app_restart`.
    storage: preferHttpWhenReachable<StorageBridge>(
      adlServerBaseUrl,
      http.storage,
      mockDigitalLifeBridge.storage,
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
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
