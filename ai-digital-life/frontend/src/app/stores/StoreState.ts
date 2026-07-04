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
 * ### Action 接口（9 个，定义在 actions/）
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
 *
 * ### 根级字段
 * - `loading: boolean` — 应用启动状态
 * - `error?: string` — 全局错误消息
 */

import type { UISlice } from './slices/uiSlice';
import type { WorkspaceSlice } from './slices/workspaceSlice';
import type { GitSlice } from './slices/gitSlice';
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
import type { BrowserSlice } from './slices/browserSlice';
import type { CiSlice } from './slices/ciSlice';
import type { CommunicateSlice } from './slices/communicateSlice';
import type { GitHubRepoSlice } from './slices/githubRepoSlice';
import type { GitHubTreeSlice } from './slices/githubTreeSlice';
import type { GitHubSlice as GitHubSliceType } from './slices/githubSlice';
import type {
  AppPreferencePatch,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from '@ai-digital-life/kernel';
import type { MessageSendOptions } from '../utils/composerSend';
import type { WorkspaceID, SessionID, AgentRunID } from '../../shared/branded';

interface StoreStateBase
  extends
    UISlice,
    WorkspaceSlice,
    GitSlice,
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
    BrowserSlice,
    CiSlice,
    CommunicateSlice,
    GitHubRepoSlice,
    GitHubTreeSlice,
    GitHubSliceType {
  loading: boolean;
  error?: string;
  isFetching: Record<string, boolean>;
}

interface WorkspaceActions {
  openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  clearWorkspaceContext: () => Promise<void>;
  pickWorkspaceDirectory: () => Promise<string | undefined>;
  pinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  unpinWorkspace: (workspaceId: WorkspaceID) => Promise<void>;
  removeWorkspaceFromSidebar: (workspaceId: WorkspaceID) => Promise<void>;
  reorderWorkspaces: (input: ReorderWorkspacesInput) => Promise<void>;
  revealWorkspaceInFileManager: (workspacePath: string) => Promise<void>;
  createWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  createWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
  refreshWorkspaceTree: () => Promise<void>;
  loadWorkspaceTree: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshOneWorkspaceTree: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  toggleWorkspaceTreeInFileNav: (workspaceId: WorkspaceID) => void;
  expandWorkspaceTreeInFileNav: (workspaceId: WorkspaceID, workspacePath: string) => Promise<void>;
  refreshAllWorkspaceTrees: () => Promise<void>;
  cleanupRemovedWorkspaceTree: (workspaceId: WorkspaceID) => void;
  hideWorkspaceFromRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  showWorkspaceInRightPanels: (workspaceId: WorkspaceID) => Promise<void>;
  expandAllWorkspaceTreesInFileNav: () => Promise<void>;
  collapseAllWorkspaceTreesInFileNav: () => void;
  renameWorkspaceFile: (relativePath: string, newName: string) => Promise<void>;
  moveWorkspaceFile: (relativePath: string, newPath: string) => Promise<void>;
  deleteWorkspaceFile: (relativePath: string) => Promise<void>;
  duplicateWorkspaceFile: (srcRelativePath: string, dstRelativePath: string) => Promise<void>;
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
    relativePath: string
  ) => Promise<void>;
  openChangePreview: (relativePath: string) => Promise<void>;
  openChangePreviewForWorkspace: (workspacePath: string, relativePath: string) => Promise<void>;
  markExternalFileChange: (input: { path: string; lastModifiedAt: number }) => void;
  notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => void;
}

interface GitActions {
  loadGitSnapshot: (workspaceId: string, workspacePath: string) => Promise<void>;
  refreshGitSnapshot: (workspaceId: string, workspacePath: string) => Promise<void>;
  expandWorkspaceChangesInFileNav: (workspaceId: string, workspacePath: string) => Promise<void>;
  collapseAllWorkspaceChanges: () => void;
  expandAllWorkspaceChanges: () => Promise<void>;
  fetchGitStatus: () => Promise<void>;
  fetchGitBranches: () => Promise<void>;
  switchGitBranch: (input: WorkspaceGitBranchSwitchInput) => Promise<void>;
  createGitBranch: (input: WorkspaceGitBranchCreateInput) => Promise<void>;
}

interface PatchActions {
  setHunkDecision: (
    patchSetId: string,
    hunkId: string,
    decision: 'pending' | 'accepted' | 'rejected'
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

interface DataFetchActions {
  refreshModelHealth: () => Promise<void>;
  updatePreferences: (patch: AppPreferencePatch) => Promise<void>;
  fetchIndexStatus: () => Promise<void>;
  fetchRepoMap: () => Promise<void>;
  fetchAuditEntries: (limit?: number) => Promise<void>;
}

export interface StoreState
  extends
    StoreStateBase,
    WorkspaceActions,
    SessionActions,
    EditorActions,
    GitActions,
    PatchActions,
    SearchActions,
    TaskActions,
    CommandActions,
    DataFetchActions {
  bootstrap: () => Promise<void>;
}
