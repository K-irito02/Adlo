import type { DigitalLifeBridge } from '../shared/ipc';
import { mockDigitalLifeBridge, setMockActiveWorkspace } from '../mock-bridge';
import { createPtyBridge } from './ptyBridge';
import { loadRecentWorkspaces } from './storage';
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
      createForTab: (_tabId: string, _url: string) => Promise.resolve(null),
      activateTab: (_tabId: string) => Promise.resolve(),
      destroyTab: (_tabId: string) => Promise.resolve(),
      navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
      setTabBounds: (_tabId: string, _bounds: any) => Promise.resolve(),
      goBackTab: (_tabId: string) => Promise.resolve(false),
      goForwardTab: (_tabId: string) => Promise.resolve(false),
      reloadTab: (_tabId: string) => Promise.resolve(),
      onUrlChanged: (_listener: any) => () => {},
      onMetaChanged: (_listener: any) => () => {},
    },
    ci: taskBridge.ci,
    github: taskBridge.github,
    subscribeModelStream: modelBridge.subscribeModelStream,
    subscribeRunActivity: modelBridge.subscribeRunActivity,
    subscribeTerminalStream: modelBridge.subscribeTerminalStream,
  };

  (window as { digitalLife: DigitalLifeBridge }).digitalLife = previewBridge;
}
