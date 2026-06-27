import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  CheckpointPayloadPreview,
  CommandRequest,
  CommandRunResult,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  HealthSnapshot,
  IpcResult,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  RecentWorkspaceEntry,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  RepoMapNode,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  TaskCenterSnapshot,
  ApprovalRequestSummary,
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

export enum IpcErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  STORAGE_ERROR = 'STORAGE_ERROR',
  WORKSPACE_ERROR = 'WORKSPACE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  IO_ERROR = 'IO_ERROR',
  MIGRATION_ERROR = 'MIGRATION_ERROR',
  SECURITY_ERROR = 'SECURITY_ERROR',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  PATCH_ERROR = 'PATCH_ERROR',
  TERMINAL_ERROR = 'TERMINAL_ERROR',
  MODEL_ERROR = 'MODEL_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVOKE_ERROR = 'INVOKE_ERROR',
  PREVIEW_API_ERROR = 'PREVIEW_API_ERROR',
}

export function createIpcError(code: IpcErrorCode, message: string) {
  return { code, message };
}

export interface PtySessionInfo {
  sessionId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: 'Running' | 'Terminated';
  output?: string;
}

export interface PtyOutputEvent {
  sessionId: string;
  data: string;
}

// ============================================
// Digital Life Bridge - 拆分为子接口 + 组合
// ============================================

/**
 * 窗口控制相关桥接能力
 * 用于: 控制应用窗口最小化/最大化/关闭/标题更新
 * Tauri 命令: 直接使用 window API
 * 浏览器模式: 无操作 UI 模拟
 */
export interface WindowBridge {
  /**
   * 最小化窗口
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.minimize
   * @see mock-bridge.ts → window.minimize
   * @see preview-bridge/index.ts → window.minimize
   */
  minimize: () => Promise<void>;
  /**
   * 切换最大化状态
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.maximize
   * @see mock-bridge.ts → window.maximize
   * @see preview-bridge/index.ts → window.maximize
   */
  maximize: () => Promise<void>;
  /**
   * 关闭窗口
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.close
   * @see mock-bridge.ts → window.close
   * @see preview-bridge/index.ts → window.close
   */
  close: () => Promise<void>;
  /**
   * 查询当前窗口是否处于最大化状态
   * @returns 窗口是否最大化
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.isMaximized
   * @see mock-bridge.ts → window.isMaximized
   * @see preview-bridge/index.ts → window.isMaximized
   */
  isMaximized: () => Promise<boolean>;
  /**
   * 更新窗口标题
   * @param title 新的窗口标题
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.setTitle
   * @see mock-bridge.ts → window.setTitle
   * @see preview-bridge/index.ts → window.setTitle
   */
  setTitle: (title: string) => Promise<void>;
  /**
   * 订阅窗口大小变化事件 (包括最大化/还原)
   * @param listener 窗口大小变化时的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过 Tauri window.onResized API)
   * @see tauri-bridge.ts → window.onResized
   * @see mock-bridge.ts → window.onResized
   * @see preview-bridge/index.ts → 继承 mock-bridge
   */
  onResized: (listener: () => void) => () => void;
}

/**
 * 应用信息与健康状态桥接能力
 * 用于: 获取应用名称、版本、配置、当前工作区、健康状态、诊断信息、模型网关状态
 * Tauri 命令: app_get_info / app_get_health / app_get_diagnostics / app_get_model_health / app_update_preferences
 * 浏览器模式: 返回静态 mock 数据
 */
