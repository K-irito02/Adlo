/**
 * 完整的 StoreState 类型定义 — 领域分组总览
 *
 * ## 领域分组
 *
 * ### 状态切片（12 个，定义在 slices/）
 * | 切片              | 关键字段                     | 文件                    |
 * |-------------------|-----------------------------|------------------------|
 * | UISlice           | leftSidebarVisible, chatMode | slices/uiSlice.ts      |
 * | WorkspaceSlice    | appInfo, workspaceTree       | slices/workspaceSlice.ts|
 * | GitSlice          | gitSnapshot, gitBranches     | slices/gitSlice.ts     |
 * | SessionSlice      | sessions, activeSessionId    | slices/sessionSlice.ts |
 * | EditorSlice       | openTabs, selectedFilePath   | slices/editorSlice.ts  |
 * | PatchSlice        | activePatchSet               | slices/patchSlice.ts   |
 * | SearchSlice       | searchQuery, searchResults   | slices/searchSlice.ts  |
 * | DiagnosticSlice   | indexingStatus, repoMap      | slices/diagnosticSlice.ts|
 * | TaskSlice         | taskCenter                   | slices/taskSlice.ts    |
 * | CommandSlice      | latestCommandRun             | slices/commandSlice.ts |
 * | ClipboardSlice    | clipboardItems               | slices/clipboardSlice.ts|
 * | TerminalSlice     | terminalSessions             | slices/terminalSlice.ts|
 *
 * ### Action 接口（10 个，定义在 actions/）
 * | 接口               | 核心方法                      | 文件                       |
 * |--------------------|------------------------------|----------------------------|
 * | WorkspaceActions   | openWorkspace, refreshTree   | actions/workspaceActions.ts |
 * | SessionActions     | sendMessage, createSession   | actions/sessionActions.ts   |
 * | EditorActions      | openFile, openChangePreview  | actions/editorActions.ts    |
 * | GitActions         | loadGitSnapshot, switchBranch| actions/gitActions.ts       |
 * | PatchActions       | applyPatchSet, setHunkDecision| actions/patchActions.ts    |
 * | SearchActions      | searchFiles                  | actions/searchActions.ts    |
 * | TaskActions        | refreshTaskCenter            | (内联在 StoreState.ts)      |
 * | CommandActions     | runCommand                   | (内联在 StoreState.ts)      |
 * | DataFetchActions   | bootstrap, updatePreferences | actions/generalActions.ts   |
 * | ProviderActions    | fetchProviders, setApiKey    | actions/providerActions.ts  |
 *
 * ### 根级字段
 * - `loading: boolean` — 应用启动状态
 * - `errorToasts: ErrorToastEntry[]` — 右下角持久错误提示队列（不自动消失）
 */

