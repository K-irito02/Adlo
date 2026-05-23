/**
 * 完整的 StoreState 类型定义
 * 基于所有切片合并而成
 * 使用 interface extends 替代交叉类型，改善类型推断性能
 */

import type { UISlice } from "./slices/uiSlice";
import type { WorkspaceSlice } from "./slices/workspaceSlice";
import type { GitSlice } from "./slices/gitSlice";
import type { SessionSlice } from "./slices/sessionSlice";
import type { EditorSlice } from "./slices/editorSlice";
import type { PatchSlice } from "./slices/patchSlice";
import type { SearchSlice } from "./slices/searchSlice";
import type { DiagnosticSlice } from "./slices/diagnosticSlice";
import type { TaskSlice } from "./slices/taskSlice";
import type { CommandSlice } from "./slices/commandSlice";
import type { ClipboardSlice } from "./slices/clipboardSlice";
import type { TerminalSlice } from "./slices/terminalSlice";
import type {
  AppInfo,
  AppPreferencePatch,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from "@ai-digital-life/kernel";
import type { MessageSendOptions } from "../composerSend";

interface StoreStateBase
  extends UISlice,
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
    TerminalSlice {
  loading: boolean;
  error?: string;
}

interface WorkspaceActions {
  openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  clearWorkspaceContext: () => Promise<void>;
  pickWorkspaceDirectory: () => Promise<string | undefined>;
  pinWorkspace: (workspaceId: string) => Promise<void>;
  unpinWorkspace: (workspaceId: string) => Promise<void>;
  removeWorkspaceFromSidebar: (workspaceId: string) => Promise<void>;
  reorderWorkspaces: (input: ReorderWorkspacesInput) => Promise<void>;
  revealWorkspaceInFileManager: (workspacePath: string) => Promise<void>;
  createWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  createWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
  refreshWorkspaceTree: () => Promise<void>;
  loadWorkspaceTree: (workspaceId: string, workspacePath: string) => Promise<void>;
  toggleWorkspaceTreeInFileNav: (workspaceId: string) => void;
  expandWorkspaceTreeInFileNav: (workspaceId: string, workspacePath: string) => Promise<void>;
  refreshAllWorkspaceTrees: () => Promise<void>;
  cleanupRemovedWorkspaceTree: (workspaceId: string) => void;
  hideWorkspaceFromRightPanels: (workspaceId: string) => Promise<void>;
  showWorkspaceInRightPanels: (workspaceId: string) => Promise<void>;
  expandAllWorkspaceTreesInFileNav: () => Promise<void>;
  collapseAllWorkspaceTreesInFileNav: () => void;
  renameWorkspaceFile: (relativePath: string, newName: string) => Promise<void>;
  moveWorkspaceFile: (relativePath: string, newPath: string) => Promise<void>;
  deleteWorkspaceFile: (relativePath: string) => Promise<void>;
  duplicateWorkspaceFile: (srcRelativePath: string, dstRelativePath: string) => Promise<void>;
}

interface SessionActions {
  createSession: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  unpinSession: (sessionId: string) => Promise<void>;
  markSessionRead: (sessionId: string) => Promise<void>;
  markSessionUnread: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  archiveAllSessions: () => Promise<void>;
  reorderSessions: (input: ReorderSessionsInput) => Promise<void>;
  markAllSessionsRead: (sessionIds: string[]) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, options?: MessageSendOptions) => Promise<void>;
  cancelActiveStream: () => Promise<void>;
}

interface EditorActions {
  openFile: (relativePath: string) => Promise<void>;
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
  setHunkDecision: (patchSetId: string, hunkId: string, decision: "pending" | "accepted" | "rejected") => Promise<void>;
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
  decideApproval: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
  fetchRunActivityByRunId: (runId: string, limit?: number) => Promise<void>;
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
  extends StoreStateBase,
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
