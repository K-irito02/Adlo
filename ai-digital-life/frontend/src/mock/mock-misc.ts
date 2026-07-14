import { IpcErrorCode } from "../shared/ipc";
import type {
  AgentConfig,
  CommandBridge,
  CommandConfig,
  CommandsConfigBridge,
  CompactionBridge,
  CustomAgentBridge,
  DurableBridge,
  LspBridge,
  PermissionBridge,
  PermissionDecision,
  PermissionRulesetConfig,
  ReferenceBridge,
  ReferenceConfig,
  ReservedBridge,
  RunActivityBridge,
  SessionForkBridge,
  WebToolsBridge,
} from "../shared/ipc";
import type { CommandRequest, CommandRunResult } from "@ai-digital-life/kernel";
import { currentWorkspaceMeta } from "./shared";

export const mockCommand: CommandBridge = {
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
};

export const mockRunActivity: RunActivityBridge = {
  listByRunId: async (_runId: string, _limit?: number) => ({ ok: true, data: [] }),
};

export const mockWebTools: WebToolsBridge = {
  webFetch: async (url, format) => ({
    ok: true,
    data: {
      url,
      status: 200,
      content_type: 'text/html',
      content: '<html><body>Mock fetch result</body></html>',
      truncated: false,
      format: format ?? 'markdown',
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
};

export const mockCommandsConfig: CommandsConfigBridge = {
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
};

export const mockPermission: PermissionBridge = {
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
};

export const mockCompaction: CompactionBridge = {
  compactSession: async (_input) => ({
    ok: true,
    data: {
      preservedMessages: [],
      prunedCount: 0,
      summary: null,
      summaryNeeded: false,
    },
  }),
};

export const mockSessionFork: SessionForkBridge = {
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
};

export const mockLsp: LspBridge = {
  startServer: async () => ({ ok: true, data: undefined }),
  stopServer: async () => ({ ok: true, data: undefined }),
  getSymbols: async () => ({ ok: true, data: [] }),
  getDiagnostics: async () => ({ ok: true, data: [] }),
  gotoDefinition: async () => ({ ok: true, data: null }),
};

export const mockReference: ReferenceBridge = {
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
};

export const mockDurable: DurableBridge = {
  registerDurableSession: async () => ({ ok: true, data: undefined }),
  heartbeatDurableSession: async () => ({ ok: true, data: undefined }),
  findCrashedSessions: async () => ({ ok: true, data: [] }),
  recoverSession: async () => ({ ok: true, data: false }),
};

export const mockReserved: ReservedBridge = {
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
};

export const mockCustomAgent: CustomAgentBridge = {
  listCustomAgents: async () => ({ ok: true, data: [] as AgentConfig[] }),
  addCustomAgent: async (_dataDir, agent) => ({
    ok: true,
    data: [agent] as AgentConfig[],
  }),
  deleteCustomAgent: async () => ({ ok: true, data: [] as AgentConfig[] }),
};
