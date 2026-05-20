/**
 * Store Selectors - 从主 store 中提取特定领域的数据
 * 
 * 这些选择器提供了一种类型安全的方式来访问 store 中的特定部分，
 * 而不需要订阅整个 store。
 */

import type { StoreState } from "../slicedStore";
import type { AppInfo, GitSnapshot, WorkspaceTreeNode, RecentWorkspaceEntry } from "@ai-digital-life/kernel";

/**
 * 工作区相关的选择器
 */
export const workspaceSelectors = {
  /** 获取当前应用信息 */
  getAppInfo: (state: StoreState) => state.appInfo,
  
  /** 获取当前工作区元数据 */
  getCurrentWorkspace: (state: StoreState) => state.appInfo?.currentWorkspace,
  
  /** 获取最近的个工作区列表 */
  getRecentWorkspaces: (state: StoreState) => state.recentWorkspaces,
  
  /** 获取工作区树 */
  getWorkspaceTree: (state: StoreState) => state.workspaceTree,
  
  /** 获取 Git 快照 */
  getGitSnapshot: (state: StoreState) => state.gitSnapshot,
  
  /** 获取 Git 分支列表 */
  getGitBranches: (state: StoreState) => state.gitBranches,
  
  /** 获取工作区上下文模式 */
  getWorkspaceContextMode: (state: StoreState) => state.workspaceContextMode,
  
  /** 获取索引状态 */
  getIndexingStatus: (state: StoreState) => state.indexingStatus,
  
  /** 获取仓库地图 */
  getRepoMap: (state: StoreState) => state.repoMap,
  
  /** 检查是否有当前工作区 */
  hasCurrentWorkspace: (state: StoreState) => Boolean(state.appInfo?.currentWorkspace),
  
  /** 获取工作区 ID */
  getWorkspaceId: (state: StoreState) => state.appInfo?.currentWorkspace?.id,
};

/**
 * 会话相关的选择器
 */
export const sessionSelectors = {
  /** 获取所有会话 */
  getSessions: (state: StoreState) => state.sessions,
  
  /** 获取当前活跃会话 ID */
  getActiveSessionId: (state: StoreState) => state.activeSessionId,
  
  /** 获取当前活跃会话详情 */
  getActiveSession: (state: StoreState) => {
    const activeId = state.activeSessionId;
    if (!activeId) return undefined;
    return state.sessionDetails[activeId];
  },
  
  /** 获取会话详情映射 */
  getSessionDetails: (state: StoreState) => state.sessionDetails,
  
  /** 获取会话数量 */
  getSessionCount: (state: StoreState) => state.sessions.length,
  
  /** 检查是否有会话 */
  hasSessions: (state: StoreState) => state.sessions.length > 0,
};

/**
 * 编辑器相关的选择器
 */
export const editorSelectors = {
  /** 获取打开的标签页 */
  getOpenTabs: (state: StoreState) => state.openTabs,
  
  /** 获取当前选中的文件路径 */
  getSelectedFilePath: (state: StoreState) => state.selectedFilePath,
  
  /** 获取当前文件内容 */
  getFileContent: (state: StoreState) => state.fileContent,
  
  /** 获取文件最后修改时间 */
  getFileLastModifiedAt: (state: StoreState) => state.fileLastModifiedAt,
  
  /** 获取文件大纲 */
  getOutline: (state: StoreState) => state.outline,
  
  /** 获取脏编辑器路径列表 */
  getDirtyEditorPaths: (state: StoreState) => state.dirtyEditorPaths,
  
  /** 获取外部文件变更 */
  getExternalFileChange: (state: StoreState) => state.externalFileChange,
  
  /** 检查文件是否被修改 */
  isFileDirty: (relativePath: string) => (state: StoreState) => 
    state.dirtyEditorPaths.includes(relativePath),
  
  /** 获取打开的标签页数量 */
  getOpenTabCount: (state: StoreState) => state.openTabs.length,
};

/**
 * 补丁相关的选择器
 */
