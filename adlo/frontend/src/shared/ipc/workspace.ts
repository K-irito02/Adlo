import type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  GitVisBranchGraph,
  GitVisCodeEvolution,
  GitVisCommitStats,
  GitVisContributorModules,
  GitVisFileHotspotFile,
  GitVisFileHotspotNode,
  GitVisFileHotspots,
  IpcResult,
  RecentWorkspaceEntry,
  WorktreeInfo,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceFilesChangedBatch,
  WorkspaceMediaDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchFilter,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
  WorkspaceTreeNode,
  WorkspaceTreePayload,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeEnsureResult,
  WorkspaceWorktreeRemoveInput,
} from '@adlo/kernel';

export type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  GitVisBranchGraph,
  GitVisCodeEvolution,
  GitVisCommitStats,
  GitVisContributorModules,
  GitVisFileHotspotFile,
  GitVisFileHotspotNode,
  GitVisFileHotspots,
  IpcResult,
  RecentWorkspaceEntry,
  WorktreeInfo,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceFilesChangedBatch,
  WorkspaceMediaDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchFilter,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
  WorkspaceTreeNode,
  WorkspaceTreePayload,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeEnsureResult,
  WorkspaceWorktreeRemoveInput,
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
   * 将指定路径登记为侧栏工作区（不切换当前工作区）。
   *
   * 保留能力：智能体文件链接**不再**走这条路径——未知工作区改用内存隐藏工作区
   * （见 ADR 0023），应用内当前无调用方。前后端契约仍保留（server route +
   * 三桥对齐），后续若确认无外部消费者可单独立项移除。
   * @param workspacePath 要登记为侧栏工作区的目录绝对路径
   * @returns 登记后的侧栏条目（含稳定工作区 id 与根路径）
   * @command POST /workspace/add (adl-server HTTP; no Tauri invoke)
   * @see httpBridge.ts → workspace.addToSidebar
   * @see mock/mock-workspace.ts → workspace.addToSidebar
   * @see preview-bridge/preview-workspace.ts → workspace.addToSidebar
   */
  addToSidebar: (workspacePath: string) => Promise<IpcResult<RecentWorkspaceEntry>>;
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
   * 获取指定工作区的文件目录树
   * @param workspacePath 工作区的绝对路径
   * @param options.force 为 true 时绕过服务端进程内缓存强制重新扫描（显式"刷新"用）
   * @param options.allowStale 为 true 时允许返回 SQLite 缓存行首包（stale-while-revalidate）
   * @returns 树载荷（树 + 是否来自缓存 + 行捕获时间）
   * @command workspace_list_tree
   * @see tauri-bridge.ts → workspace.listTreeForWorkspace
   * @see mock-bridge.ts → workspace.listTreeForWorkspace
   * @see preview-bridge/index.ts → workspace.listTreeForWorkspace
   */
  listTreeForWorkspace: (
    workspacePath: string,
    options?: { force?: boolean; allowStale?: boolean },
  ) => Promise<IpcResult<WorkspaceTreePayload>>;
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
   * 在当前工作区根目录初始化**本地** Git 仓库（幂等）。
   * 只创建 `.git`，不联网、不添加远程、不改动/删除/提交任何现有文件。
   * `workspacePath` 必须显式传入，避免多工作区下误初始化到其它工作区。
   * @param workspacePath 工作区的绝对路径
   * @returns 初始化后的 Git 状态快照
   * @command workspace_init_git_repo（HTTP: POST /workspace/git/init）
   * @see httpBridge.ts → workspace.initGitRepo
   * @see preview-bridge/preview-workspace.ts → workspace.initGitRepo
   * @see mock/mock-workspace.ts → workspace.initGitRepo
   */
  initGitRepo: (workspacePath: string) => Promise<IpcResult<GitSnapshot>>;
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
  createFile: (
    relativePath: string,
    content?: string,
    workspacePath?: string,
  ) => Promise<IpcResult<WorkspaceFileDocument>>;
  /**
   * 在当前工作区创建文件夹
   * @param relativePath 相对于工作区的路径 (包含目录名)
   * @returns 是否成功创建
   * @command workspace_create_folder
   * @see tauri-bridge.ts → workspace.createFolder
   * @see mock-bridge.ts → workspace.createFolder
   * @see preview-bridge/index.ts → workspace.createFolder
   */
  createFolder: (relativePath: string, workspacePath?: string) => Promise<IpcResult<boolean>>;
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
   * 读取当前工作区内的二进制/媒体文件（图片/音视频/办公文档）
   * @param relativePath 相对于工作区的路径
   * @returns base64 字节 + MIME + 体积及元信息（50 MiB 上限，超限返回 InvalidInput）
   * @command workspace_read_media_file（HTTP: POST /workspace/read-media）
   * @see tauri-bridge.ts → workspace.readMediaFile（继承 http 实现）
   * @see mock-bridge.ts → workspace.readMediaFile
   * @see preview-bridge/index.ts → workspace.readMediaFile
   */
  readMediaFile: (relativePath: string) => Promise<IpcResult<WorkspaceMediaDocument>>;
  /**
   * 读取指定工作区内的二进制/媒体文件
   * @param workspacePath 工作区的绝对路径
   * @param relativePath 相对于工作区的路径
   * @returns base64 字节 + MIME + 体积及元信息
   * @command workspace_read_media_file（HTTP: POST /workspace/read-media）
   * @see tauri-bridge.ts → workspace.readMediaFileForWorkspace（继承 http 实现）
   * @see mock-bridge.ts → workspace.readMediaFileForWorkspace
   * @see preview-bridge/index.ts → workspace.readMediaFileForWorkspace
   */
  readMediaFileForWorkspace: (
    workspacePath: string,
    relativePath: string,
  ) => Promise<IpcResult<WorkspaceMediaDocument>>;
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
   * @param options.force 为 true 时绕过服务端进程内缓存强制重新扫描（显式"刷新"用）
   * @param options.allowStale 为 true 时允许返回 SQLite 缓存行首包（stale-while-revalidate）
   * @returns 树载荷（树 + 是否来自缓存 + 行捕获时间）
   * @command workspace_list_tree
   * @see tauri-bridge.ts → workspace.listTree
   * @see mock-bridge.ts → workspace.listTree
   * @see preview-bridge/index.ts → workspace.listTree
   */
  listTree: (options?: {
    force?: boolean;
    allowStale?: boolean;
  }) => Promise<IpcResult<WorkspaceTreePayload>>;
  /**
   * 在当前工作区中搜索文件/内容
   * @param query 搜索关键词
   * @param window 分页窗口（可选）
   * @param filter 检索过滤器（可选）：手动忽略名单 + `.gitignore` 开关，并集生效
   * @param workspacePath 显式检索根（可选）：工作区绝对路径，缺省用后端当前激活工作区
   * @returns 搜索结果匹配项列表
   * @command workspace_search
   * @see tauri-bridge.ts → workspace.search
   * @see mock-bridge.ts → workspace.search
   * @see preview-bridge/index.ts → workspace.search
   */
  search: (
    query: string,
    window?: WorkspaceSearchWindow,
    filter?: WorkspaceSearchFilter,
    workspacePath?: string,
  ) => Promise<IpcResult<WorkspaceSearchPage>>;
  /**
   * 仅对给定相对路径集合重算命中（文件 watcher 驱动的局部刷新）
   * @param paths 工作区相对路径数组
   * @param query 检索关键词
   * @param window 分页窗口（可选）
   * @param filter 检索过滤器（可选）：与 `search` 同语义
   * @param workspacePath 显式检索根（可选）：与 `search` 同语义
   * @returns 这些文件中的命中列表
   * @command workspace_search_in_files
   * @see tauri-bridge.ts（...http 继承）→ workspace.searchInFiles
   * @see mock-bridge.ts → workspace.searchInFiles
   * @see preview-bridge/index.ts → workspace.searchInFiles
   */
  searchInFiles: (
    paths: string[],
    query: string,
    window?: WorkspaceSearchWindow,
    filter?: WorkspaceSearchFilter,
    workspacePath?: string,
  ) => Promise<IpcResult<WorkspaceSearchPage>>;
  /**
   * 订阅活动工作区的文件批量变更（后端 watcher → WS / 预览模式轮询）
   * @param listener 接收批次（changed/removed/overflow）的回调
   * @returns 同步取消订阅函数
   * @see tauri-bridge/index.ts（...http 继承）→ workspace.onFilesChanged
   * @see mock-bridge.ts → workspace.onFilesChanged
   * @see preview-bridge/index.ts → workspace.onFilesChanged
   */
  onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => () => void;
  /**
   * 声明订阅者关心的文件监听根集合（侧栏全部已添加工作区）。
   *
   * 桌面/HTTP 实现为 no-op：adl-server 自行按侧栏数据库派生监听集合并以
   * `rootPath` 标记批次。浏览器预览实现用它驱动多根轮询（预览模式没有
   * adl-server 侧栏可读）。
   * @param roots 工作区根路径数组（与 `recentWorkspaces[].path` 同源）
   * @see mock-bridge.ts → workspace.setFilesChangedRoots
   * @see preview-bridge/index.ts → workspace.setFilesChangedRoots
   */
  setFilesChangedRoots: (roots: string[]) => void;
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
  renameFile: (
    relativePath: string,
    newName: string,
    workspacePath?: string,
  ) => Promise<IpcResult<boolean>>;
  /**
   * 删除当前工作区内的文件
   * @param relativePath 相对于工作区的路径
   * @returns 是否删除成功
   * @command workspace_delete_file
   * @see tauri-bridge.ts → workspace.deleteFile
   * @see mock-bridge.ts → workspace.deleteFile
   * @see preview-bridge/index.ts → workspace.deleteFile
   */
  deleteFile: (relativePath: string, workspacePath?: string) => Promise<IpcResult<boolean>>;
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
  duplicateFile: (
    srcRelativePath: string,
    dstRelativePath: string,
    workspacePath?: string,
  ) => Promise<IpcResult<boolean>>;
  /**
   * 获取文件的绝对路径
   * @param relativePath 相对于工作区的路径
   * @returns 文件的绝对路径
   * @command workspace_get_absolute_path
   * @see tauri-bridge.ts → workspace.getAbsolutePath
   * @see mock-bridge.ts → workspace.getAbsolutePath
   * @see preview-bridge/index.ts → workspace.getAbsolutePath
   */
  getAbsolutePath: (relativePath: string, workspacePath?: string) => Promise<IpcResult<string>>;
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
  moveFile: (
    relativePath: string,
    newPath: string,
    workspacePath?: string,
  ) => Promise<IpcResult<boolean>>;
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
   * 覆盖写文件文本内容（Ctrl+S / 自动保存的落盘通道）
   * @returns 写后文档（含新 mtime）
   * @command workspace_update_file
   */
  updateFileContent: (
    relativePath: string,
    content: string,
    workspacePath?: string,
  ) => Promise<IpcResult<WorkspaceFileDocument>>;
  /**
   * 列出仓库的 worktree（主 + sibling 链接）
   * @param rootPath 可选 — 指定仓库路径，默认当前活动工作区
   * @command workspace_list_worktrees
   * @see httpBridge.ts → workspace.listWorktrees
   * @see mock-bridge.ts → workspace.listWorktrees
   * @see preview-bridge/preview-git.ts → workspace.listWorktrees
   */
  listWorktrees: (rootPath?: string) => Promise<IpcResult<WorktreeInfo[]>>;
  /**
   * 确保分支的 sibling worktree 存在并应用切换模式
   * @param input 分支名 + 模式(local/remote/sync) + stash 确认
   * @param workspacePath 可选 — 主仓路径，默认当前活动工作区
   * @returns worktree 路径（聚焦/openWorkspace 由调用方完成，走正常 bootstrap 全量刷新）
   * @command workspace_ensure_worktree
   * @see httpBridge.ts → workspace.ensureWorktree
   * @see mock-bridge.ts → workspace.ensureWorktree
   * @see preview-bridge/preview-git.ts → workspace.ensureWorktree
   */
  ensureWorktree: (
    input: WorkspaceWorktreeEnsureInput,
    workspacePath?: string,
  ) => Promise<IpcResult<WorkspaceWorktreeEnsureResult>>;
  /**
   * 删除分支的 sibling worktree（主 worktree 拒绝删除）
   * @command workspace_remove_worktree
   */
  removeWorktree: (
    input: WorkspaceWorktreeRemoveInput,
    workspacePath?: string,
  ) => Promise<IpcResult<void>>;
  /** 清理失效的 worktree 元数据（prune） */
  pruneWorktrees: (workspacePath?: string) => Promise<IpcResult<void>>;
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
  /**
   * 暂存全部更改（含未跟踪）。工作区文件夹菜单「暂存全部」。
   * @see httpBridge.ts → workspace.stageAllFiles（POST /workspace/git/stage-all）
   * @see preview-bridge/index.ts → workspace.stageAllFiles
   */
  stageAllFiles: (workspacePath: string) => Promise<IpcResult<void>>;
  /** 取消暂存全部更改。菜单「取消暂存」（POST /workspace/git/unstage-all）。 */
  unstageAllFiles: (workspacePath: string) => Promise<IpcResult<void>>;
  /** 放弃全部本地更改（已跟踪 restore + 未跟踪 clean，不可恢复）。POST /workspace/git/discard-all。 */
  discardAllFiles: (workspacePath: string) => Promise<IpcResult<void>>;
  /** 提交已暂存内容；空消息由服务端拒绝。POST /workspace/git/commit。 */
  commitChanges: (message: string, workspacePath: string) => Promise<IpcResult<void>>;
  /** 推送当前分支；无 upstream 时自动 `-u` 建立跟踪。POST /workspace/git/push。 */
  pushChanges: (workspacePath: string) => Promise<IpcResult<void>>;
  /** 仅快进拉取（`git pull --ff-only`）。POST /workspace/git/pull。 */
  pullChanges: (workspacePath: string) => Promise<IpcResult<void>>;
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
  /** Get file hotspots (tree + flat files) based on git log --numstat */
  gitVisFileHotspots: (
    rootPath: string,
    since?: string,
    until?: string,
  ) => Promise<IpcResult<GitVisFileHotspots>>;
  /** Get the year of the first commit in the repository */
  gitVisFirstCommitYear: (rootPath: string) => Promise<IpcResult<number | null>>;
}