import type { UISlice } from './slices/uiSlice';
import type { WorkspaceSlice } from './slices/workspaceSlice';
import type { GitSlice } from './slices/gitSlice';
import type { GitVisSlice } from './slices/gitVisSlice';
import type { SessionSlice } from './slices/sessionSlice';
import type { EditorSlice } from './slices/editorSlice';
import type { PatchSlice } from './slices/patchSlice';
import type { SearchSlice } from './slices/searchSlice';
import type { DiagnosticSlice } from './slices/diagnosticSlice';
import type { TaskSlice } from './slices/taskSlice';
import type { CommandSlice } from './slices/commandSlice';
import type { ClipboardSlice } from './slices/clipboardSlice';
import type { TerminalSlice } from './slices/terminalSlice';
import type { BrowserTabsSlice } from './slices/browserTabsSlice';
import type { BrowserBookmarkSlice } from './slices/browserBookmarkSlice';
import type { BrowserHistorySlice } from './slices/browserHistorySlice';
import type { BrowserFoldersSlice } from './slices/browserFoldersSlice';
import type { BrowserLandingSlice } from './slices/browserLandingSlice';
import type { BrowserSearchEnginesSlice } from './slices/browserSearchEnginesSlice';
import type { BrowserSlice } from './slices/browserSlice';
import type { CiSlice } from './slices/ciSlice';
import type { CommunicateSlice } from './slices/communicateSlice';
import type { GitHubRepoSlice } from './slices/githubRepoSlice';
import type { GitHubTreeSlice } from './slices/githubTreeSlice';
import type { GitHubSlice as GitHubSliceType } from './slices/githubSlice';
import type { AgentSlice } from './slices/agentSlice';
import type { CustomCommandSlice } from './slices/customCommandSlice';
import type { PermissionSlice } from './slices/permissionSlice';
import type { McpSlice } from './slices/mcpSlice';
import type { ProviderSlice } from './slices/providerSlice';
import type { CompactionSlice } from './slices/compactionSlice';
import type { WebToolsSlice } from './slices/webToolsSlice';
import type { ReferenceSlice } from './slices/referenceSlice';
import type { DurableSlice } from './slices/durableSlice';
import type { ToastSlice } from './slices/toastSlice';
import type { ErrorToastSlice } from './slices/errorToastSlice';
import type { NotificationSlice } from './slices/notificationSlice';
import type { FileOpNoticeSlice } from './slices/fileOpNoticeSlice';
import type { PartStreamSlice } from './slices/partStreamSlice';
import type { BrowserDownloadsSlice } from './slices/browserDownloadsSlice';
import type { ReferenceConfig } from '@shared/ipc/reference';
import type { PermissionRule } from '@shared/ipc/permission';
import type { SnapshotRecord, RevertResult } from '@shared/ipc/snapshot';
import type { DiagnosticInfo, SymbolInfo } from '@shared/ipc/lsp';
import type {
  McpServerConfig,
  CommandConfig,
  CompactSessionInput,
  CompactSessionResult,
} from '@shared/ipc';
import type { AgentConfig } from '@shared/ipc';
import type {
  AppPreferencePatch,
  ConversationSessionRecord,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { MessageSendOptions } from '../utils/composerSend';
import type { WorkspaceID, SessionID, AgentRunID } from '../../shared/branded';

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

interface StoreStateRootFields {
  loading: boolean;
  appReady: boolean;
  isFetching: Record<string, boolean>;
  isTauri: boolean;
  customAgents: AgentConfig[];
  isFetchingCustomAgents: boolean;
  lspActiveServers: string[];
  lspDiagnostics: DiagnosticInfo[];
  bootstrap: () => Promise<void>;
}

type AllSlices = [
  UISlice,
  WorkspaceSlice,
  GitSlice,
  GitVisSlice,
  SessionSlice,
  EditorSlice,
  PatchSlice,
  SearchSlice,
  DiagnosticSlice,
  TaskSlice,
  CommandSlice,
  ClipboardSlice,
  TerminalSlice,
  BrowserTabsSlice,
  BrowserBookmarkSlice,
  BrowserHistorySlice,
  BrowserFoldersSlice,
  BrowserLandingSlice,
  BrowserSearchEnginesSlice,
  BrowserSlice,
  CiSlice,
  CommunicateSlice,
  GitHubRepoSlice,
  GitHubTreeSlice,
  GitHubSliceType,
  AgentSlice,
  CustomCommandSlice,
  PermissionSlice,
  CompactionSlice,
  WebToolsSlice,
  McpSlice,
  ProviderSlice,
  ReferenceSlice,
  DurableSlice,
  ToastSlice,
  ErrorToastSlice,
  NotificationSlice,
  FileOpNoticeSlice,
  PartStreamSlice,
  BrowserDownloadsSlice,
];

interface WorkspaceActions {
  openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  clearWorkspaceContext: () => Promise<void>;
  pickWorkspaceDirectory: () => Promise<string | undefined>;
  pinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  unpinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  removeWorkspaceFromSidebar: (workspaceId: WorkspaceID) => Promise<void>;
  reorderWorkspaces: (input: ReorderWorkspacesInput) => Promise<void>;
  revealWorkspaceInFileManager: (workspacePath: string) => Promise<void>;
  createWorkspaceFile: (
    relativePath: string,
    content?: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  createWorkspaceFolder: (
    relativePath: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  refreshWorkspaceTree: () => Promise<void>;
  loadWorkspaceTree: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshOneWorkspaceTree: (
    workspaceId: WorkspaceID,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  toggleWorkspaceTreeInFileNav: (workspaceId: WorkspaceID) => void;
  expandWorkspaceTreeInFileNav: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshAllWorkspaceTrees: () => Promise<void>;
  cleanupRemovedWorkspaceTree: (workspaceId: WorkspaceID) => void;
  hideWorkspaceFromRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  showWorkspaceInRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  expandAllWorkspaceTreesInFileNav: () => Promise<void>;
  collapseAllWorkspaceTreesInFileNav: () => void;
  renameWorkspaceFile: (
    relativePath: string,
    newName: string,
    workspacePath?: string,
  ) => Promise<void>;
  moveWorkspaceFile: (
    relativePath: string,
    newPath: string,
    workspacePath?: string,
  ) => Promise<void>;
  deleteWorkspaceFile: (relativePath: string, workspacePath?: string) => Promise<void>;
  duplicateWorkspaceFile: (
    srcRelativePath: string,
    dstRelativePath: string,
    workspacePath?: string,
  ) => Promise<void>;
}

interface SessionActions {
  createSession: (workspaceId?: WorkspaceID) => Promise<void>;
  selectSession: (sessionId: SessionID) => Promise<void>;
  switchToWorkspace: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  renameSession: (sessionId: SessionID, title: string) => Promise<void>;
  pinSession: (sessionId: SessionID) => Promise<void>;
  unpinSession: (sessionId: SessionID) => Promise<void>;
  markSessionRead: (sessionId: SessionID) => Promise<void>;
  markSessionUnread: (sessionId: SessionID) => Promise<void>;
  archiveSession: (sessionId: SessionID) => Promise<void>;
  archiveAllSessions: () => Promise<void>;
  reorderSessions: (input: ReorderSessionsInput) => Promise<void>;
  markAllSessionsRead: (sessionIds: SessionID[]) => Promise<void>;
  deleteSession: (sessionId: SessionID) => Promise<void>;
  sendMessage: (content: string, options?: MessageSendOptions) => Promise<void>;
  cancelActiveStream: () => Promise<void>;
}

interface EditorActions {
  openFile: (relativePath: string) => Promise<void>;
  openFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => Promise<void>;
  openChangePreview: (relativePath: string) => Promise<void>;
  openChangePreviewForWorkspace: (workspacePath: string, relativePath: string) => Promise<void>;
  markExternalFileChange: (input: { path: string; lastModifiedAt: number }) => void;
  notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => void;
}

interface GitActions {
  loadGitSnapshot: (workspaceId: string, workspacePath: string) => Promise<void>;
  refreshGitSnapshot: (
    workspaceId: string,
    workspacePath: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  expandWorkspaceChangesInFileNav: (workspaceId: string, workspacePath: string) => Promise<void>;
  collapseAllWorkspaceChanges: () => void;
  expandAllWorkspaceChanges: () => Promise<void>;
  fetchGitStatus: () => Promise<void>;
  fetchGitBranches: () => Promise<void>;
  switchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  createGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
  stageWorkspaceFile: (relativePath: string, workspacePath?: string) => Promise<void>;
  unstageWorkspaceFile: (relativePath: string, workspacePath?: string) => Promise<void>;
  discardWorkspaceFile: (relativePath: string, workspacePath?: string) => Promise<void>;
}

interface PatchActions {
  setHunkDecision: (
    patchSetId: string,
    hunkId: string,
    decision: 'pending' | 'accepted' | 'rejected',
  ) => Promise<void>;
  applyPatchSet: (patchSetId: string) => Promise<void>;
  rollbackPatchSet: (patchSetId: string) => Promise<void>;
  acceptAllHunks: () => Promise<void>;
  rejectAllHunks: () => Promise<void>;
  restoreCheckpoint: (checkpointId: string) => Promise<void>;
}

interface SearchActions {
  searchFiles: (query: string) => Promise<void>;
}

interface TaskActions {
  refreshTaskCenter: () => Promise<void>;
  decideApproval: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  fetchRunActivityByRunId: (runId: AgentRunID, limit?: number) => Promise<void>;
}

interface CommandActions {
  runCommand: (command: string, argsText: string) => Promise<void>;
  fetchCommandHistory: () => Promise<void>;
}

interface CustomCommandActions {
  fetchCustomCommands: (dataDir: string) => Promise<void>;
  addCustomCommand: (dataDir: string, command: CommandConfig) => Promise<void>;
  updateCustomCommand: (dataDir: string, name: string, command: CommandConfig) => Promise<void>;
  deleteCustomCommand: (dataDir: string, name: string) => Promise<void>;
}

interface PermissionActions {
  fetchPermissionRules: (dataDir: string) => Promise<void>;
  addPermissionRule: (dataDir: string, rule: PermissionRule) => Promise<void>;
  deletePermissionRule: (dataDir: string, index: number) => Promise<void>;
  setPermissionIncludeDefaults: (dataDir: string, include: boolean) => Promise<void>;
}

interface CompactionActions {
  compactSession: (input: CompactSessionInput) => Promise<CompactSessionResult | null>;
}

interface SessionForkActions {
  forkSession: (
    parentSession: ConversationSessionRecord,
    forkMessageId: string,
  ) => Promise<ConversationSessionRecord | null>;
  listSessionForks: (
    workspaceId: string,
    parentSessionId: string,
  ) => Promise<ConversationSessionRecord[]>;
}

interface DataFetchActions {
  refreshModelHealth: () => Promise<void>;
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  fetchIndexStatus: () => Promise<void>;
  fetchRepoMap: () => Promise<void>;
  fetchAuditEntries: (limit?: number) => Promise<void>;
}

interface AgentActions {
  fetchAgents: () => Promise<void>;
  selectAgentForScenario: (scenario: string, userPrompt: string) => Promise<void>;
  enterPlanMode: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  exitPlanMode: (workspaceId: string) => Promise<void>;
  refreshPlanModeState: (workspaceId: string) => Promise<void>;
}

interface McpActions {
  fetchMcpServers: () => Promise<void>;
  fetchMcpCatalog: () => Promise<void>;
  addMcpServer: (config: McpServerConfig) => Promise<void>;
  removeMcpServer: (name: string) => Promise<void>;
  connectMcpServer: (name: string) => Promise<void>;
  disconnectMcpServer: (name: string) => Promise<void>;
  loadMcpConfig: (path: string) => Promise<void>;
}

interface ProviderActions {
  fetchProviders: () => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<boolean>;
  clearApiKey: (provider: string) => Promise<boolean>;
  testConnection: (providerId: string, apiKey?: string) => Promise<void>;
  addCustomProvider: (
    name: string,
    baseUrl: string,
    apiKey: string,
    models: string[],
  ) => Promise<void>;
  removeCustomProvider: (providerId: string) => Promise<void>;
  selectModel: (providerId: string, modelId: string) => void;
  fetchModels: (providerId: string, apiKey?: string) => Promise<number>;
  toggleModel: (providerId: string, modelId: string, enabled: boolean) => Promise<void>;
  setAllModelsEnabled: (providerId: string, enableAll: boolean) => Promise<void>;
  setProviderEnabled: (providerId: string, enabled: boolean) => Promise<void>;
}

interface WebToolsActions {
  webFetch: (url: string) => Promise<void>;
  webSearch: (query: string) => Promise<void>;
  clearWebResults: () => void;
}

interface LspActions {
  lspStartServer: (workspaceId: string, workspaceRoot: string, server: string) => Promise<void>;
  lspStopServer: (workspaceId: string, server: string) => Promise<void>;
  lspGetSymbols: (workspaceId: string, filePath: string) => Promise<SymbolInfo[]>;
  lspGetDiagnostics: (workspaceId: string, filePath?: string) => Promise<DiagnosticInfo[]>;
}

interface CustomAgentActions {
  fetchCustomAgents: (dataDir: string) => Promise<void>;
  addCustomAgent: (dataDir: string, agent: AgentConfig) => Promise<void>;
  deleteCustomAgent: (dataDir: string, name: string) => Promise<void>;
}

interface DurableActions {
  registerDurableSession: (sessionId: string, runId: string) => Promise<void>;
  durableHeartbeat: (sessionId: string) => Promise<void>;
}

interface ReferenceActions {
  fetchReferences: (dataDir: string) => Promise<void>;
  addReference: (dataDir: string, reference: ReferenceConfig) => Promise<void>;
  removeReference: (dataDir: string, name: string) => Promise<void>;
}

interface SnapshotActions {
  createSnapshot: (params: {
    workspaceId: string;
    workspaceRoot: string;
    messageId: string;
    sessionId: string;
  }) => Promise<SnapshotRecord | null>;
  listSnapshots: (workspaceId: string, workspaceRoot: string) => Promise<SnapshotRecord[]>;
  revertToSnapshot: (
    workspaceId: string,
    workspaceRoot: string,
    snapshotId: string,
  ) => Promise<RevertResult | null>;
}

type AllActions = [
  WorkspaceActions,
  SessionActions,
  EditorActions,
  GitActions,
  PatchActions,
  SearchActions,
  TaskActions,
  CommandActions,
  CustomCommandActions,
  PermissionActions,
  CompactionActions,
  DataFetchActions,
  AgentActions,
  McpActions,
  ProviderActions,
  WebToolsActions,
  LspActions,
  CustomAgentActions,
  ReferenceActions,
  SnapshotActions,
  SessionForkActions,
  DurableActions,
];

export type StoreState = StoreStateRootFields &
  UnionToIntersection<AllSlices[number]> &
  UnionToIntersection<AllActions[number]>;
