import type { DigitalLifeBridge, PtyOutputEvent } from './shared/ipc';
import { applyPreferencePatch } from './shared/preferencesMerger';
import type { CommandRequest, CommandRunResult } from '@ai-digital-life/kernel';
import { mockWorkspace } from './mock/mock-workspace';
import { mockRetrieval } from './mock/mock-retrieval';
import { mockConversation } from './mock/mock-conversation';
import { mockPatch } from './mock/mock-patch';
import { mockPty } from './mock/mock-terminal';
import { mockTask } from './mock/mock-task';
import {
  appInfo,
  activeRun,
  currentWorkspaceMeta,
  modelHealth,
  ptyOutputListeners,
  MAX_PTY_LISTENERS,
  setMockCurrentWorkspace,
  setOnMockStateChange,
  onMockStateChange,
  type MockBridgeState,
} from './mock/shared';

const MOCK_BRIDGE_STORAGE_KEY = 'ai-digital-life-mock-bridge-state';
let persistenceEnabled = false;

function loadPersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(MOCK_BRIDGE_STORAGE_KEY);
    if (stored) {
      const state: MockBridgeState = JSON.parse(stored);
      if (state.appInfo) Object.assign(appInfo, state.appInfo);
      if (state.currentWorkspaceMeta) {
        setMockCurrentWorkspace(state.currentWorkspaceMeta);
      }
    }
  } catch (e) {
    console.warn('Failed to load persisted mock bridge state', e);
  }
}

function savePersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') return;
  try {
    const state: MockBridgeState = {
      appInfo,
      currentWorkspaceMeta,
    };
    localStorage.setItem(MOCK_BRIDGE_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save persisted mock bridge state', e);
  }
}

export function enableMockBridgePersistence(): void {
  persistenceEnabled = true;
  setOnMockStateChange(savePersistedState);
  loadPersistedState();
}

export function disableMockBridgePersistence(): void {
  persistenceEnabled = false;
  setOnMockStateChange(undefined);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(MOCK_BRIDGE_STORAGE_KEY);
  }
}

export { setMockActiveWorkspace } from './mock/mock-workspace';

const subscribePtyOutput = (listener: (event: PtyOutputEvent) => void) => {
  if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
    console.warn('mock-bridge: PTY listener limit reached, dropping oldest listener');
    const oldest = ptyOutputListeners.values().next().value;
    if (oldest) ptyOutputListeners.delete(oldest);
  }
  ptyOutputListeners.add(listener);
  return () => void ptyOutputListeners.delete(listener);
};

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  subscribeModelStream: () => () => undefined,
  subscribeRunActivity: () => () => undefined,
  subscribeTerminalStream: () => () => undefined,
  subscribePtyOutput,

  window: {
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    setTitle: async (title: string) => {
      try {
        document.title = title;
      } catch {
        // ignore
      }
    },
  },

  app: {
    getInfo: async () => ({
      ok: true,
      data: { ...appInfo, currentWorkspace: currentWorkspaceMeta },
    }),
    getHealth: async () => ({
      ok: true,
      data: {
        timestamp: Date.now(),
        components: [
          { name: 'main', status: 'healthy', detail: 'Tauri backend ready', updatedAt: Date.now() },
          {
            name: 'worker',
            status: 'healthy',
            detail: 'Background runtime ready',
            updatedAt: Date.now(),
          },
          {
            name: 'storage',
            status: 'healthy',
            detail: 'SQLite state ready',
            updatedAt: Date.now(),
          },
          {
            name: 'recovery',
            status: 'healthy',
            detail: 'No recovery required',
            updatedAt: Date.now(),
          },
          {
            name: 'migration',
            status: 'healthy',
            detail: 'No migration pending',
            updatedAt: Date.now(),
          },
        ],
      },
    }),
    getDiagnostics: async () => ({
      ok: true,
      data: {
        lifecycle: {
          currentStartedAt: Date.now() - 60_000,
          lastShutdownWasClean: true,
          recoveredFromCrash: false,
        },
        migration: {
          change: 'none',
          toVersion: '0.1.0',
          executedScripts: [],
        },
        events: {
          emitted: 3,
          byType: {
            'app.initialized': 1,
            'workspace.opened': 1,
            'task.upserted': 1,
          },
        },
        recentErrors: [],
      },
    }),
    getModelHealth: async () => ({ ok: true, data: modelHealth }),
    updatePreferences: async (patch) => {
      const nextConfig = applyPreferencePatch(appInfo.config, patch);
      appInfo.config = nextConfig;
      onMockStateChange?.();
      return { ok: true, data: { ...appInfo, currentWorkspace: currentWorkspaceMeta } };
    },
  },

  workspace: mockWorkspace,

  retrieval: mockRetrieval,

  conversation: mockConversation,

  agent: {
    startRun: async ({ sessionId, prompt }) => {
      const result = await mockConversation.sendMessage({ sessionId, content: prompt });
      return result;
    },
    getRun: async () => ({ ok: true, data: activeRun }),
    retryRun: async () => ({ ok: true, data: activeRun }),
    abortRun: async () => ({ ok: true, data: activeRun }),
  },

  patch: mockPatch,

  command: {
    run: async (input) => ({
      ok: true,
      data: {
        status: input.command.includes('install') ? 'waiting-approval' : 'completed',
        taskId: `task-command-${Date.now()}`,
        request: {
          id: `command-${Date.now()}`,
          workspaceId: currentWorkspaceMeta?.id ?? 'global',
          profile: input.command.includes('install') ? 'install' : 'custom',
          command: input.command,
          args: input.args,
          shell: input.shell ?? false,
          riskLevel: input.command.includes('install') ? 'high' : 'medium',
          createdAt: Date.now(),
        },
      } satisfies CommandRunResult,
    }),
    listRecent: async (_limit?: number): Promise<{ ok: true; data: CommandRequest[] }> => ({
      ok: true,
      data: [],
    }),
  },

  pty: mockPty,

  task: mockTask,

  runActivity: {
    listByRunId: async (_runId: string, _limit?: number) => ({ ok: true, data: [] }),
  },

  browser: {
    navigate: async () => {},
    goBack: async () => true,
    goForward: async () => true,
    reload: async () => {},
    onUrlChanged: () => () => {},
  },
};

export function setupMockBridge(): void {
  if (typeof window !== 'undefined' && !window.digitalLife) {
    (window as { digitalLife?: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}
