import type { WorkspaceBridge } from '../shared/ipc';
import type {
  GitBranchSummary,
  GitSnapshot,
  RecentWorkspaceEntry,
  ReorderWorkspacesInput,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import { invokeIpc, subscribeChannel } from './tauri-shared';

export function createTauriWorkspaceBridge(): WorkspaceBridge {
  return {
    listRecent: () => invokeIpc<RecentWorkspaceEntry[]>('workspace_list_recent'),
    open: (workspacePath: string) => invokeIpc<WorkspaceMeta>('workspace_open', { workspacePath }),
    clearCurrent: () => invokeIpc<boolean>('workspace_clear_current'),
    pickDirectory: async () => {
      const result = await invokeIpc<string | null>('workspace_pick_directory');
      return result.ok ? { ok: true, data: result.data ?? undefined } : result;
    },
    pin: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_pin', { workspaceId }),
    unpin: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_unpin', { workspaceId }),
    reorder: (input: ReorderWorkspacesInput) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_reorder', { input }),
    removeFromSidebar: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_remove_from_sidebar', { workspaceId }),
    restoreToSidebar: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_restore_to_sidebar', { workspaceId }),
    listTreeForWorkspace: (workspacePath: string) =>
      invokeIpc<WorkspaceTreeNode[]>('workspace_list_tree', { workspacePath }),
    listGitStatusForWorkspace: (workspacePath) =>
      invokeIpc<GitSnapshot>('workspace_get_git_status', { workspacePath }),
    hideFromRightPanels: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_hide_from_right_panels', { workspaceId }),
    showInRightPanels: (workspaceId: string) =>
      invokeIpc<RecentWorkspaceEntry[]>('workspace_show_in_right_panels', { workspaceId }),
    revealInFileManager: (workspacePath: string) =>
      invokeIpc<boolean>('workspace_reveal_in_file_manager', { path: workspacePath }),
    createFile: (relativePath: string, content = '') =>
      invokeIpc<WorkspaceFileDocument>('workspace_create_file', { relativePath, content }),
    createFolder: (relativePath: string) =>
      invokeIpc<boolean>('workspace_create_folder', { relativePath }),
    readFile: (relativePath: string) =>
      invokeIpc<WorkspaceFileDocument>('workspace_read_file', { relativePath }),
    readFileForWorkspace: (workspacePath: string, relativePath: string) =>
      invokeIpc<WorkspaceFileDocument>('workspace_read_file', { workspacePath, relativePath }),
    getChangePreview: (relativePath: string) =>
      invokeIpc<WorkspaceChangePreview>('workspace_get_change_preview', { relativePath }),
    getChangePreviewForWorkspace: (workspacePath: string, relativePath: string) =>
      invokeIpc<WorkspaceChangePreview>('workspace_get_change_preview', {
        workspacePath,
        relativePath,
      }),
    listTree: () => invokeIpc<WorkspaceTreeNode[]>('workspace_list_tree'),
    search: (query: string) => invokeIpc<WorkspaceSearchHit[]>('workspace_search', { query }),
    outline: (relativePath: string) => invokeIpc('workspace_outline', { relativePath }),
    setEditorDirtyPaths: (relativePaths: string[]) =>
      invokeIpc<boolean>('workspace_set_editor_dirty_paths', { relativePaths }),
    renameFile: (relativePath: string, newName: string) =>
      invokeIpc<boolean>('workspace_rename_file', { relativePath, newName }),
    deleteFile: (relativePath: string) =>
      invokeIpc<boolean>('workspace_delete_file', { relativePath }),
    duplicateFile: (srcRelativePath: string, dstRelativePath: string) =>
      invokeIpc<boolean>('workspace_duplicate_file', {
        relativePath: srcRelativePath,
        newPath: dstRelativePath,
      }),
    getAbsolutePath: (relativePath: string) =>
      invokeIpc<string>('workspace_get_absolute_path', { relativePath }),
    moveFile: (relativePath: string, newPath: string) =>
      invokeIpc<boolean>('workspace_move_file', { relativePath, newPath }),
    onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) =>
      subscribeChannel<WorkspaceFileChangedEvent>(
        'digital-life://workspace-file-changed',
        listener,
      ),
    getGitStatus: () => invokeIpc<GitSnapshot>('workspace_get_git_status'),
    listGitBranches: (rootPath?: string) =>
      invokeIpc<GitBranchSummary[]>('workspace_list_git_branches', {
        workspacePath: rootPath,
      }),
    switchGitBranch: (input: WorkspaceGitBranchSwitchInput) =>
      invokeIpc<WorkspaceGitBranchChangeResult>('workspace_switch_git_branch', { input }),
    createGitBranch: (input: WorkspaceGitBranchCreateInput) =>
      invokeIpc<WorkspaceGitBranchChangeResult>('workspace_create_git_branch', { input }),
    stageFile: (relativePath: string, workspacePath?: string) =>
      invokeIpc<void>('workspace_git_stage_file', { relativePath, workspacePath }),
    unstageFile: (relativePath: string, workspacePath?: string) =>
      invokeIpc<void>('workspace_git_unstage_file', { relativePath, workspacePath }),
    discardFile: (relativePath: string, workspacePath?: string) =>
      invokeIpc<void>('workspace_git_discard_file', { relativePath, workspacePath }),
    gitVisCommitStats: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_commit_stats', { rootPath, since, until }),
    gitVisCodeEvolution: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_code_evolution', { rootPath, since, until }),
    gitVisContributorModules: (rootPath, since, until) =>
      invokeIpc('workspace_git_vis_contributor_modules', { rootPath, since, until }),
    gitVisBranchGraph: (rootPath) => invokeIpc('workspace_git_vis_branch_graph', { rootPath }),
    gitVisFileSunburst: (rootPath) => invokeIpc('workspace_git_vis_file_sunburst', { rootPath }),
  };
}
