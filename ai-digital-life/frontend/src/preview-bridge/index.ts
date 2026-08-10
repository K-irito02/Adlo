import type { AudioStatePayload, BrowserBridge, PageMeta } from '../shared/ipc/browser';
import type { AppBridge } from '../shared/ipc/app';
import type { WorkspaceBridge } from '../shared/ipc/workspace';
import type { ConversationBridge } from '../shared/ipc/conversation';
import type { AgentBridge } from '../shared/ipc/agent';
import type { SubagentBridge } from '../shared/ipc/subagent';
import type { PatchBridge } from '../shared/ipc/patch';
import type { McpBridge } from '../shared/ipc/mcp';
import type { CommandsConfigBridge } from '../shared/ipc/commands_config';
import type { CompactionBridge } from '../shared/ipc/compaction';
import type { CommandBridge } from '../shared/ipc/command';
import type { CustomAgentBridge } from '../shared/ipc/custom_agent';
import type { DurableBridge } from '../shared/ipc/durable';
import type { GitHubBridge } from '../shared/ipc/github';
import type { LspBridge } from '../shared/ipc/lsp';
import type { PermissionBridge } from '../shared/ipc/permission';
import type { ProviderBridge } from '../shared/ipc/provider';
import type { ReferenceBridge } from '../shared/ipc/reference';
import type { RetrievalBridge } from '../shared/ipc/retrieval';
import type { RunActivityBridge } from '../shared/ipc/run-activity';
import type { SessionForkBridge } from '../shared/ipc/session_fork';
import type { SnapshotBridge } from '../shared/ipc/snapshot';
import type { TaskBridge } from '../shared/ipc/task';
import type { WebToolsBridge } from '../shared/ipc/web_tools';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { mockDigitalLifeBridge, setMockActiveWorkspace } from '../mock-bridge';
import { withDemoMode } from '../mock/demo/demo-mode';
import { createHttpBridge, resolveAdlServerBaseUrl } from '../httpBridge';
import { createPtyBridge } from './preview-pty-bridge';
import { loadRecentWorkspaces } from './preview-storage';
import type { PreviewContext } from './preview-context';
import { createBaseAppInfo, createPreviewModelBridge } from './preview-model';
import { createPreviewWorkspaceBridge } from './preview-workspace';
import { createPreviewGitBridge } from './preview-git';
import { createPreviewSearchBridge } from './preview-search';
import { createPreviewEventsBridge } from './preview-events';
import { createPreviewWindowBridge } from './preview-window';
import { createPreviewDiagnosticBridge } from './preview-diagnostic';
import { createPreviewTaskBridge } from './preview-task';
import { createPreviewConversationBridge } from './preview-conversation';
import { createPreviewPatchBridge } from './preview-patch';
import { createPreviewCommandBridge } from './preview-command';
import { BrowserAudioMonitor } from './preview-browser-audio';

const AD_SERVER_PROBE_TIMEOUT_MS = 2000;

let adServerReachability: Promise<boolean> | null = null;
const fallbackWarned = new Set<string>();
// Debug instrumentation (Task 9): log once per baseUrl when the httpBridge
// routes to the real ad-server, so a `pnpm dev:preview` session is verifiable
// by eye in the console. Dev-only observability — no behavior impact.
const adServerConnected = new Set<string>();

/**
 * Probe the ad-server `/health` endpoint once (cached). Until Task 9 wires the
 * dev-script startup + port injection, the browser preview uses this to decide
 * whether business calls should hit the real ad-server (httpBridge) or fall
 * back to the preview/mock implementations that keep the demo working.
 */
