import type { AudioStatePayload, PageMeta } from '../shared/ipc/browser';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { mockDigitalLifeBridge, setMockActiveWorkspace } from '../mock-bridge';
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

const warnedBridges = new Set<string>();

function warnMockBridge<T extends object>(bridgeName: string, bridge: T): T {
  return new Proxy(bridge, {
    get(target, prop, receiver) {
      const key = `${bridgeName}.${String(prop)}`;
      const targetRecord = target as Record<string, unknown>;
      if (!warnedBridges.has(key) && typeof targetRecord[prop as string] === 'function') {
        warnedBridges.add(key);
        console.warn(
          `[preview-bridge] "${key}" is using a mock implementation in preview mode. ` +
            `Behavior may differ from Tauri mode. Implement a real preview bridge for production fidelity.`
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function setupPreviewBridge(): void {
  if (typeof window === 'undefined' || (window as { digitalLife?: unknown }).digitalLife) {
    return;
  }

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
    setMockActiveWorkspace
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

  const previewBridge: DigitalLifeBridge = {
    ...mockDigitalLifeBridge,
    subscribePtyOutput: ptyBridge.subscribePtyOutput,
    pty: ptyBridge.pty,
    window: windowBridge.window,
    app: {
      ...diagnosticBridge,
      getInfo: modelBridge.app.getInfo,
      updatePreferences: modelBridge.app.updatePreferences,
    },
    workspace: {
      ...workspace,
      ...searchBridge,
      ...gitBridge,
      onFileChanged: eventsBridge.onFileChanged,
    },
    retrieval,
    conversation: conversationBridge,
    patch: patchBridge,
    command: commandBridge,
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
        _bounds: { x: number; y: number; width: number; height: number }
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
    },
    github: taskBridge.github,
    subscribeModelStream: modelBridge.subscribeModelStream,
    subscribeRunActivity: modelBridge.subscribeRunActivity,
    subscribeTerminalStream: modelBridge.subscribeTerminalStream,
    mcp: warnMockBridge('mcp', mockDigitalLifeBridge.mcp),
    provider: warnMockBridge('provider', mockDigitalLifeBridge.provider),
    commandsConfig: warnMockBridge('commandsConfig', mockDigitalLifeBridge.commandsConfig),
    permission: warnMockBridge('permission', mockDigitalLifeBridge.permission),
    // Phase 2 bridges (inherited from mock — add preview-specific overrides here if needed)
    snapshot: warnMockBridge('snapshot', mockDigitalLifeBridge.snapshot),
    webTools: warnMockBridge('webTools', mockDigitalLifeBridge.webTools),
    compaction: warnMockBridge('compaction', mockDigitalLifeBridge.compaction),
    sessionFork: warnMockBridge('sessionFork', mockDigitalLifeBridge.sessionFork),
    lsp: warnMockBridge('lsp', mockDigitalLifeBridge.lsp),
    reference: warnMockBridge('reference', mockDigitalLifeBridge.reference),
    durable: warnMockBridge('durable', mockDigitalLifeBridge.durable),
    reserved: warnMockBridge('reserved', mockDigitalLifeBridge.reserved),
    customAgent: warnMockBridge('customAgent', mockDigitalLifeBridge.customAgent),
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
