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
import type { ReferenceSlice } from './slices/referenceSlice';
import type { ToastSlice } from './slices/toastSlice';
import type { ErrorToastSlice } from './slices/errorToastSlice';
import type { NotificationSlice } from './slices/notificationSlice';
import type { FileOpNoticeSlice } from './slices/fileOpNoticeSlice';
import type { BrowserDownloadsSlice } from './slices/browserDownloadsSlice';
import type { CenterTabsSlice } from './slices/centerTabsSlice';
import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import type { WorkspaceID } from '../../shared/branded';
import type {
  DshOpenResult,
  DshRestartResult,
  DshSourceConfig,
  DshTestResult,
} from '../../shared/ipc/dsh';

interface ReferenceConfig {
  name: string;
  source: 'local' | 'git';
  path: string;
  branch?: string | null;
  enabled: boolean;
}

type GitSwitchMode = 'local' | 'remote' | 'sync';

interface WorkspaceGitBranchSwitchInput {
  branchName: string;
  allowStash: boolean;
  mode?: GitSwitchMode;
}

interface WorkspaceGitBranchCreateInput {
  branchName: string;
  baseBranch?: string;
  allowStash: boolean;
}

interface WorkspaceWorktreeEnsureInput {
  branchName: string;
  allowStash: boolean;
  mode?: GitSwitchMode;
}

interface WorkspaceWorktreeRemoveInput {
  branchName: string;
  force: boolean;
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
  /**
   * ad-server 可达性（浏览器预览）：`null` = 尚未探测；`true` = 已连通；
   * `false` = 不可达（部分域回退 mock/预览实现）。由 `useAppStartup` 订阅
   * `onAdServerReachabilityChange` 后写入；设置面板凭此显示离线标识。
   * Tauri 桌面壳恒为 `true`（bootstrap 成功即连通）。
   */
  adServerReachable: boolean | null;
  setAdServerReachable: (reachable: boolean) => void;
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
  /**
   * 暂存编辑器未落盘文本（typing 缓冲；Ctrl+S / 自动保存消费）。
   * @see saveFile / saveDirtyEditors
   */
  noteEditorText: (relativePath: string, text: string, workspaceId?: string) => void;
  /**
   * 保存文件（Ctrl+S / 自动保存入口）。无待存内容即 no-op。
   * @returns true=已保存或无须保存，false=失败（错误已进 errorToasts）
   */
  saveFile: (relativePath?: string, workspacePath?: string) => Promise<boolean>;
  /**
   * 依次保存全部暂存草稿（切换文件/分支/工作区前的 flush 点）。
   * @returns {saved, failed}（saved 仅计真正写盘成功的）。
   */
  saveDirtyEditors: () => Promise<{ saved: number; failed: number }>;
  /**
   * 对账当前选中文件与磁盘（绕过缓存重读）：内容变了就更新基线；
   * 文件没了且无未存草稿则清为空状态（复用 fileOpenError 友好视图），
   * 有草稿则保留并警告。供刷新按钮/分支切换后调用。
   */
  reconcileSelectedFile: () => Promise<void>;
  /**
   * 工作区切换后对账选中文件（事项5）：源已不在则新上下文重读，
   * 缺失清空为空（无错误卡），命中归属新工作区；有草稿则不动。
   * 供 openWorkspace 在 bootstrap 后调用。
   */
  reconcileSelectedFileAfterWorkspaceSwitch: () => Promise<void>;
  /**
   * hover 意图预取变更预览（事项4）：只写缓存，不碰选择态/加载态。
   */
  prefetchChangePreviewForWorkspace: (workspacePath: string, relativePath: string) => Promise<void>;
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
  /**
   * 确保分支的 sibling worktree 并聚焦（openWorkspace 全量刷新双面板）。
   * @returns worktree 路径；失败返回 undefined（错误已进 errorToasts）。
   */
  ensureBranchWorktree: (
    input: WorkspaceWorktreeEnsureInput,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  removeBranchWorktree: (
    input: WorkspaceWorktreeRemoveInput,
    workspacePath?: string,
  ) => Promise<void>;
  pruneWorktrees: (workspacePath?: string) => Promise<void>;
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
  restartDsh: () => Promise<DshRestartResult & { failed: boolean }>;
  fetchVersionTask: () => Promise<void>;
  cancelVersionTask: () => Promise<boolean>;
  fetchDshVersionStatus: (silent?: boolean) => Promise<boolean>;
  updateDsh: () => Promise<boolean>;
  revertDsh: (version: string) => Promise<boolean>;
  uninstallDsh: (version: string) => Promise<boolean>;
  reinstallDsh: () => Promise<boolean>;
  fetchVersionCatalog: (silent?: boolean) => Promise<boolean>;
  installDshVersion: (version: string, select?: boolean) => Promise<boolean>;
  fetchSourceStatus: (silent?: boolean) => Promise<boolean>;
  fetchDshSettingsSnapshot: (silent?: boolean) => Promise<boolean>;
  fetchDshRunning: (silent?: boolean) => Promise<boolean>;
  saveSourceConfig: (config: DshSourceConfig, silent?: boolean) => Promise<boolean>;
  testSource: (url: string, silent?: boolean) => Promise<DshTestResult | null>;
  applyPendingVersionSource: () => Promise<boolean>;
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
