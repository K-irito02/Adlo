/**
 * 完整的 StoreState 类型定义 — 领域分组总览
 *
 * 会话/聊天领域（session/agent/provider/command/compaction/sessionFork/
 * durable/partStream/自定义命令/权限）已随 dsh 剥离删除。
 */

import type { UISlice } from './slices/uiSlice';
import type { WorkspaceSlice } from './slices/workspaceSlice';
import type { GitSlice } from './slices/gitSlice';
import type { GitVisSlice } from './slices/gitVisSlice';
import type { EditorSlice } from './slices/editorSlice';
import type { PatchSlice } from './slices/patchSlice';
import type { SearchSlice } from './slices/searchSlice';
import type { DiagnosticSlice } from './slices/diagnosticSlice';
import type { ClipboardSlice } from './slices/clipboardSlice';
import type { DshSlice } from './slices/dshSlice';
import type { ClipboardHistorySlice } from './slices/clipboardHistorySlice';
import type { SystemMonitorSlice } from './slices/systemMonitorSlice';
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
import type { ReferenceSlice } from './slices/referenceSlice';
import type { ToastSlice } from './slices/toastSlice';
import type { ErrorToastSlice } from './slices/errorToastSlice';
import type { NotificationSlice } from './slices/notificationSlice';
import type { FileOpNoticeSlice } from './slices/fileOpNoticeSlice';
import type { BrowserDownloadsSlice } from './slices/browserDownloadsSlice';
import type { CenterTabsSlice } from './slices/centerTabsSlice';
import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import type { WorkspaceID } from '../../shared/branded';
import type { DshOpenResult, DshSourceConfig, DshTestResult } from '../../shared/ipc/dsh';

interface ReferenceConfig {
  name: string;
  source: 'local' | 'git';
  path: string;
  branch?: string | null;
  enabled: boolean;
}

interface WorkspaceGitBranchSwitchInput {
  branchName: string;
  allowStash: boolean;
}

interface WorkspaceGitBranchCreateInput {
  branchName: string;
  baseBranch?: string;
  allowStash: boolean;
}

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
  bootstrap: () => Promise<void>;
}

type AllSlices = [
  UISlice,
  WorkspaceSlice,
  GitSlice,
  GitVisSlice,
  EditorSlice,
  PatchSlice,
  SearchSlice,
  DiagnosticSlice,
  ClipboardSlice,
  DshSlice,
  ClipboardHistorySlice,
  SystemMonitorSlice,
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
  ReferenceSlice,
  ToastSlice,
  ErrorToastSlice,
  NotificationSlice,
  FileOpNoticeSlice,
  BrowserDownloadsSlice,
  CenterTabsSlice,
];

interface WorkspaceActions {
  openWorkspace: (workspacePath: string) => Promise<{ ok: boolean; error?: string }>;
  clearWorkspaceContext: () => Promise<void>;
  pickWorkspaceDirectory: () => Promise<string | undefined>;
  removeWorkspaceFromSidebar: (workspaceId: WorkspaceID) => Promise<void>;
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
  expandAllWorkspaceTreesInFileNav: () => Promise<void>;
  collapseAllWorkspaceTreesInFileNav: () => void;
  renameWorkspaceFile: (
    relativePath: string,
    newName: string,
    workspacePath?: string,
  ) => Promise<void>;
  carryExpandedPathsForRename: (workspaceId: string, oldPath: string, newPath: string) => void;
  dropExpandedPathsUnder: (workspaceId: string, removedPath: string) => void;
  carryChangesExpandedPathsForRename: (
    workspaceId: string,
    oldPath: string,
    newPath: string,
  ) => void;
  dropChangesExpandedPathsUnder: (workspaceId: string, removedPath: string) => void;
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

interface EditorActions {
  openFile: (relativePath: string) => Promise<void>;
  openFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => Promise<void>;
  rememberLastOpenedFile: (workspaceId: string, relativePath: string) => void;
  restoreLastOpenedFile: () => Promise<void>;
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
  fetchGitBranches: (options?: { silent?: boolean }) => Promise<void>;
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
}

interface SearchActions {
  searchFiles: (query: string) => Promise<void>;
  /** 追加一页命中（+SEARCH_PAGE_SIZE）并重跑当前检索 */
  loadMoreSearchResults: () => Promise<void>;
  /** 一次性把窗口提到安全阀上限并重跑当前检索 */
  showAllSearchResults: () => Promise<void>;
  /** 用当前窗口上限原位重跑当前检索（刷新全部在检索模式下调用） */
  refreshSearchResults: () => Promise<void>;
  markSearchHitStale: (path: string, line?: number, workspaceId?: string) => void;
  cancelPendingSearch: () => void;
  subscribeWorkspaceFilesChanged: () => () => void;
}

interface DataFetchActions {
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  fetchIndexStatus: () => Promise<void>;
  fetchRepoMap: () => Promise<void>;
}

interface ReferenceActions {
  fetchReferences: (dataDir: string) => Promise<void>;
  addReference: (dataDir: string, reference: ReferenceConfig) => Promise<void>;
  removeReference: (dataDir: string, name: string) => Promise<void>;
}

interface UtilitiesActions {
  fetchClipboardHistory: (background?: boolean) => Promise<void>;
  removeClipboardItem: (id: string) => Promise<void>;
  clearAllClipboard: () => Promise<void>;
  writeClipboardItem: (id: string) => Promise<boolean>;
  updateClipboardItem: (id: string, content: string) => Promise<boolean>;
  fetchSystemSnapshot: () => Promise<void>;
}

interface DshActions {
  openDsh: () => Promise<DshOpenResult | null>;
  fetchDshVersionStatus: () => Promise<boolean>;
  updateDsh: () => Promise<boolean>;
  revertDsh: (version: string) => Promise<boolean>;
  uninstallDsh: (version: string) => Promise<boolean>;
  reinstallDsh: () => Promise<boolean>;
  fetchSourceStatus: (silent?: boolean) => Promise<boolean>;
  saveSourceConfig: (config: DshSourceConfig, silent?: boolean) => Promise<boolean>;
  testSource: (url: string, silent?: boolean) => Promise<DshTestResult | null>;
}

interface CenterActions {
  clampPanelActiveTab: () => void;
  centerShowBrowserTab: (browserTabId: string) => void;
  centerShowTerminalTab: (terminalTabId: string) => void;
  centerReturnToPanel: (centerTabId: string) => void;
}

type AllActions = [
  WorkspaceActions,
  EditorActions,
  GitActions,
  PatchActions,
  SearchActions,
  DataFetchActions,
  ReferenceActions,
  UtilitiesActions,
  DshActions,
  CenterActions,
];

export type StoreState = StoreStateRootFields &
  UnionToIntersection<AllSlices[number]> &
  UnionToIntersection<AllActions[number]>;
