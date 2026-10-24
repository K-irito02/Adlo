import type {
  AppInfo,
  FileOutlineItem,
  FilePatch,
  WorkspaceChangePreview,
  WorkspaceMediaDocument,
  GitSnapshot,
  PatchApplicationResult,
  PatchSet,
  RecentWorkspaceEntry,
  RepoMapNode,
  SettingItem,
  SettingValue,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import type { SearchHitEntry } from '@stores/slices/searchSlice';
import type { FileOpenError } from '@stores/slices/editorSlice';
import type { EditorTabState } from '@utils/editorTabs';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import type { PatchDirection, PatchReviewFilter } from '@features/patch-review';

export interface RightPanelViewProps {
  appInfo?: AppInfo;
  collapsed: boolean;
  editorTabs: EditorTabState[];
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  selectedChangePreviewPath?: string;
  selectedChangePreviewWorkspaceId?: string;
  changePreview?: WorkspaceChangePreview;
  changePreviewLoading: boolean;
  fileContent?: string;
  fileLastModifiedAt?: number;
  /** 媒体/办公二进制文档（与 fileContent 互斥，见 editorSlice.fileMedia） */
  fileMedia?: WorkspaceMediaDocument | null;
  /** 媒体读取中：区分加载骨架与空态（见 editorSlice.fileMediaLoading） */
  fileMediaLoading?: boolean;
  /** 内容区开文件失败信息（事项 46 调整项）：失败时内容区展示友好错误，不回退旧内容 */
  fileOpenError?: FileOpenError | null;
  /** 正在定位中的路径（事项 46 调整项）：内容区隐藏该文件表面直到揭示完成 */
  positioningPath?: string | null;
  externalChangePath?: string;
  editorLanguage: string;
  diffSideBySide: boolean;
  filePatch?: FilePatch;
  diagnostics: {
    id: string;
    source: string;
    message: string;
    path?: string;
    line?: number;
    severity: 'error' | 'warning' | 'info';
  }[];
  editorHint?: string;
  outline: FileOutlineItem[];
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  recentWorkspaces: RecentWorkspaceEntry[];
  allExpanded: boolean;
  workspaceTreeExpandedInFileNav: Record<string, boolean>;
  workspaceTreeLoading: Record<string, boolean>;
  workspaceTreeErrors: Record<string, string | undefined>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  onRefreshOneWorkspace: (workspaceId: string) => void;
  onToggleExpandInFileNav: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onShowInRightPanels: (workspaceId: string) => void;
  repoMap: RepoMapNode[];
  searchQuery: string;
  searchEntries: SearchHitEntry[];
  dirtyEditorPaths: string[];
  standardEditorRef: React.MutableRefObject<EditorRef | null>;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => void;
  onOpenChangePreview: (relativePath: string) => void;
  onOpenChangePreviewForWorkspace: (workspacePath: string, relativePath: string) => void;
  onOpenFileAtLine: (relativePath: string, line: number) => void;
  onReloadExternal: () => void;
  onCreateWorkspaceFile: (
    relativePath: string,
    content?: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (
    relativePath: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  onEditorChange: (value: string | undefined) => void;
  onEditorMount: (editor: EditorRef) => void;
  onDiffMount: (editor: EditorRef | DiffEditorRef) => void;
  onSearch: (query: string) => void;
  onSearchChange: (query: string) => void;
  onRefreshWorkspaceTree: () => void;
  onSetDiffLayout: (sideBySide: boolean) => void;
  activePatchSet?: PatchSet;
  activePatchSets: Record<string, PatchSet | undefined>;
  latestPatchApplication?: PatchApplicationResult;
  selectedPatchFilePath?: string;
  selectedPatchHunkId?: string;
  collapsedPatchHunkIds: string[];
  patchReviewFilter: PatchReviewFilter;
  onSetHunkDecision: (hunkId: string, decision: 'pending' | 'accepted' | 'rejected') => void;
  onApplyPatchSet: () => void;
  onRollbackPatchSet: () => void;
  onAcceptAllHunks: () => void;
  onRejectAllHunks: () => void;
  onSelectPatchFile: (
    relativePath: string,
    options?: { activateTool?: boolean; line?: number; hunkId?: string },
  ) => void;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    line: number,
    options?: { activateTool?: boolean },
  ) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSetAllPatchHunksCollapsed: (collapsed: boolean, relativePath?: string) => void;
  onSetPatchReviewFilter: (filter: PatchReviewFilter) => void;
  onJumpPatchHunk: (direction: PatchDirection) => void;
  settings: SettingItem[];
  gitSnapshot?: GitSnapshot;
  gitSnapshots: Record<string, GitSnapshot>;
  workspaceChangesExpanded: Record<string, boolean>;
  onChangeSetting: (id: string, value: SettingValue) => void;
}

export type FilesPanelProps = Pick<
  RightPanelViewProps,
  | 'appInfo'
  | 'selectedFilePath'
  | 'selectedFileWorkspaceId'
  | 'fileContent'
  | 'fileMedia'
  | 'fileMediaLoading'
  | 'fileOpenError'
  | 'positioningPath'
  | 'filePatch'
  | 'editorLanguage'
  | 'diffSideBySide'
  | 'diagnostics'
  | 'editorHint'
  | 'outline'
  | 'workspaceTrees'
  | 'recentWorkspaces'
  | 'allExpanded'
  | 'workspaceTreeExpandedInFileNav'
  | 'workspaceTreeLoading'
  | 'workspaceTreeErrors'
  | 'searchQuery'
  | 'searchEntries'
  | 'dirtyEditorPaths'
  | 'externalChangePath'
  | 'standardEditorRef'
  | 'onOpenFile'
  | 'onOpenFileForWorkspace'
  | 'onOpenFileAtLine'
  | 'onEditorChange'
  | 'onEditorMount'
  | 'onDiffMount'
  | 'onSearch'
  | 'onSearchChange'
  | 'onRefreshWorkspaceTree'
  | 'onExpandAll'
  | 'onCollapseAll'
  | 'onRefreshAll'
  | 'onRefreshOneWorkspace'
  | 'onToggleExpandInFileNav'
  | 'onHideFromRightPanels'
  | 'onCreateWorkspaceFile'
  | 'onCreateWorkspaceFolder'
  | 'onSetDiffLayout'
  | 'onJumpPatchHunk'
  | 'onSelectPatchHunk'
  | 'onTogglePatchHunkCollapse'
  | 'onSetAllPatchHunksCollapsed'
  | 'activePatchSet'
  | 'selectedPatchFilePath'
  | 'selectedPatchHunkId'
  | 'collapsedPatchHunkIds'
>;

export type ChangesPanelProps = Pick<
  RightPanelViewProps,
  | 'appInfo'
  | 'onDiffMount'
  | 'activePatchSet'
  | 'latestPatchApplication'
  | 'selectedPatchFilePath'
  | 'selectedChangePreviewPath'
  | 'selectedChangePreviewWorkspaceId'
  | 'changePreview'
  | 'changePreviewLoading'
  | 'selectedPatchHunkId'
  | 'collapsedPatchHunkIds'
  | 'patchReviewFilter'
  | 'onSetHunkDecision'
  | 'onApplyPatchSet'
  | 'onRollbackPatchSet'
  | 'onAcceptAllHunks'
  | 'onRejectAllHunks'
  | 'onSelectPatchFile'
  | 'onOpenChangePreview'
  | 'onSelectPatchHunk'
  | 'onTogglePatchHunkCollapse'
  | 'onSetAllPatchHunksCollapsed'
  | 'onSetPatchReviewFilter'
  | 'onOpenFile'
  | 'onRefreshWorkspaceTree'
  | 'recentWorkspaces'
  | 'workspaceChangesExpanded'
  | 'gitSnapshot'
  | 'gitSnapshots'
  | 'activePatchSets'
  | 'onHideFromRightPanels'
  | 'diffSideBySide'
  | 'onSetDiffLayout'
  | 'dirtyEditorPaths'
  | 'externalChangePath'
  | 'onJumpPatchHunk'
>;

export interface BrowserPanelProps {
  isVisible: boolean;
}

export type SettingsPanelProps = Pick<RightPanelViewProps, 'settings' | 'onChangeSetting'>;

export function countGitChanges(snapshot?: GitSnapshot): number {
  if (!snapshot) {
    return 0;
  }
  return (
    snapshot.staged.length +
    snapshot.unstaged.length +
    snapshot.untracked.length +
    snapshot.conflicts.length
  );
}

export function getPathSegments(pathValue?: string): string[] {
  return pathValue?.split('/').filter(Boolean) ?? [];
}

export function getDisplayPathName(pathValue?: string): string {
  const segments = getPathSegments(pathValue);
  return segments[segments.length - 1] ?? '';
}
