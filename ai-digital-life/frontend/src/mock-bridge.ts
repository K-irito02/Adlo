import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import type { PtyOutputEvent } from './shared/ipc/pty';
import {
  appInfo,
  currentWorkspaceMeta,
  ptyOutputListeners,
  MAX_PTY_LISTENERS,
  setMockCurrentWorkspace,
  setOnMockStateChange,
  type MockBridgeState,
} from './mock/mock-shared';

// Domain imports — all split into per-domain files
import { mockWorkspace } from './mock/mock-workspace';
import { mockRetrieval } from './mock/mock-retrieval';
import { mockConversation } from './mock/mock-conversation';
import { mockPatch } from './mock/mock-patch';
import { mockPty } from './mock/mock-terminal';
import { mockTask } from './mock/mock-task';
import { mockWindow } from './mock/mock-window';
import { mockApp } from './mock/mock-app';
import { mockAgent, mockSubagent } from './mock/mock-agent';
import { mockBrowser } from './mock/mock-browser';
import { mockGithub } from './mock/mock-ci';
import { mockMcp } from './mock/mock-mcp';
import { mockProvider } from './mock/mock-provider';
import { mockSnapshot } from './mock/mock-snapshot';
import { mockCommand } from './mock/mock-command';
import { mockRunActivity } from './mock/mock-run-activity';
import { mockWebTools } from './mock/mock-web-tools';
import { mockCommandsConfig } from './mock/mock-commands-config';
import { mockPermission } from './mock/mock-permission';
import { mockCompaction } from './mock/mock-compaction';
import { mockSessionFork } from './mock/mock-session-fork';
import { mockLsp } from './mock/mock-lsp';
import { mockReference } from './mock/mock-reference';
import { mockDurable } from './mock/mock-durable';
import { mockReserved } from './mock/mock-reserved';
import { mockCustomAgent } from './mock/mock-custom-agent';

const MOCK_BRIDGE_STORAGE_KEY = 'ai-digital-life-mock-bridge-state';
let persistenceEnabled = false;

function loadPersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') {
    return;
  }
  try {
    const stored = localStorage.getItem(MOCK_BRIDGE_STORAGE_KEY);
    if (stored) {
      const state: MockBridgeState = JSON.parse(stored);
      if (state.appInfo) {
        Object.assign(appInfo, state.appInfo);
      }
      if (state.currentWorkspaceMeta) {
        setMockCurrentWorkspace(state.currentWorkspaceMeta);
      }
    }
  } catch (e) {
    console.warn('[mock-bridge] Failed to load persisted state', e);
  }
}

function savePersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') {
    return;
  }
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
    if (oldest) {
      ptyOutputListeners.delete(oldest);
    }
  }
  ptyOutputListeners.add(listener);
  return () => void ptyOutputListeners.delete(listener);
};

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  subscribeModelStream: () => () => undefined,
  subscribeRunActivity: () => () => undefined,
  subscribeTerminalStream: () => () => undefined,
  subscribePtyOutput,

  setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
    localStorage.setItem(`adl_log_mode_${target}`, mode);
  },

  window: mockWindow,
  app: mockApp,
  workspace: mockWorkspace,
  retrieval: mockRetrieval,
  conversation: mockConversation,
  agent: mockAgent,
  subagent: mockSubagent,
  patch: mockPatch,
  command: mockCommand,
  pty: mockPty,
  task: mockTask,
  runActivity: mockRunActivity,
  browser: mockBrowser,
  github: mockGithub,
  mcp: mockMcp,
  provider: mockProvider,
  snapshot: mockSnapshot,
  webTools: mockWebTools,
  commandsConfig: mockCommandsConfig,
  permission: mockPermission,
  compaction: mockCompaction,
  sessionFork: mockSessionFork,
  lsp: mockLsp,
  reference: mockReference,
  durable: mockDurable,
  reserved: mockReserved,
  customAgent: mockCustomAgent,
};

export function setupMockBridge(): void {
  if (typeof window !== 'undefined' && !window.digitalLife) {
    (window as { digitalLife?: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}
