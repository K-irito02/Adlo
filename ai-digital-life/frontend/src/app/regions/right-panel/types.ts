import type {
  AppInfo,
  AuditEntry,
  CommandRunResult,
  FileOutlineItem,
  FilePatch,
  WorkspaceChangePreview,
  GitSnapshot,
  PatchApplicationResult,
  PatchSet,
  RepoMapNode,
  SettingItem,
  WorkspaceSearchHit,
  WorkspaceTreeNode
} from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { EditorTabState } from "../../editorTabs";
import type { MonacoEditorRef } from "../../types";
import type { PatchDirection, PatchReviewFilter } from "./patchReview";

export interface RightPanelViewProps {
  t: CopyDict;
  appInfo?: AppInfo;
  collapsed: boolean;
  editorTabs: EditorTabState[];
  selectedFilePath?: string;
  selectedChangePreviewPath?: string;
  changePreview?: WorkspaceChangePreview;
  changePreviewLoading: boolean;
  fileContent?: string;
  fileLastModifiedAt?: number;
  externalChangePath?: string;
  editorLanguage: string;
  diffSideBySide: boolean;
  filePatch?: FilePatch;
  diagnostics: Array<{
    id: string;
    source: string;
    message: string;
    path?: string;
    line?: number;
    severity: "error" | "warning" | "info";
  }>;
  editorHint?: string;
  outline: FileOutlineItem[];
  workspaceTree: WorkspaceTreeNode[];
  repoMap: RepoMapNode[];
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  dirtyEditorPaths: string[];
  standardEditorRef: React.MutableRefObject<MonacoEditorRef | null>;
  diffEditorRef: React.MutableRefObject<MonacoEditorRef | null>;
  onOpenFile: (relativePath: string) => void;
  onOpenChangePreview: (relativePath: string) => void;
  onOpenFileAtLine: (relativePath: string, line: number) => void;
  onReloadExternal: () => void;
  onCreateWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
  onEditorChange: (value: string | undefined) => void;
  onEditorMount: (editor: MonacoEditorRef, monaco: unknown) => void;
  onDiffMount: (editor: MonacoEditorRef) => void;
  onSearch: (query: string) => void;
  onSearchChange: (query: string) => void;
  onRefreshWorkspaceTree: () => void;
  onSendSelection: () => void;
  onSetDiffLayout: (sideBySide: boolean) => void;
  activePatchSet?: PatchSet;
  latestPatchApplication?: PatchApplicationResult;
  selectedPatchFilePath?: string;
  selectedPatchHunkId?: string;
  collapsedPatchHunkIds: string[];
  patchReviewFilter: PatchReviewFilter;
  onSetHunkDecision: (hunkId: string, decision: "pending" | "accepted" | "rejected") => void;
  onApplyPatchSet: () => void;
  onRollbackPatchSet: () => void;
  onAcceptAllHunks: () => void;
  onRejectAllHunks: () => void;
  onSelectPatchFile: (relativePath: string, options?: { activateTool?: boolean; line?: number; hunkId?: string }) => void;
  onSelectPatchHunk: (relativePath: string, hunkId: string, line: number, options?: { activateTool?: boolean }) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSetAllPatchHunksCollapsed: (collapsed: boolean, relativePath?: string) => void;
  onSetPatchReviewFilter: (filter: PatchReviewFilter) => void;
  onJumpPatchHunk: (direction: PatchDirection) => void;
  modelHealth?: { providers: Array<{ providerId: string; healthy: boolean; detail: string }> } | undefined;
  onRefreshModelHealth: () => void;
  auditEntries: AuditEntry[];
  settings: SettingItem[];
  gitSnapshot?: GitSnapshot;
  commandHistory: string[];
  onChangeSetting: (id: string, value: string | boolean | number) => void;
  commandBinary: string;
  commandArgs: string;
  latestCommandRun?: CommandRunResult;
  terminalOutput: string;
  activeTerminalExecutionId?: string;
  onCommandBinaryChange: (value: string) => void;
  onCommandArgsChange: (value: string) => void;
  onRunCommand: () => void;
  onRunCommandStream: () => void;
  onStopCommandStream: () => void;
}

export function countGitChanges(snapshot?: GitSnapshot): number {
  if (!snapshot) {
    return 0;
  }
  return snapshot.staged.length + snapshot.unstaged.length + snapshot.untracked.length + snapshot.conflicts.length;
}

export function getPathSegments(pathValue?: string): string[] {
  return pathValue?.split("/").filter(Boolean) ?? [];
}

export function getDisplayPathName(pathValue?: string): string {
  const segments = getPathSegments(pathValue);
  return segments[segments.length - 1] ?? "";
}