export const patchSelectors = {
  /** 获取当前活跃的补丁集 */
  getActivePatchSet: (state: StoreState) => state.activePatchSet,
  
  /** 获取最新的补丁应用结果 */
  getLatestPatchApplication: (state: StoreState) => state.latestPatchApplication,
  
  /** 获取当前选中的变更预览路径 */
  getSelectedChangePreviewPath: (state: StoreState) => state.selectedChangePreviewPath,
  
  /** 获取变更预览 */
  getChangePreview: (state: StoreState) => state.changePreview,
  
  /** 检查变更预览是否正在加载 */
  isChangePreviewLoading: (state: StoreState) => state.changePreviewLoading,
  
  /** 检查是否有活跃的补丁集 */
  hasActivePatchSet: (state: StoreState) => Boolean(state.activePatchSet),
};

/**
 * 任务相关的选择器
 */
export const taskSelectors = {
  /** 获取任务中心快照 */
  getTaskCenter: (state: StoreState) => state.taskCenter,
  
  /** 获取审计条目 */
  getAuditEntries: (state: StoreState) => state.auditEntries,
  
  /** 检查是否有任务中心 */
  hasTaskCenter: (state: StoreState) => Boolean(state.taskCenter),
};

/**
 * 运行相关的选择器
 */
export const runSelectors = {
  /** 获取当前活跃的运行 */
  getActiveRun: (state: StoreState) => state.activeRun,
  
  /** 获取流式输出文本 */
  getStreamingAssistantText: (state: StoreState) => state.streamingAssistantText,
  
  /** 获取流式运行 ID */
  getStreamingActiveRunId: (state: StoreState) => state.streamingActiveRunId,
  
  /** 获取按运行 ID 分组的活动 */
  getRunActivityByRunId: (state: StoreState) => state.runActivityByRunId,
  
  /** 获取按运行 ID 分组的使用统计 */
  getRunUsageByRunId: (state: StoreState) => state.runUsageByRunId,
  
  /** 检查是否有活跃运行 */
  hasActiveRun: (state: StoreState) => Boolean(state.activeRun),
  
  /** 检查是否正在流式输出 */
  isStreaming: (state: StoreState) => Boolean(state.streamingActiveRunId),
};

/**
 * 模型健康相关的选择器
 */
export const modelSelectors = {
  /** 获取模型健康快照 */
  getModelHealth: (state: StoreState) => state.modelHealth,
  
  /** 获取当前选中的模型 */
  getCurrentModel: (state: StoreState) => state.currentModel,
  
  /** 检查模型健康状态是否可用 */
  hasModelHealth: (state: StoreState) => Boolean(state.modelHealth),
};

/**
 * 命令相关的选择器
 */
export const commandSelectors = {
  /** 获取最近命令历史 */
  getCommandHistory: (state: StoreState) => state.commandHistory,
  
  /** 获取最近一次命令运行结果 */
  getLatestCommandRun: (state: StoreState) => state.latestCommandRun,
  
  /** 检查是否有命令历史 */
  hasCommandHistory: (state: StoreState) => state.commandHistory.length > 0,
};

/**
 * 搜索相关的选择器
 */
export const searchSelectors = {
  /** 获取搜索查询 */
  getSearchQuery: (state: StoreState) => state.searchQuery,
  
  /** 获取搜索结果 */
  getSearchResults: (state: StoreState) => state.searchResults,
  
  /** 检查是否有搜索结果 */
  hasSearchResults: (state: StoreState) => state.searchResults.length > 0,
};

/**
 * 组合选择器 - 用于常见的组合场景
 */
export const combinedSelectors = {
  /** 检查是否可以打开新标签页（基于现有打开的标签页） */
  canOpenNewTab: (state: StoreState) => state.openTabs.length < 20,
  
  /** 检查工作区是否就绪 */
  isWorkspaceReady: (state: StoreState) => 
    Boolean(state.appInfo?.currentWorkspace) && state.indexingStatus?.state !== "indexing",
  
  /** 获取当前文件的标签页（如果存在） */
  getCurrentFileTab: (state: StoreState) => {
    if (!state.selectedFilePath) return undefined;
    return state.openTabs.find(tab => tab.path === state.selectedFilePath);
  },
};
