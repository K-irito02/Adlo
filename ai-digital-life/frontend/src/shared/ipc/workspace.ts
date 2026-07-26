import type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  GitVisBranchGraph,
  GitVisCodeEvolution,
  GitVisCommitStats,
  GitVisContributorModules,
  GitVisFileSunburst,
  IpcResult,
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

export type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  GitVisBranchGraph,
  GitVisCodeEvolution,
  GitVisCommitStats,
  GitVisContributorModules,
  GitVisFileSunburst,
  IpcResult,
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
};

/**
 * 工作区管理桥接能力
 * 用于: 工作区列表/打开/关闭/目录选择/固定/排序/侧边栏管理/文件树/Git 状态/文件操作/搜索
 * Tauri 命令: workspace_* 系列
 * 浏览器模式: 通过本地存储 + 预览 API 实现
 */
export interface WorkspaceBridge {
  /**
   * 列出最近使用的工作区
   * @returns 最近使用的工作区列表 (含置顶信息、顺序、是否隐藏等)
   * @command workspace_list_recent
   * @see tauri-bridge.ts → workspace.listRecent
   * @see mock-bridge.ts → workspace.listRecent
   * @see preview-bridge/index.ts → workspace.listRecent
   */
  listRecent: () => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 打开指定路径的工作区
   * @param workspacePath 工作区的绝对路径
   * @returns 已打开工作区的元数据信息
   * @command workspace_open
   * @see tauri-bridge.ts → workspace.open
   * @see mock-bridge.ts → workspace.open
   * @see preview-bridge/index.ts → workspace.open
   */
  open: (workspacePath: string) => Promise<IpcResult<WorkspaceMeta>>;
  /**
   * 关闭/清除当前工作区
   * @returns 是否成功清除当前工作区
   * @command workspace_clear_current
   * @see tauri-bridge.ts → workspace.clearCurrent
   * @see mock-bridge.ts → workspace.clearCurrent
   * @see preview-bridge/index.ts → workspace.clearCurrent
   */
  clearCurrent: () => Promise<IpcResult<boolean>>;
  /**
   * 打开系统目录选择器
   * @returns 选择的目录路径, 或 undefined (用户取消时)
   * @command workspace_pick_directory
   * @see tauri-bridge.ts → workspace.pickDirectory
   * @see mock-bridge.ts → workspace.pickDirectory
   * @see preview-bridge/index.ts → workspace.pickDirectory
   */
  pickDirectory: () => Promise<IpcResult<string | undefined>>;
  /**
   * 置顶工作区
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_pin
   * @see tauri-bridge.ts → workspace.pin
   * @see mock-bridge.ts → workspace.pin
   * @see preview-bridge/index.ts → workspace.pin
   */
  pin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 取消置顶工作区
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_unpin
   * @see tauri-bridge.ts → workspace.unpin
   * @see mock-bridge.ts → workspace.unpin
   * @see preview-bridge/index.ts → workspace.unpin
   */
  unpin: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 对工作区列表进行重排序
   * @param input 置顶/非置顶工作区的 ID 顺序数组
   * @returns 重排序后的最近工作区列表
   * @command workspace_reorder
   * @see tauri-bridge.ts → workspace.reorder
   * @see mock-bridge.ts → workspace.reorder
   * @see preview-bridge/index.ts → workspace.reorder
   */
  reorder: (input: ReorderWorkspacesInput) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 从侧边栏移除工作区
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_remove_from_sidebar
   * @see tauri-bridge.ts → workspace.removeFromSidebar
   * @see mock-bridge.ts → workspace.removeFromSidebar
   * @see preview-bridge/index.ts → workspace.removeFromSidebar
   */
  removeFromSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 将工作区恢复显示到侧边栏
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_restore_to_sidebar
   * @see tauri-bridge.ts → workspace.restoreToSidebar
   * @see mock-bridge.ts → workspace.restoreToSidebar
   * @see preview-bridge/index.ts → workspace.restoreToSidebar
   */
  restoreToSidebar: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 获取指定工作区的文件目录树
   * @param workspacePath 工作区的绝对路径
   * @returns 文件目录树节点数组
   * @command workspace_list_tree
   * @see tauri-bridge.ts → workspace.listTreeForWorkspace
   * @see mock-bridge.ts → workspace.listTreeForWorkspace
   * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
   */
  listTreeForWorkspace: (workspacePath: string) => Promise<IpcResult<WorkspaceTreeNode[]>>;
  /**
   * 获取指定工作区的 Git 状态快照
   * @param workspacePath 工作区的绝对路径
   * @returns Git 状态快照 (staged/unstaged/untracked/conflicts)
   * @command workspace_get_git_status
   * @see tauri-bridge.ts → workspace.listGitStatusForWorkspace
   * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
   * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
   */
  listGitStatusForWorkspace: (workspacePath: string) => Promise<IpcResult<GitSnapshot>>;
  /**
   * 隐藏右侧面板显示工作区
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_hide_from_right_panels
   * @see tauri-bridge.ts → workspace.hideFromRightPanels
   * @see mock-bridge.ts → workspace.hideFromRightPanels
   * @see preview-bridge/index.ts → workspace.hideFromRightPanels
   */
  hideFromRightPanels: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 恢复右侧面板显示工作区
   * @param workspaceId 工作区 ID
   * @returns 更新后的最近工作区列表
   * @command workspace_show_in_right_panels
   * @see tauri-bridge.ts → workspace.showInRightPanels
   * @see mock-bridge.ts → workspace.showInRightPanels
   * @see preview-bridge/index.ts → workspace.showInRightPanels
   */
  showInRightPanels: (workspaceId: string) => Promise<IpcResult<RecentWorkspaceEntry[]>>;
  /**
   * 在系统文件管理器中显示路径
   * @param workspacePath 要显示的绝对路径
   * @returns 是否成功打开文件管理器
   * @command workspace_reveal_in_file_manager
   * @see tauri-bridge.ts → workspace.revealInFileManager
   * @see mock-bridge.ts → workspace.revealInFileManager
   * @see preview-bridge/index.ts → workspace.revealInFileManager
   */
  revealInFileManager: (workspacePath: string) => Promise<IpcResult<boolean>>;
  /**
   * 在当前工作区创建文件
   * @param relativePath 相对于工作区的路径 (包含文件名)
   * @param content 文件初始内容 (可选)
   * @returns 新建文件的文档信息
   * @command workspace_create_file
   * @see tauri-bridge.ts → workspace.createFile
   * @see mock-bridge.ts → workspace.createFile
   * @see preview-bridge/index.ts → workspace.createFile
   */
  createFile: (relativePath: string, content?: string) => Promise<IpcResult<WorkspaceFileDocument>>;
  /**
   * 在当前工作区创建文件夹
   * @param relativePath 相对于工作区的路径 (包含目录名)
   * @returns 是否成功创建
   * @command workspace_create_folder
   * @see tauri-bridge.ts → workspace.createFolder
   * @see mock-bridge.ts → workspace.createFolder
   * @see preview-bridge/index.ts → workspace.createFolder
   */
  createFolder: (relativePath: string) => Promise<IpcResult<boolean>>;
  /**
   * 读取当前工作区内的文件内容
   * @param relativePath 相对于工作区的路径
   * @returns 文件内容及元信息
   * @command workspace_read_file
   * @see tauri-bridge.ts → workspace.readFile
   * @see mock-bridge.ts → workspace.readFile
   * @see preview-bridge/index.ts → workspace.readFile
   */
  readFile: (relativePath: string) => Promise<IpcResult<WorkspaceFileDocument>>;
  /**
   * 读取指定工作区内的文件内容
   * @param workspacePath 工作区的绝对路径
   * @param relativePath 相对于工作区的路径
   * @returns 文件内容及元信息
   * @command workspace_read_file
   * @see tauri-bridge.ts → workspace.readFileForWorkspace
   * @see mock-bridge.ts → workspace.readFileForWorkspace
   * @see preview-bridge/index.ts → workspace.readFileForWorkspace
   */
  readFileForWorkspace: (
    workspacePath: string,
    relativePath: string,
  ) => Promise<IpcResult<WorkspaceFileDocument>>;
  /**
   * 获取当前工作区内文件的变更预览 (diff)
   * @param relativePath 相对于工作区的路径
   * @returns 文件变更预览内容
   * @command workspace_get_change_preview
   * @see tauri-bridge.ts → workspace.getChangePreview
   * @see mock-bridge.ts → workspace.getChangePreview
   * @see preview-bridge/index.ts → workspace.getChangePreview
   */
  getChangePreview: (relativePath: string) => Promise<IpcResult<WorkspaceChangePreview>>;
  /**
   * 获取指定工作区内文件的变更预览 (diff)
   * @param workspacePath 工作区的绝对路径
   * @param relativePath 相对于工作区的路径
   * @returns 文件变更预览内容
   * @command workspace_get_change_preview
   * @see tauri-bridge.ts → workspace.getChangePreviewForWorkspace
   * @see mock-bridge.ts → workspace.getChangePreviewForWorkspace
   * @see preview-bridge/index.ts → workspace.getChangePreviewForWorkspace
   */
  getChangePreviewForWorkspace: (
    workspacePath: string,
    relativePath: string,
  ) => Promise<IpcResult<WorkspaceChangePreview>>;
  /**
   * 获取当前工作区的文件目录树
   * @returns 文件目录树节点数组
   * @command workspace_list_tree
   * @see tauri-bridge.ts → workspace.listTree
   * @see mock-bridge.ts → workspace.listTree
   * @see preview-bridge/index.ts → workspace.listTree
   */
  listTree: () => Promise<IpcResult<WorkspaceTreeNode[]>>;
  /**
   * 在当前工作区中搜索文件/内容
   * @param query 搜索关键词
   * @returns 搜索结果匹配项列表
   * @command workspace_search
   * @see tauri-bridge.ts → workspace.search
   * @see mock-bridge.ts → workspace.search
   * @see preview-bridge/index.ts → workspace.search
   */
  search: (query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
  /**
   * 获取文件大纲 (函数/类/结构等)
   * @param relativePath 相对于工作区的路径
   * @returns 文件大纲项列表
   * @command workspace_outline
   * @see tauri-bridge.ts → workspace.outline
   * @see mock-bridge.ts → workspace.outline
   * @see preview-bridge/index.ts → workspace.outline
   */
  outline: (relativePath: string) => Promise<IpcResult<FileOutlineItem[]>>;
  /**
   * 标记编辑器中的"脏"文件路径 (有未保存修改)
   * @param relativePaths 相对于工作区的路径数组
   * @returns 是否成功标记
   * @command workspace_set_editor_dirty_paths
   * @see tauri-bridge.ts → workspace.setEditorDirtyPaths
   * @see mock-bridge.ts → workspace.setEditorDirtyPaths
   * @see preview-bridge/index.ts → workspace.setEditorDirtyPaths
   */
  setEditorDirtyPaths: (relativePaths: string[]) => Promise<IpcResult<boolean>>;
  /**
   * 订阅工作区文件变更事件
   * @param listener 接收 WorkspaceFileChangedEvent 的回调函数
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://workspace-file-changed)
   * @see tauri-bridge.ts → workspace.onFileChanged
   * @see mock-bridge.ts → workspace.onFileChanged
   * @see preview-bridge/index.ts → workspace.onFileChanged
   */
  onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => void;
  /**
   * 重命名当前工作区内的文件
   * @param relativePath 相对于工作区的路径 (源文件)
   * @param newName 新的文件名 (不含路径)
   * @returns 是否重命名成功
   * @command workspace_rename_file
   * @see tauri-bridge.ts → workspace.renameFile
   * @see mock-bridge.ts → workspace.renameFile
   * @see preview-bridge/index.ts → workspace.renameFile
   */
  renameFile: (relativePath: string, newName: string) => Promise<IpcResult<boolean>>;
  /**
   * 删除当前工作区内的文件
   * @param relativePath 相对于工作区的路径
   * @returns 是否删除成功
   * @command workspace_delete_file
   * @see tauri-bridge.ts → workspace.deleteFile
   * @see mock-bridge.ts → workspace.deleteFile
   * @see preview-bridge/index.ts → workspace.deleteFile
   */
  deleteFile: (relativePath: string) => Promise<IpcResult<boolean>>;
  /**
   * 复制当前工作区内的文件
   * @param srcRelativePath 源文件相对路径
   * @param dstRelativePath 目标文件相对路径
   * @returns 是否复制成功
   * @command workspace_duplicate_file
   * @see tauri-bridge.ts → workspace.duplicateFile
   * @see mock-bridge.ts → workspace.duplicateFile
   * @see preview-bridge/index.ts → workspace.duplicateFile
   */
  duplicateFile: (srcRelativePath: string, dstRelativePath: string) => Promise<IpcResult<boolean>>;
  /**
   * 获取文件的绝对路径
   * @param relativePath 相对于工作区的路径
   * @returns 文件的绝对路径
   * @command workspace_get_absolute_path
   * @see tauri-bridge.ts → workspace.getAbsolutePath
   * @see mock-bridge.ts → workspace.getAbsolutePath
   * @see preview-bridge/index.ts → workspace.getAbsolutePath
   */
  getAbsolutePath: (relativePath: string) => Promise<IpcResult<string>>;
  /**
   * 移动文件到新路径
   * @param relativePath 源文件相对路径
   * @param newPath 目标文件相对路径
   * @returns 是否移动成功
   * @command workspace_move_file
   * @see tauri-bridge.ts → workspace.moveFile
   * @see mock-bridge.ts → workspace.moveFile
   * @see preview-bridge/index.ts → workspace.moveFile
   */
  moveFile: (relativePath: string, newPath: string) => Promise<IpcResult<boolean>>;
  /**
   * 获取当前工作区的 Git 状态快照
   * @returns Git 状态快照 (isRepo/staged/unstaged/untracked/conflicts)
   * @command workspace_get_git_status
   * @see tauri-bridge.ts → workspace.getGitStatus
   * @see mock-bridge.ts → workspace.getGitStatus
   * @see preview-bridge/index.ts → workspace.getGitStatus
   */
  getGitStatus: () => Promise<IpcResult<GitSnapshot>>;
  /**
   * 获取工作区的 Git 分支列表
   * @param rootPath 可选 — 指定工作区路径，默认使用当前活动工作区
   * @returns 本地/远程分支摘要列表
   * @command workspace_list_git_branches
   * @see tauri-bridge.ts → workspace.listGitBranches
   * @see mock-bridge.ts → workspace.listGitBranches
   * @see preview-bridge/index.ts → workspace.listGitBranches
   */
  listGitBranches: (rootPath?: string) => Promise<IpcResult<GitBranchSummary[]>>;
  /**
   * 切换 Git 分支
   * @param input 切换参数 (分支名称/工作区等)
   * @returns 切换后的工作区与 Git 状态
   * @command workspace_switch_git_branch
   * @see tauri-bridge.ts → workspace.switchGitBranch
   * @see mock-bridge.ts → workspace.switchGitBranch
   * @see preview-bridge/index.ts → workspace.switchGitBranch
   */
  switchGitBranch: (
    input: WorkspaceGitBranchSwitchInput,
  ) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
  /**
   * 创建新的 Git 分支
   * @param input 创建参数 (分支名称、基于的分支等)
   * @returns 创建后的工作区与 Git 状态
   * @command workspace_create_git_branch
   * @see tauri-bridge.ts → workspace.createGitBranch
   * @see mock-bridge.ts → workspace.createGitBranch
   * @see preview-bridge/index.ts → workspace.createGitBranch
   */
  createGitBranch: (
    input: WorkspaceGitBranchCreateInput,
  ) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
  /**
   * 暂存文件的更改
   * @param relativePath 相对于工作区的文件路径
   * @returns 是否成功
   * @command workspace_git_stage_file
   * @see tauri-bridge.ts → workspace.stageFile
   * @see mock-bridge.ts → workspace.stageFile
   * @see preview-bridge/index.ts → workspace.stageFile
   */
  stageFile: (relativePath: string, workspacePath?: string) => Promise<IpcResult<void>>;
  /**
   * 取消暂存文件的更改
   * @param relativePath 相对于工作区的文件路径
   * @param workspacePath 可选 — 指定工作区路径，默认使用当前活动工作区
   * @returns 是否成功
   * @command workspace_git_unstage_file
   * @see tauri-bridge.ts → workspace.unstageFile
   * @see mock-bridge.ts → workspace.unstageFile
   * @see preview-bridge/index.ts → workspace.unstageFile
   */
  unstageFile: (relativePath: string, workspacePath?: string) => Promise<IpcResult<void>>;
  /**
   * 放弃文件的更改 (还原为 HEAD 版本)
   * @param relativePath 相对于工作区的文件路径
   * @param workspacePath 可选 — 指定工作区路径，默认使用当前活动工作区
   * @returns 是否成功
   * @command workspace_git_discard_file
   * @see tauri-bridge.ts → workspace.discardFile
   * @see mock-bridge.ts → workspace.discardFile
   * @see preview-bridge/index.ts → workspace.discardFile
   */
  discardFile: (relativePath: string, workspacePath?: string) => Promise<IpcResult<void>>;
  /** Get commit statistics (serves calendar heatmap, clock heatmap, contributor activity, commit timeline) */
  gitVisCommitStats: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisCommitStats>>;
  /** Get code line evolution data */
  gitVisCodeEvolution: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisCodeEvolution>>;
  /** Get contributor-module change matrix */
  gitVisContributorModules: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisContributorModules>>;
  /** Get branch graph DAG data */
  gitVisBranchGraph: (rootPath: string) => Promise<IpcResult<GitVisBranchGraph>>;
  /** Get file sunburst tree data */
  gitVisFileSunburst: (rootPath: string) => Promise<IpcResult<GitVisFileSunburst>>;
  /** Get the year of the first commit in the repository */
  gitVisFirstCommitYear: (rootPath: string) => Promise<IpcResult<number | null>>;
}