function isAdServerReachable(baseUrl: string): Promise<boolean> {
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

export function setupPreviewBridge(): void {
  if (typeof window === 'undefined' || (window as { digitalLife?: unknown }).digitalLife) {
    return;
  }

  const adlServerBaseUrl = resolveAdlServerBaseUrl();
  const http = createHttpBridge({ baseUrl: adlServerBaseUrl });

  const ctx: PreviewContext = {
    appInfo: createBaseAppInfo(),
    recentWorkspaces: loadRecentWorkspaces(),
    currentWorkspace: undefined,
    retrievalStatus: undefined,
  };

  setMockActiveWorkspace(undefined);

  const ptyBridge = createPtyBridge();
  const audioMonitor = new BrowserAudioMonitor();
  window.__adlAudioMonitor = audioMonitor;
  const { workspace, retrieval, ensureCurrentWorkspaceRestored } = createPreviewWorkspaceBridge(
    ctx,
    setMockActiveWorkspace,
  );
  const gitBridge = createPreviewGitBridge(ctx, setMockActiveWorkspace);
  const searchBridge = createPreviewSearchBridge(ctx);
  const eventsBridge = createPreviewEventsBridge();
  const modelBridge = createPreviewModelBridge(ctx, ensureCurrentWorkspaceRestored);
  const windowBridge = createPreviewWindowBridge();
  const diagnosticBridge = createPreviewDiagnosticBridge();
  const taskBridge = createPreviewTaskBridge();
  const conversationBridge = createPreviewConversationBridge();
  const patchBridge = createPreviewPatchBridge();
  const commandBridge = createPreviewCommandBridge();

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
      getInfo: modelBridge.app.getInfo,
      updatePreferences: modelBridge.app.updatePreferences,
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
    conversation: preferHttpWhenReachable<ConversationBridge>(
      adlServerBaseUrl,
      http.conversation,
      conversationBridge,
    ),
    agent: preferHttpWhenReachable<AgentBridge>(
      adlServerBaseUrl,
      http.agent,
      mockDigitalLifeBridge.agent,
    ),
    subagent: preferHttpWhenReachable<SubagentBridge>(
      adlServerBaseUrl,
      http.subagent,
      mockDigitalLifeBridge.subagent,
    ),
    patch: preferHttpWhenReachable<PatchBridge>(adlServerBaseUrl, http.patch, patchBridge),
    command: preferHttpWhenReachable<CommandBridge>(adlServerBaseUrl, http.command, commandBridge),
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
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: (tabId: string, url: string) => void) => () => {},
      onMetaChanged: (_listener: (tabId: string, meta: PageMeta) => void) => () => {},
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
    github: preferHttpWhenReachable<GitHubBridge>(adlServerBaseUrl, http.github, taskBridge.github),
    provider: preferHttpWhenReachable<ProviderBridge>(
      adlServerBaseUrl,
      http.provider,
      modelBridge.provider,
    ),
    mcp: preferHttpWhenReachable<McpBridge>(adlServerBaseUrl, http.mcp, mockDigitalLifeBridge.mcp),
    snapshot: preferHttpWhenReachable<SnapshotBridge>(
      adlServerBaseUrl,
      http.snapshot,
      mockDigitalLifeBridge.snapshot,
    ),
    webTools: preferHttpWhenReachable<WebToolsBridge>(
      adlServerBaseUrl,
      http.webTools,
      mockDigitalLifeBridge.webTools,
    ),
    commandsConfig: preferHttpWhenReachable<CommandsConfigBridge>(
      adlServerBaseUrl,
      http.commandsConfig,
      mockDigitalLifeBridge.commandsConfig,
    ),
    permission: preferHttpWhenReachable<PermissionBridge>(
      adlServerBaseUrl,
      http.permission,
      mockDigitalLifeBridge.permission,
    ),
    compaction: preferHttpWhenReachable<CompactionBridge>(
      adlServerBaseUrl,
      http.compaction,
      mockDigitalLifeBridge.compaction,
    ),
    sessionFork: preferHttpWhenReachable<SessionForkBridge>(
      adlServerBaseUrl,
      http.sessionFork,
      mockDigitalLifeBridge.sessionFork,
    ),
    lsp: preferHttpWhenReachable<LspBridge>(adlServerBaseUrl, http.lsp, mockDigitalLifeBridge.lsp),
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
    // `reserved` (ACP/HTTP-API/CodeMode) has NO ad-server HTTP routes — the
    // httpBridge implementations are all `NOT_SUPPORTED` stubs. The desktop
    // keeps `reserved: createTauriReservedBridge()` on Tauri invoke; the
    // browser keeps the preview/mock impl unconditionally (never wrapped in
    // preferHttpWhenReachable).
    reserved: mockDigitalLifeBridge.reserved,
    customAgent: preferHttpWhenReachable<CustomAgentBridge>(
      adlServerBaseUrl,
      http.customAgent,
      mockDigitalLifeBridge.customAgent,
    ),
    task: preferHttpWhenReachable<TaskBridge>(
      adlServerBaseUrl,
      http.task,
      mockDigitalLifeBridge.task,
    ),
    runActivity: preferHttpWhenReachable<RunActivityBridge>(
      adlServerBaseUrl,
      http.runActivity,
      mockDigitalLifeBridge.runActivity,
    ),
    subscribeModelStream: http.subscribeModelStream,
    subscribeRunActivity: http.subscribeRunActivity,
    subscribeTerminalStream: http.subscribeTerminalStream,
    setLogMode: mockDigitalLifeBridge.setLogMode,
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = withDemoMode(previewBridge);
}