export interface AppBridge {
  /**
   * 获取应用信息
   * @returns 应用名称、版本、配置、当前工作区等信息
   * @command app_get_info
   * @see tauri-bridge.ts → app.getInfo
   * @see mock-bridge.ts → app.getInfo
   * @see preview-bridge/index.ts → app.getInfo
   */
  getInfo: () => Promise<IpcResult<AppInfo>>;
  /**
   * 获取应用健康状态
   * @returns 各组件 (main/worker/storage/recovery/migration) 的健康状态
   * @command app_get_health
   * @see tauri-bridge.ts → app.getHealth
   * @see mock-bridge.ts → app.getHealth
   * @see preview-bridge/index.ts → app.getHealth
   */
  getHealth: () => Promise<IpcResult<HealthSnapshot>>;
  /**
   * 获取运行时诊断信息
   * @returns 生命周期、迁移状态、事件统计、最近错误等诊断快照
   * @command app_get_diagnostics
   * @see tauri-bridge.ts → app.getDiagnostics
   * @see mock-bridge.ts → app.getDiagnostics
   * @see preview-bridge/index.ts → app.getDiagnostics
   */
  getDiagnostics: () => Promise<IpcResult<RuntimeDiagnosticsSnapshot>>;
  /**
   * 获取模型网关健康状态
   * @returns 模型服务提供商的可用性与延迟信息
   * @command app_get_model_health
   * @see tauri-bridge.ts → app.getModelHealth
   * @see mock-bridge.ts → app.getModelHealth
   * @see preview-bridge/index.ts → app.getModelHealth
   */
  getModelHealth: () => Promise<IpcResult<ModelGatewayHealthSnapshot>>;
  /**
   * 更新应用偏好设置
   * @param patch 对现有配置的增量修改
   * @returns 更新后的完整应用信息
   * @command app_update_preferences
   * @see tauri-bridge.ts → app.updatePreferences
   * @see mock-bridge.ts → app.updatePreferences
   * @see preview-bridge/index.ts → app.updatePreferences
   */
  updatePreferences: (patch: AppPreferencePatch) => Promise<IpcResult<AppInfo>>;
}

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
    relativePath: string
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
    relativePath: string
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
   * 获取当前工作区的 Git 分支列表
   * @returns 本地/远程分支摘要列表
   * @command workspace_list_git_branches
   * @see tauri-bridge.ts → workspace.listGitBranches
   * @see mock-bridge.ts → workspace.listGitBranches
   * @see preview-bridge/index.ts → workspace.listGitBranches
   */
  listGitBranches: () => Promise<IpcResult<GitBranchSummary[]>>;
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
    input: WorkspaceGitBranchSwitchInput
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
    input: WorkspaceGitBranchCreateInput
  ) => Promise<IpcResult<WorkspaceGitBranchChangeResult>>;
}

/**
 * 内容索引与检索桥接能力
 * 用于: 获取检索状态快照、代码仓库映射、重建索引
 * Tauri 命令: retrieval_get_status / retrieval_rebuild_index
 * 浏览器模式: 前端从当前 workspace 的文件列表构建
 */
export interface RetrievalBridge {
  /**
   * 获取当前工作区的检索索引状态
   * @returns 检索状态快照 (含 repoMap 条目等)
   * @command retrieval_get_status
   * @see tauri-bridge.ts → retrieval.getStatus
   * @see mock-bridge.ts → retrieval.getStatus
   * @see preview-bridge/index.ts → retrieval.getStatus
   */
  getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  /**
   * 获取仓库代码结构的树状映射
   * @returns 从 repoMap 条目转换来的树节点数组
   * @command 无独立命令 (调用 retrieval_get_status 并在前端转换)
   * @see tauri-bridge.ts → retrieval.getRepoMap
   * @see mock-bridge.ts → retrieval.getRepoMap
   * @see preview-bridge/index.ts → retrieval.getRepoMap
   */
  getRepoMap: () => Promise<IpcResult<RepoMapNode[]>>;
  /**
   * 触发重建当前工作区的检索索引
   * @returns 是否成功触发索引重建
   * @command retrieval_rebuild_index
   * @see tauri-bridge.ts → retrieval.rebuildIndex
   * @see mock-bridge.ts → retrieval.rebuildIndex
   * @see preview-bridge/index.ts → retrieval.rebuildIndex
   */
  rebuildIndex: () => Promise<IpcResult<boolean>>;
}

/**
 * 对话会话管理桥接能力
 * 用于: 创建/列出/获取/重命名/置顶/归档/删除会话、发送消息、取消消息
 * Tauri 命令: conversation_* 系列
 * 浏览器模式: 前端本地存储 mock 数据
 */
