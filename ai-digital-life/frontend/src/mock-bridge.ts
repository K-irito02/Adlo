import { IpcErrorCode } from './shared/ipc';
import type {
  AgentConfig,
  AudioStatePayload,
  CustomAgentBridge,
  DigitalLifeBridge,
  DurableBridge,
  PageMeta,
  PtyOutputEvent,
  ReservedBridge,
} from './shared/ipc';
import type {
  CompactionBridge,
  LspBridge,
  McpBridge,
  SessionForkBridge,
  McpServerConfig,
  PluginBridge,
  ProviderBridge,
  SnapshotBridge,
  CommandsConfigBridge,
  CommandConfig,
  PermissionBridge,
  PermissionRulesetConfig,
  PermissionDecision,
  ReferenceBridge,
  ReferenceConfig,
  WebToolsBridge,
} from './shared/ipc';
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
  } catch {
    // silently ignore failed persisted state load
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
    onResized: (_listener: () => void) => {
      // browser mode has no window resize events to subscribe to
      return () => {};
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
    getRun: async (_runId: string) => ({ ok: true, data: activeRun }),
    retryRun: async (_runId: string) => ({ ok: true, data: activeRun }),
    abortRun: async (_runId: string) => ({ ok: true, data: activeRun }),
    listAgents: async () => ({ ok: true, data: [] }),
    selectAgent: async (_scenario: string, _userPrompt: string) => ({
      ok: true,
      data: {
        id: 'general',
        name: 'General Agent',
        description: 'Mock general agent for preview mode',
        mode: 'primary',
        hidden: false,
        allows_write_tools: true,
        prompt_template: '',
        model_override: null,
      },
    }),
    enterPlanMode: async (_workspaceId: string, _workspaceRoot: string) => ({
      ok: true,
      data: '/mock/path/plan.md',
    }),
    exitPlanMode: async (_workspaceId: string) => ({ ok: true, data: null }),
    getPlanModeState: async (_workspaceId: string) => ({ ok: true, data: false }),
  },

  subagent: {
    spawnSubagent: async (_parentSessionId, input) => ({
      ok: true,
      data: {
        task_id: input.task_id ?? `mock-task-${Date.now()}`,
        state: 'running',
        summary: `Mock subagent spawned for: ${input.description}`,
        result: null,
        error: null,
      },
    }),
    getSubagentTask: async (_taskId: string) => ({ ok: true, data: null }),
    listActiveSubagents: async (_workspaceId: string) => ({ ok: true, data: [] }),
    cancelSubagent: async (_taskId: string) => ({ ok: true, data: true }),
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
    createForTab: (_tabId: string, _url: string) => Promise.resolve(null),
    activateTab: (_tabId: string) => Promise.resolve(),
    destroyTab: (_tabId: string) => Promise.resolve(),
    navigateTab: (_tabId: string, _url: string) => Promise.resolve(),
    setTabBounds: (
      _tabId: string,
      _bounds: { x: number; y: number; width: number; height: number }
    ) => Promise.resolve(),
    goBackTab: (_tabId: string) => Promise.resolve(false),
    goForwardTab: (_tabId: string) => Promise.resolve(false),
    reloadTab: (_tabId: string) => Promise.resolve(),
    onUrlChanged: (_listener: (url: string) => void) => () => {},
    onMetaChanged: (_listener: (meta: PageMeta) => void) => () => {},
    muteTab: (_tabId: string, _muted: boolean) => Promise.resolve(),
    onAudioStateChanged: (_listener: (payload: AudioStatePayload) => void) => () => {},
    setBrowserColorScheme: (_resolvedTheme: 'light' | 'dark') => Promise.resolve(),
    setZoom: (_tabId: string, _zoomFactor: number) => Promise.resolve(),
    clearCookies: (_tabId: string) => Promise.resolve(),
    clearCache: (_tabId: string) => Promise.resolve(),
  },

  ci: {
    getStatus: async (config) => ({
      ok: true,
      data: {
        repo: `${config.owner}/${config.repo}`,
        branch: config.branch,
        latestRun: null,
        jobs: [],
        logs: null,
        capturedAtMs: Date.now(),
        error: null,
      },
    }),
    getStatusWithoutToken: async (owner, repo, branch) => ({
      ok: true,
      data: {
        repo: `${owner}/${repo}`,
        branch,
        latestRun: null,
        jobs: [],
        logs: null,
        capturedAtMs: Date.now(),
        error: null,
      },
    }),
    setAccessToken: async (token: string) => {
      if (typeof window !== 'undefined') {
        try {
          if (token.length > 0) {
            window.localStorage.setItem('adl-ui:ci-access-token', token);
          } else {
            window.localStorage.removeItem('adl-ui:ci-access-token');
          }
        } catch {
          /* ignore */
        }
      }
      return { ok: true, data: true };
    },
    clearAccessToken: async () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('adl-ui:ci-access-token');
        } catch {
          /* ignore */
        }
      }
      return { ok: true, data: true };
    },
    hasAccessToken: async () => {
      if (typeof window !== 'undefined') {
        try {
          return {
            ok: true,
            data: !!window.localStorage.getItem('adl-ui:ci-access-token')?.length,
          };
        } catch {
          return { ok: true, data: false };
        }
      }
      return { ok: true, data: false };
    },
    getJobLogs: async (_config, _runId) => ({
      ok: true,
      data: {
        1: '[2024-01-01T00:00:00Z] Mock log line 1\n[2024-01-01T00:00:01Z] Mock log line 2\n',
      },
    }),
  },

  github: {
    getStatus: async (config) => ({
      ok: true,
      data: {
        repo: `${config.owner}/${config.repo}`,
        branch: config.branch,
        latestRun: null,
        jobs: [],
        logs: null,
        capturedAtMs: Date.now(),
        error: null,
      },
    }),
    getStatusWithoutToken: async (owner, repo, branch) => ({
      ok: true,
      data: {
        repo: `${owner}/${repo}`,
        branch,
        latestRun: null,
        jobs: [],
        logs: null,
        capturedAtMs: Date.now(),
        error: null,
      },
    }),
    setAccessToken: async (token: string) => {
      if (typeof window !== 'undefined') {
        try {
          if (token.length > 0) {
            window.localStorage.setItem('adl-ui:ci-access-token', token);
          } else {
            window.localStorage.removeItem('adl-ui:ci-access-token');
          }
        } catch {
          /* ignore */
        }
      }
      return { ok: true, data: true };
    },
    clearAccessToken: async () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('adl-ui:ci-access-token');
        } catch {
          /* ignore */
        }
      }
      return { ok: true, data: true };
    },
    hasAccessToken: async () => {
      if (typeof window !== 'undefined') {
        try {
          return {
            ok: true,
            data: !!window.localStorage.getItem('adl-ui:ci-access-token')?.length,
          };
        } catch {
          return { ok: true, data: false };
        }
      }
      return { ok: true, data: false };
    },
    getJobLogs: async (_config, _runId) => ({
      ok: true,
      data: {
        1: '[2024-01-01T00:00:00Z] Mock log line 1\n[2024-01-01T00:00:01Z] Mock log line 2\n',
      },
    }),
  },

  mcp: {
    listMcpServers: async () => ({ ok: true, data: [] }),
    addMcpServer: async (_config: McpServerConfig) => ({ ok: true, data: undefined }),
    removeMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
    connectMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
    disconnectMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
    getMcpCatalog: async () => ({ ok: true, data: { tools: [], resources: [] } }),
    loadMcpConfig: async (_path: string) => ({ ok: true, data: 0 }),
  } satisfies McpBridge,

  provider: {
    setProviderApiKey: async (_provider: string, _apiKey: string) => ({ ok: true, data: true }),
    clearProviderApiKey: async (_provider: string) => ({ ok: true, data: true }),
    hasProviderApiKey: async (_provider: string) => ({ ok: true, data: false }),
    listSupportedProviders: async () => ({
      ok: true,
      data: [
        { id: 'deepseek', name: 'DeepSeek', requiresKey: true },
        { id: 'minimax', name: 'MiniMax', requiresKey: true },
        { id: 'openai', name: 'OpenAI', requiresKey: true },
        { id: 'anthropic', name: 'Anthropic', requiresKey: true },
        { id: 'google', name: 'Google Gemini', requiresKey: true },
        { id: 'ollama', name: 'Ollama (Local)', requiresKey: false },
        { id: 'openrouter', name: 'OpenRouter', requiresKey: true },
      ],
    }),
  } satisfies ProviderBridge,

  snapshot: {
    createSnapshot: async (_params) => ({
      ok: true,
      data: {
        id: `snap-${Date.now()}`,
        message_id: _params.messageId,
        session_id: _params.sessionId,
        workspace_id: _params.workspaceId,
        created_at: Date.now(),
        git_commit: 'mock-commit-hash',
        file_count: 3,
        total_bytes: 1024,
      },
    }),
    listSnapshots: async (_workspaceId, _workspaceRoot) => ({
      ok: true,
      data: [
        {
          id: 'snap-mock-1',
          message_id: 'msg-mock-1',
          session_id: 'session-mock-1',
          workspace_id: _workspaceId,
          created_at: Date.now() - 3600_000,
          git_commit: 'abc1234',
          file_count: 2,
          total_bytes: 512,
        },
      ],
    }),
    revertToSnapshot: async (_workspaceId, _workspaceRoot, snapshotId) => ({
      ok: true,
      data: {
        success: true,
        snapshot_id: snapshotId,
        message_id: 'msg-mock-1',
        files_restored: 2,
        error: null,
      },
    }),
    pruneSnapshots: async (_workspaceId, _workspaceRoot) => ({
      ok: true,
      data: 1,
    }),
  } satisfies SnapshotBridge,

  webTools: {
    webFetch: async (url) => ({
      ok: true,
      data: {
        url,
        status: 200,
        content_type: 'text/html',
        content: '<html><body>Mock fetch result</body></html>',
        truncated: false,
        error: null,
      },
    }),
    webSearch: async (query) => ({
      ok: true,
      data: {
        query,
        results: [
          {
            title: 'Mock Result 1',
            url: 'https://example.com/1',
            snippet: 'First mock result',
            score: 0.95,
          },
          {
            title: 'Mock Result 2',
            url: 'https://example.com/2',
            snippet: 'Second mock result',
            score: 0.85,
          },
        ],
        error: null,
      },
    }),
  } satisfies WebToolsBridge,

  commandsConfig: {
    listCustomCommands: async () => ({ ok: true, data: [] as CommandConfig[] }),
    addCustomCommand: async (_dataDir, command) => ({
      ok: true,
      data: [command] as CommandConfig[],
    }),
    updateCustomCommand: async (_dataDir, _name, command) => ({
      ok: true,
      data: [command] as CommandConfig[],
    }),
    deleteCustomCommand: async () => ({ ok: true, data: [] as CommandConfig[] }),
    renderCommandTemplate: async (template, args, workspace) => ({
      ok: true,
      data: template.replace('$ARGUMENTS', args.join(' ')).replace('$WORKSPACE', workspace),
    }),
  } satisfies CommandsConfigBridge,

  permission: {
    listPermissionRules: async () => ({
      ok: true,
      data: { custom_rules: [], include_defaults: true } satisfies PermissionRulesetConfig,
    }),
    addPermissionRule: async (_dataDir, rule) => ({
      ok: true,
      data: { custom_rules: [rule], include_defaults: true } satisfies PermissionRulesetConfig,
    }),
    deletePermissionRule: async () => ({
      ok: true,
      data: { custom_rules: [], include_defaults: true } satisfies PermissionRulesetConfig,
    }),
    setPermissionIncludeDefaults: async (_dataDir, include) => ({
      ok: true,
      data: { custom_rules: [], include_defaults: include } satisfies PermissionRulesetConfig,
    }),
    evaluatePermission: async () => ({ ok: true, data: 'allow' as PermissionDecision }),
  } satisfies PermissionBridge,

  compaction: {
    compactSession: async (_input) => ({
      ok: true,
      data: {
        preservedMessages: [],
        prunedCount: 0,
        summary: null,
        summaryNeeded: false,
      },
    }),
  } satisfies CompactionBridge,

  sessionFork: {
    forkSession: async (parentSession, _forkMessageId) => ({
      ok: true,
      data: {
        ...parentSession,
        id: `${parentSession.id}-fork-${Date.now()}`,
        title: `${parentSession.title} (fork)`,
        parent_id: parentSession.id,
      },
    }),
    listSessionForks: async () => ({
      ok: true,
      data: [],
    }),
  } satisfies SessionForkBridge,

  lsp: {
    startServer: async () => ({ ok: true, data: undefined }),
    stopServer: async () => ({ ok: true, data: undefined }),
    getSymbols: async () => ({ ok: true, data: [] }),
    getDiagnostics: async () => ({ ok: true, data: [] }),
    gotoDefinition: async () => ({ ok: true, data: null }),
  } satisfies LspBridge,

  plugin: {
    listPlugins: async () => ({
      ok: true,
      data: [
        {
          name: 'demo-plugin',
          description: 'A demo plugin for preview',
          hooks: ['ToolExecuteBefore'],
          enabled: true,
        },
      ],
    }),
    setPluginEnabled: async (_name: string, _enabled: boolean) => ({
      ok: true,
      data: undefined,
    }),
    registerPlugin: async () => ({ ok: true, data: undefined }),
    unregisterPlugin: async () => ({ ok: true, data: undefined }),
  } satisfies PluginBridge,

  reference: {
    listReferences: async (_dataDir) => ({
      ok: true,
      data: [
        {
          name: 'opencode',
          source: 'local' as const,
          path: '/references/opencode',
          branch: null,
          enabled: true,
        },
      ] satisfies ReferenceConfig[],
    }),
    addReference: async (_dataDir, reference) => ({
      ok: true,
      data: [reference] satisfies ReferenceConfig[],
    }),
    removeReference: async () => ({
      ok: true,
      data: [] satisfies ReferenceConfig[],
    }),
    getReferencesPrompt: async () => ({
      ok: true,
      data: 'Mock reference prompt with 1 reference loaded.',
    }),
  } satisfies ReferenceBridge,

  durable: {
    registerDurableSession: async () => ({ ok: true, data: undefined }),
    heartbeatDurableSession: async () => ({ ok: true, data: undefined }),
    findCrashedSessions: async () => ({ ok: true, data: [] }),
    recoverSession: async () => ({ ok: true, data: false }),
  } satisfies DurableBridge,

  reserved: {
    acpGetStatus: async () => ({
      ok: false,
      error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'ACP not implemented' },
    }),
    acpGetConfig: async () => ({ ok: true, data: { enabled: false, port: null } }),
    httpApiGetStatus: async () => ({
      ok: false,
      error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'HTTP API not implemented' },
    }),
    httpApiGetConfig: async () => ({
      ok: true,
      data: { enabled: false, port: null, cors_origins: [] },
    }),
    codemodeExecute: async () => ({
      ok: false,
      error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'CodeMode not implemented' },
    }),
    codemodeGetConfig: async () => ({
      ok: true,
      data: { enabled: false, max_concurrency: 8, timeout_ms: 30000, max_output_bytes: 1048576 },
    }),
  } satisfies ReservedBridge,

  customAgent: {
    listCustomAgents: async () => ({ ok: true, data: [] as AgentConfig[] }),
    addCustomAgent: async (_dataDir, agent) => ({
      ok: true,
      data: [agent] as AgentConfig[],
    }),
    deleteCustomAgent: async () => ({ ok: true, data: [] as AgentConfig[] }),
  } satisfies CustomAgentBridge,
};

export function setupMockBridge(): void {
  if (typeof window !== 'undefined' && !window.digitalLife) {
    (window as { digitalLife?: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}