export interface ConversationBridge {
  /**
   * 创建新对话会话
   * @param title 会话标题 (可选)
   * @param workspaceId 关联工作区 ID (可选)
   * @returns 新建会话的记录
   * @command conversation_create_session
   * @see tauri-bridge.ts → conversation.createSession
   * @see mock-bridge.ts → conversation.createSession
   * @see preview-bridge/index.ts → conversation.createSession
   */
  createSession: (
    title?: string,
    workspaceId?: string
  ) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 列出所有对话会话
   * @returns 会话记录列表
   * @command conversation_list_sessions
   * @see tauri-bridge.ts → conversation.listSessions
   * @see mock-bridge.ts → conversation.listSessions
   * @see preview-bridge/index.ts → conversation.listSessions
   */
  listSessions: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 获取单个会话的详细信息 (含消息)
   * @param sessionId 会话 ID
   * @returns 会话详情或 undefined (未找到)
   * @command conversation_get_session
   * @see tauri-bridge.ts → conversation.getSession
   * @see mock-bridge.ts → conversation.getSession
   * @see preview-bridge/index.ts → conversation.getSession
   */
  getSession: (sessionId: string) => Promise<IpcResult<ConversationDetail | undefined>>;
  /**
   * 重命名会话
   * @param input 包含会话 ID 和新标题
   * @returns 更新后的会话记录
   * @command conversation_rename_session
   * @see tauri-bridge.ts → conversation.renameSession
   * @see mock-bridge.ts → conversation.renameSession
   * @see preview-bridge/index.ts → conversation.renameSession
   */
  renameSession: (input: {
    sessionId: string;
    title: string;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 置顶会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_pin_session
   * @see tauri-bridge.ts → conversation.pinSession
   * @see mock-bridge.ts → conversation.pinSession
   * @see preview-bridge/index.ts → conversation.pinSession
   */
  pinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 取消置顶会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_unpin_session
   * @see tauri-bridge.ts → conversation.unpinSession
   * @see mock-bridge.ts → conversation.unpinSession
   * @see preview-bridge/index.ts → conversation.unpinSession
   */
  unpinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 对会话列表进行重排序
   * @param input 置顶/非置顶会话的 ID 顺序数组
   * @returns 重排序后的会话列表
   * @command conversation_reorder_sessions
   * @see tauri-bridge.ts → conversation.reorderSessions
   * @see mock-bridge.ts → conversation.reorderSessions
   * @see preview-bridge/index.ts → conversation.reorderSessions
   */
  reorderSessions: (input: ReorderSessionsInput) => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 标记会话为已读
   * @param input 会话 ID 和可选读取时间戳
   * @returns 更新后的会话记录
   * @command conversation_mark_session_read
   * @see tauri-bridge.ts → conversation.markSessionRead
   * @see mock-bridge.ts → conversation.markSessionRead
   * @see preview-bridge/index.ts → conversation.markSessionRead
   */
  markSessionRead: (input: {
    sessionId: string;
    readAt?: number;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 标记会话为未读
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_mark_session_unread
   * @see tauri-bridge.ts → conversation.markSessionUnread
   * @see mock-bridge.ts → conversation.markSessionUnread
   * @see preview-bridge/index.ts → conversation.markSessionUnread
   */
  markSessionUnread: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 归档会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_archive_session
   * @see tauri-bridge.ts → conversation.archiveSession
   * @see mock-bridge.ts → conversation.archiveSession
   * @see preview-bridge/index.ts → conversation.archiveSession
   */
  archiveSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 归档当前工作区内所有会话
   * @returns 更新后的会话记录列表
   * @command conversation_archive_all_in_workspace
   * @see tauri-bridge.ts → conversation.archiveAllInWorkspace
   * @see mock-bridge.ts → conversation.archiveAllInWorkspace
   * @see preview-bridge/index.ts → conversation.archiveAllInWorkspace
   */
  archiveAllInWorkspace: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 删除会话
   * @param sessionId 会话 ID
   * @returns 是否删除成功
   * @command conversation_delete_session
   * @see tauri-bridge.ts → conversation.deleteSession
   * @see mock-bridge.ts → conversation.deleteSession
   * @see preview-bridge/index.ts → conversation.deleteSession
   */
  deleteSession: (sessionId: string) => Promise<IpcResult<boolean>>;
  /**
   * 在会话中发送消息
   * @param input 会话 ID、消息内容、场景 (chat/plan/code-edit)
   * @returns 消息发送结果 (可能触发 Agent run)
   * @command conversation_send_message
   * @see tauri-bridge.ts → conversation.sendMessage
   * @see mock-bridge.ts → conversation.sendMessage
   * @see preview-bridge/index.ts → conversation.sendMessage
   */
  sendMessage: (input: {
    sessionId: string;
    content: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
  }) => Promise<IpcResult<ConversationSendResult>>;
  /**
   * 取消正在处理的消息
   * @param runId Agent 运行 ID
   * @returns 取消后的 Agent 运行详情或 undefined
   * @command conversation_cancel_message
   * @see tauri-bridge.ts → conversation.cancelMessage
   * @see mock-bridge.ts → conversation.cancelMessage
   * @see preview-bridge/index.ts → conversation.cancelMessage
   */
  cancelMessage: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}

/**
 * Agent 运行控制桥接能力
 * 用于: 启动/获取/重试/中止 Agent 运行
 * Tauri 命令: agent_* 系列
 * 浏览器模式: 前端本地模拟运行
 */
export interface AgentBridge {
  /**
   * 启动 Agent 运行
   * @param input 会话 ID、用户提示词、场景 (chat/plan/code-edit)
   * @returns 运行启动结果 (含 runId)
   * @command agent_start_run
   * @see tauri-bridge.ts → agent.startRun
   * @see mock-bridge.ts → agent.startRun
   * @see preview-bridge/index.ts → agent.startRun
   */
  startRun: (input: {
    sessionId: string;
    prompt: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
  }) => Promise<IpcResult<ConversationSendResult>>;
  /**
   * 获取 Agent 运行详情
   * @param runId Agent 运行 ID
   * @returns 运行详情或 undefined (未找到)
   * @command agent_get_run
   * @see tauri-bridge.ts → agent.getRun
   * @see mock-bridge.ts → agent.getRun
   * @see preview-bridge/index.ts → agent.getRun
   */
  getRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  /**
   * 重试失败或取消的 Agent 运行
   * @param runId Agent 运行 ID
   * @returns 重试后的运行详情或 undefined
   * @command agent_retry_run
   * @see tauri-bridge.ts → agent.retryRun
   * @see mock-bridge.ts → agent.retryRun
   * @see preview-bridge/index.ts → agent.retryRun
   */
  retryRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  /**
   * 中止正在进行的 Agent 运行
   * @param runId Agent 运行 ID
   * @returns 中止后的运行详情或 undefined
   * @command agent_abort_run
   * @see tauri-bridge.ts → agent.abortRun
   * @see mock-bridge.ts → agent.abortRun
   * @see preview-bridge/index.ts → agent.abortRun
   */
  abortRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}

/**
 * 补丁/Patch 管理桥接能力
 * 用于: 获取 patch 集、决策单个 hunk、应用/回滚 patch
 * Tauri 命令: patch_* 系列
 * 浏览器模式: 前端本地模拟
 */
export interface PatchBridge {
  /**
   * 获取指定 patch 集详情
   * @param patchSetId patch 集 ID
   * @returns patch 集详情或 undefined (未找到)
   * @command patch_get_patch_set
   * @see tauri-bridge.ts → patch.getPatchSet
   * @see mock-bridge.ts → patch.getPatchSet
   * @see preview-bridge/index.ts → patch.getPatchSet
   */
  getPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet | undefined>>;
  /**
   * 对单个 hunk 做出决策 (accepted/rejected/pending)
   * @param input patchSetId、hunkId、决策状态
   * @returns 更新后的 patch 集
   * @command patch_set_hunk_decision
   * @see tauri-bridge.ts → patch.setHunkDecision
   * @see mock-bridge.ts → patch.setHunkDecision
   * @see preview-bridge/index.ts → patch.setHunkDecision
   */
  setHunkDecision: (input: {
    patchSetId: string;
    hunkId: string;
    decision: 'pending' | 'accepted' | 'rejected';
  }) => Promise<IpcResult<PatchSet>>;
  /**
   * 应用整个 patch 集到工作区文件
   * @param patchSetId patch 集 ID
   * @returns 应用结果 (成功/失败/变更的文件数等)
   * @command patch_apply_patch_set
   * @see tauri-bridge.ts → patch.applyPatchSet
   * @see mock-bridge.ts → patch.applyPatchSet
   * @see preview-bridge/index.ts → patch.applyPatchSet
   */
  applyPatchSet: (patchSetId: string) => Promise<IpcResult<PatchApplicationResult>>;
  /**
   * 回滚已应用的 patch 集
   * @param patchSetId patch 集 ID
   * @returns 回滚后的 patch 集状态
   * @command patch_rollback_patch_set
   * @see tauri-bridge.ts → patch.rollbackPatchSet
   * @see mock-bridge.ts → patch.rollbackPatchSet
   * @see preview-bridge/index.ts → patch.rollbackPatchSet
   */
  rollbackPatchSet: (patchSetId: string) => Promise<IpcResult<PatchSet>>;
}

/**
 * 命令执行桥接能力
 * 用于: 执行系统命令、查询最近执行的命令
 * Tauri 命令: command_run / command_list_recent
 * 浏览器模式: 前端本地模拟
 */
export interface CommandBridge {
  /**
   * 执行系统命令
   * @param input 命令路径、参数数组、是否使用 shell
   * @returns 命令执行结果 (含状态/任务 ID/请求详情)
   * @command command_run
   * @see tauri-bridge.ts → command.run
   * @see mock-bridge.ts → command.run
   * @see preview-bridge/index.ts → command.run
   */
  run: (input: {
    command: string;
    args: string[];
    shell?: boolean;
  }) => Promise<IpcResult<CommandRunResult>>;
  /**
   * 列出最近执行的命令
   * @param limit 返回结果数量上限 (可选)
   * @returns 最近执行的命令请求列表
   * @command command_list_recent
   * @see tauri-bridge.ts → command.listRecent
   * @see mock-bridge.ts → command.listRecent
   * @see preview-bridge/index.ts → command.listRecent
   */
  listRecent: (limit?: number) => Promise<IpcResult<CommandRequest[]>>;
}

/**
 * PTY (伪终端) 会话管理桥接能力
 * 用于: 创建 PTY 会话、发送输入、调整大小、结束会话、列出会话
 * Tauri 命令: pty_* 系列
 * 浏览器模式: 前端本地模拟或预览 API
 */
export interface PtyBridge {
  /**
   * 创建新的 PTY 会话
   * @param input shell 路径、工作目录、终端列数、行数
   * @returns 新建会话的 ID
   * @command pty_create
   * @see tauri-bridge.ts → pty.create
   * @see mock-bridge.ts → pty.create
   * @see preview-bridge/index.ts → pty.create
   */
  create: (input: {
    shell?: string;
    cwd?: string;
    cols: number;
    rows: number;
  }) => Promise<IpcResult<{ sessionId: string }>>;
  /**
   * 向 PTY 会话发送输入
   * @param sessionId PTY 会话 ID
   * @param data 输入数据 (按键/命令)
   * @returns 是否成功发送
   * @command pty_input
   * @see tauri-bridge.ts → pty.input
   * @see mock-bridge.ts → pty.input
   * @see preview-bridge/index.ts → pty.input
   */
  input: (sessionId: string, data: string) => Promise<IpcResult<boolean>>;
  /**
   * 调整 PTY 会话的终端大小
   * @param sessionId PTY 会话 ID
   * @param cols 新的列数
   * @param rows 新的行数
   * @returns 是否成功调整
   * @command pty_resize
   * @see tauri-bridge.ts → pty.resize
   * @see mock-bridge.ts → pty.resize
   * @see preview-bridge/index.ts → pty.resize
   */
  resize: (sessionId: string, cols: number, rows: number) => Promise<IpcResult<boolean>>;
  /**
   * 结束 PTY 会话 (杀掉子进程)
   * @param sessionId PTY 会话 ID
   * @returns 是否成功结束
   * @command pty_kill
   * @see tauri-bridge.ts → pty.kill
   * @see mock-bridge.ts → pty.kill
   * @see preview-bridge/index.ts → pty.kill
   */
  kill: (sessionId: string) => Promise<IpcResult<boolean>>;
  /**
   * 列出当前活跃的 PTY 会话
   * @returns PTY 会话信息列表 (sessionId/shell/cwd/状态等)
   * @command pty_list
   * @see tauri-bridge.ts → pty.list
   * @see mock-bridge.ts → pty.list
   * @see preview-bridge/index.ts → pty.list
   */
  list: () => Promise<IpcResult<PtySessionInfo[]>>;
}

/**
 * 任务中心与审批管理桥接能力
 * 用于: 获取任务快照、列出待审批项、检查点预览/恢复、审批决策、审计日志
 * Tauri 命令: task_* 系列
 * 浏览器模式: 前端本地模拟
 */
export interface TaskBridge {
  /**
   * 获取当前任务中心快照
   * @returns 任务、审批项、检查点的完整快照
   * @command task_get_snapshot
   * @see tauri-bridge.ts → task.getSnapshot
   * @see mock-bridge.ts → task.getSnapshot
   * @see preview-bridge/index.ts → task.getSnapshot
   */
  getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 列出待审批请求
   * @returns 待审批请求摘要列表
   * @command task_list_pending_approvals
   * @see tauri-bridge.ts → task.listPendingApprovals
   * @see mock-bridge.ts → task.listPendingApprovals
   * @see preview-bridge/index.ts → task.listPendingApprovals
   */
  listPendingApprovals?: () => Promise<IpcResult<ApprovalRequestSummary[]>>;
  /**
   * 获取检查点 payload 的预览内容
   * @param checkpointId 检查点 ID
   * @returns 检查点预览内容或 undefined (未找到)
   * @command task_get_checkpoint_preview
   * @see tauri-bridge.ts → task.getCheckpointPreview
   * @see mock-bridge.ts → task.getCheckpointPreview
   * @see preview-bridge/index.ts → task.getCheckpointPreview
   */
  getCheckpointPreview: (
    checkpointId: string
  ) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
  /**
   * 将工作区恢复到指定检查点状态
   * @param checkpointId 检查点 ID
   * @returns 恢复后的任务中心快照
   * @command task_restore_checkpoint
   * @see tauri-bridge.ts → task.restoreCheckpoint
   * @see mock-bridge.ts → task.restoreCheckpoint
   * @see preview-bridge/index.ts → task.restoreCheckpoint
   */
  restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 对审批请求做出决策 (approved/rejected)
   * @param input 审批 ID、决策、可选原因
   * @returns 更新后的任务中心快照
   * @command task_decide_approval
   * @see tauri-bridge.ts → task.decideApproval
   * @see mock-bridge.ts → task.decideApproval
   * @see preview-bridge/index.ts → task.decideApproval
   */
  decideApproval: (input: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 列出审计日志条目
   * @param limit 返回结果数量上限 (可选)
   * @returns 审计日志条目列表 (按时间倒序)
   * @command task_list_audit_entries
   * @see tauri-bridge.ts → task.listAuditEntries
   * @see mock-bridge.ts → task.listAuditEntries
   * @see preview-bridge/index.ts → task.listAuditEntries
   */
  listAuditEntries: (limit?: number) => Promise<IpcResult<AuditEntry[]>>;
}

/**
 * Agent 运行活动日志桥接能力
 * 用于: 查询指定 Agent run 的活动日志流
 * Tauri 命令: run_activity_list_by_run_id
 * 浏览器模式: 前端本地模拟或空数据
 */
export interface RunActivityBridge {
  /**
   * 获取指定 Agent run 的活动事件日志
   * @param runId Agent 运行 ID
   * @param limit 返回结果数量上限 (可选)
   * @returns 按时间排序的运行活动事件列表
   * @command run_activity_list_by_run_id
   * @see tauri-bridge.ts → runActivity.listByRunId
   * @see mock-bridge.ts → runActivity.listByRunId
   * @see preview-bridge/index.ts → runActivity.listByRunId
   */
  listByRunId: (
    runId: string,
    limit?: number
  ) => Promise<IpcResult<DigitalLifeRunActivityEventV1[]>>;
}

/**
 * 浏览器/预览面板桥接能力
 * 用于: 导航到 URL、前进/后退/刷新、订阅 URL 变更事件
 * Tauri 命令: browser_navigate / browser_go_back / browser_go_forward / browser_reload
 * 浏览器模式: 前端模拟无实际效果
 */
export interface PageMeta {
  title: string;
  favicon: string;
  url: string;
}

export interface AudioStatePayload {
  tabId: string;
  isPlaying?: boolean;
  isMuted: boolean;
}

export interface BrowserBridge {
  /** Create a WebView for a specific tab. Returns evicted tab_id if pool was full. */
  createForTab: (tabId: string, url: string) => Promise<string | null>;
  /** Activate tab: show its WebView, hide others, update LRU. */
  activateTab: (tabId: string) => Promise<void>;
  /** Destroy a tab's WebView (on tab close). */
  destroyTab: (tabId: string) => Promise<void>;
  /** Navigate a specific tab's WebView. */
  navigateTab: (tabId: string, url: string) => Promise<void>;
  /** Set bounds for a specific tab's WebView. */
  setTabBounds: (
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => Promise<void>;
  /** Go back in a specific tab */
  goBackTab: (tabId: string) => Promise<boolean>;
  /** Go forward in a specific tab */
  goForwardTab: (tabId: string) => Promise<boolean>;
  /** Reload a specific tab */
  reloadTab: (tabId: string) => Promise<void>;
  /** Subscribe to URL changes (global event) */
  onUrlChanged: (listener: (url: string) => void) => () => void;
  /** Subscribe to page meta changes */
  onMetaChanged: (listener: (meta: PageMeta) => void) => () => void;
  /** Mute or unmute a tab */
  muteTab: (tabId: string, muted: boolean) => Promise<void>;
  /** Subscribe to audio state changes */
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
}

/**
 * Digital Life 全局桥接接口 - 汇总所有子能力
 * 用于: 作为 window.digitalLife 的类型, 提供事件订阅与各子模块访问入口
 * 实现: tauri-bridge.ts (Tauri 应用), mock-bridge.ts (浏览器 mock), preview-bridge (预览模式)
 */
export interface DigitalLifeBridge {
  /**
   * 订阅模型输出流事件
   * @param listener 接收模型流式事件 (token/event) 的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://model-stream)
   * @see tauri-bridge.ts → subscribeModelStream
   * @see mock-bridge.ts → subscribeModelStream
   * @see preview-bridge/index.ts → subscribeModelStream
   */
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  /**
   * 订阅 Agent 运行活动流事件
   * @param listener 接收运行活动事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://run-activity)
   * @see tauri-bridge.ts → subscribeRunActivity
   * @see mock-bridge.ts → subscribeRunActivity
   * @see preview-bridge/index.ts → subscribeRunActivity
   */
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  /**
   * 订阅终端输出流事件
   * @param listener 接收终端流式事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://terminal-stream)
   * @see tauri-bridge.ts → subscribeTerminalStream
   * @see mock-bridge.ts → subscribeTerminalStream
   * @see preview-bridge/index.ts → subscribeTerminalStream
   */
  subscribeTerminalStream: (
    listener: (event: DigitalLifeTerminalStreamEventV1) => void
  ) => () => void;
  /**
   * 订阅 PTY 终端输出事件
   * @param listener 接收 PTY 输出事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://pty-output)
   * @see tauri-bridge.ts → subscribePtyOutput
   * @see mock-bridge.ts → subscribePtyOutput
   * @see preview-bridge/index.ts → subscribePtyOutput
   */
  subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => () => void;
  /** 窗口控制子模块 */
  window: WindowBridge;
  /** 应用信息与健康状态子模块 */
  app: AppBridge;
  /** 工作区管理子模块 */
  workspace: WorkspaceBridge;
  /** 内容索引与检索子模块 */
  retrieval: RetrievalBridge;
  /** 对话会话管理子模块 */
  conversation: ConversationBridge;
  /** Agent 运行控制子模块 */
  agent: AgentBridge;
  /** 补丁管理子模块 */
  patch: PatchBridge;
  /** 命令执行子模块 */
  command: CommandBridge;
  /** PTY 终端子模块 */
  pty: PtyBridge;
  /** 任务中心与审批子模块 */
  task: TaskBridge;
  /** 运行活动日志子模块 */
  runActivity: RunActivityBridge;
  /** 浏览器预览子模块 */
  browser: BrowserBridge;
  /** GitHub 集成子模块 (与 ci 共用同一接口) */
  github: GitHubBridge;
  /** CI 状态子模块 (与 github 共用同一接口) */
  ci: GitHubBridge;
}

/**
 * GitHub/CI 集成桥接能力
 * 用于: 获取 GitHub Actions/CI 运行状态、配置访问令牌、获取作业日志
 * Tauri 命令: ci_* 系列
 * 浏览器模式: 前端本地模拟 (localStorage 存 token)
 */
export interface GitHubBridge {
  /**
   * 获取指定仓库的 CI 运行状态 (需 token)
   * @param config 仓库配置 (owner/repo/branch/workflowId/accessToken)
   * @returns CI 状态快照 (最新运行、作业、错误等)
   * @command ci_get_status
   * @see tauri-bridge.ts → ci.getStatus / github.getStatus
   * @see mock-bridge.ts → ci.getStatus / github.getStatus
   * @see preview-bridge/index.ts → ci.getStatus / github.getStatus
   */
  getStatus: (config: CiRepoConfig) => Promise<IpcResult<CiStatusSnapshot>>;
  /**
   * 获取指定仓库的 CI 运行状态 (无需 token, 公开仓库)
   * @param owner 仓库组织/用户名
   * @param repo 仓库名
   * @param branch 分支名
   * @returns CI 状态快照
   * @command ci_get_status_without_token
   * @see tauri-bridge.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   * @see mock-bridge.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   * @see preview-bridge/index.ts → ci.getStatusWithoutToken / github.getStatusWithoutToken
   */
  getStatusWithoutToken: (
    owner: string,
    repo: string,
    branch: string
  ) => Promise<IpcResult<CiStatusSnapshot>>;
  /**
   * 保存 GitHub/CI 访问令牌
   * @param token GitHub personal access token
   * @returns 是否成功保存
   * @command ci_set_access_token
   * @see tauri-bridge.ts → ci.setAccessToken / github.setAccessToken
   * @see mock-bridge.ts → ci.setAccessToken / github.setAccessToken
   * @see preview-bridge/index.ts → ci.setAccessToken / github.setAccessToken
   */
  setAccessToken: (token: string) => Promise<IpcResult<boolean>>;
  /**
   * 清除已保存的 GitHub/CI 访问令牌
   * @returns 是否成功清除
   * @command ci_clear_access_token
   * @see tauri-bridge.ts → ci.clearAccessToken / github.clearAccessToken
   * @see mock-bridge.ts → ci.clearAccessToken / github.clearAccessToken
   * @see preview-bridge/index.ts → ci.clearAccessToken / github.clearAccessToken
   */
  clearAccessToken: () => Promise<IpcResult<boolean>>;
  /**
   * 检查是否已配置 GitHub/CI 访问令牌
   * @returns 是否存在有效令牌
   * @command ci_has_access_token
   * @see tauri-bridge.ts → ci.hasAccessToken / github.hasAccessToken
   * @see mock-bridge.ts → ci.hasAccessToken / github.hasAccessToken
   * @see preview-bridge/index.ts → ci.hasAccessToken / github.hasAccessToken
   */
  hasAccessToken: () => Promise<IpcResult<boolean>>;
  /**
   * 获取 CI 运行的作业日志
   * @param config 仓库配置
   * @param runId CI 运行 ID
   * @returns 各作业的日志内容 (key: jobId, value: 日志文本)
   * @command ci_get_job_logs
   * @see tauri-bridge.ts → ci.getJobLogs / github.getJobLogs
   * @see mock-bridge.ts → ci.getJobLogs / github.getJobLogs
   * @see preview-bridge/index.ts → ci.getJobLogs / github.getJobLogs
   */
  getJobLogs: (config: CiRepoConfig, runId: number) => Promise<IpcResult<Record<number, string>>>;
}

export interface CiRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  workflowId?: string | null;
  accessToken?: string | null;
}

export interface CiWorkflowRunSummary {
  runId: number;
  name: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  headBranch: string;
  htmlUrl: string;
  runStartedAt: string | null;
  updatedAt: string | null;
  actor: string | null;
  event: string | null;
}

export interface CiJobSummary {
  jobId: number;
  runId: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
  stepResults: CiStepSummary[];
}

export interface CiStepSummary {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CiStatusSnapshot {
  repo: string;
  branch: string;
  latestRun: CiWorkflowRunSummary | null;
  jobs: CiJobSummary[];
  logs: string | null;
  capturedAtMs: number;
  error: string | null;
}
