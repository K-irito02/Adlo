/**
 * Store - Zustand 状态管理（基于切片模式重构）
 * 已将跨切片 actions 按领域拆分到 actions/ 目录
 */

import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

import {
  createUISlice,
  createWorkspaceSlice,
  createGitSlice,
  createSessionSlice,
  createEditorSlice,
  createPatchSlice,
  createSearchSlice,
  createDiagnosticSlice,
  createTaskSlice,
  createCommandSlice,
  createClipboardSlice,
  createTerminalSlice,
  createBrowserTabsSlice,
  createBrowserBookmarkSlice,
  createBrowserHistorySlice,
  createBrowserFoldersSlice,
  createBrowserLandingSlice,
  createBrowserSlice,
  createCiSlice,
  createCommunicateSlice,
  createGitHubRepoSlice,
  createGitHubTreeSlice,
  createGitHubSlice,
  createAgentSlice,
  createMcpSlice,
  createProviderSlice,
  createCustomCommandSlice,
  createPermissionSlice,
  createCompactionSlice,
  createWebToolsSlice,
  createReferenceSlice,
  createDurableSlice,
  createToastSlice,
  createErrorToastSlice,
  createNotificationSlice,
  createPartStreamSlice,
} from './slices';
import { createGitVisSlice } from './slices/gitVisSlice';
import { hydrateGitHubRepoSlice } from './slices/githubRepoSliceHelpers';
import type { StoreState as FullStoreState } from './StoreState';

import {
  createWorkspaceActions,
  createSessionActions,
  createEditorActions,
  createPatchActions,
  createGitActions,
  createSearchActions,
  createFetchActions,
  createStreamActions,
  createGeneralActions,
  createTaskActions,
  createCommandActions,
  createAgentActions,
  createMcpActions,
  createProviderActions,
  createCustomCommandActions,
  createPermissionActions,
  createCompactionActions,
  createSnapshotActions,
  createWebToolsActions,
  createSessionForkActions,
  createLspActions,
  createReferenceActions,
  createCustomAgentActions,
  createDurableActions,
} from './actions';

export {
  getWorkspaceCachePrefix,
  getWorkspaceScopedCacheKey,
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
} from './shared';

// 定义完整的 StoreState，与 StoreState.ts 保持一致
type StoreState = FullStoreState;

// 合并所有切片并添加跨切片的 actions
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // ════════════════════════════════════════════════════════
  // 状态切片（23 个）— 纯状态 + 切片内 actions
  // ════════════════════════════════════════════════════════
  ...createUISlice(set, get), // UI 状态（侧边栏、工具栏、聊天模式）
  ...createWorkspaceSlice(set, get), // 工作区状态（appInfo, workspaceTree）
  ...createGitSlice(set, get), // Git 状态（snapshot, branches）
  ...createSessionSlice(set, get), // 会话状态（sessions, activeSessionId）
  ...createEditorSlice(set, get), // 编辑器（openTabs, selectedFilePath）
  ...createPatchSlice(set, get), // 补丁状态（activePatchSet）
  ...createSearchSlice(set, get), // 搜索状态（searchQuery, results）
  ...createDiagnosticSlice(set, get), // 诊断/索引（indexingStatus, repoMap）
  ...createTaskSlice(set, get), // 任务中心
  ...createCommandSlice(set, get), // 命令执行（latestCommandRun）
  ...createClipboardSlice(set, get), // 剪贴板
  ...createTerminalSlice(set, get), // 终端会话管理
  ...createBrowserTabsSlice(set, get), // 浏览器标签页
  ...createBrowserBookmarkSlice(set, get), // 浏览器书签
  ...createBrowserHistorySlice(set, get), // 浏览器历史记录
  ...createBrowserFoldersSlice(set, get), // 浏览器标签文件夹
  ...createBrowserLandingSlice(set, get), // 浏览器落地页（快捷站点、端口、背景）
  ...createBrowserSlice(set, get), // 浏览器核心状态（导航栏、视图模式、持久化）
  ...createCiSlice(set, get), // CI 状态（GitHub Actions）
  ...createCommunicateSlice(set, get), // 通信状态（多平台）
  ...createGitHubRepoSlice(set, get), // GitHub 仓库 CRUD（工作区配置、CI 目录管理、Pin/Unpin）
  ...createGitHubTreeSlice(set, get), // GitHub 树导航（展开/折叠、路径选择）
  ...createGitHubSlice(set, get), // GitHub CI 配置 + 状态（分支/提交/远程操作）
  ...createAgentSlice(set, get), // Agent 状态（多 Agent 系统、Plan 模式、子代理任务）
  ...createMcpSlice(set, get), // MCP 状态（服务器列表、目录）
  ...createProviderSlice(set, get), // Provider 状态（API 密钥配置）
  ...createCustomCommandSlice(set, get), // 自定义命令状态（内置 + 自定义斜杠命令）
  ...createPermissionSlice(set, get), // 权限配置状态
  ...createCompactionSlice(set, get), // 压缩状态
  ...createWebToolsSlice(set, get), // Web 工具（抓取/搜索）
  ...createReferenceSlice(set, get), // 参考代码仓库管理
  ...createDurableSlice(set, get), // 持久化会话管理
  ...createToastSlice(set, get), // 全局 Toast 通知
  ...createErrorToastSlice(set, get), // 报错 Toast 队列（右下角持久）
  ...createNotificationSlice(set, get), // 通知系统
  ...createGitVisSlice(set, get), // Git 可视化数据缓存
  ...createPartStreamSlice(set, get), // Part 渲染状态（S2：messages/parts/status）

  // ════════════════════════════════════════════════════════
  // 根级状态
  // ════════════════════════════════════════════════════════
  loading: true,
  appReady: false,
  isFetching: {},
  lspActiveServers: [],
  lspDiagnostics: [],
  isTauri: false,

  // ════════════════════════════════════════════════════════
  // 跨切片 Actions（10 个领域模块）
  // ════════════════════════════════════════════════════════
  ...createWorkspaceActions(set, get), // 工作区操作
  ...createSessionActions(set, get), // 会话操作（createSession 等）
  ...createEditorActions(set, get), // 编辑器操作
  ...createPatchActions(set, get), // 补丁操作
  ...createGitActions(set, get), // Git 操作
  ...createSearchActions(set, get), // 搜索操作
  ...createFetchActions(set, get), // 数据拉取（indexStatus, repoMap）
  ...createStreamActions(set, get), // 流式消息（sendMessage, cancel）
  ...createGeneralActions(set, get), // 通用操作（bootstrap, updatePreferences）
  ...createTaskActions(set, get), // 任务操作（decideApproval, restoreCheckpoint）
  ...createCommandActions(set, get), // 命令操作（runCommand）
  ...createAgentActions(set, get), // Agent 操作（fetchAgents、Plan 模式）
  ...createMcpActions(set, get), // MCP 操作（服务器管理、连接）
  ...createProviderActions(set, get), // Provider 操作（API 密钥管理）
  ...createCustomCommandActions(set, get), // 自定义命令操作（CRUD）
  ...createPermissionActions(set, get), // 权限操作（CRUD）
  ...createCompactionActions(set, get), // 压缩操作
  ...createSnapshotActions(set, get), // 快照操作
  ...createWebToolsActions(set, get), // Web 工具操作
  ...createSessionForkActions(set, get), // 会话分叉操作
  ...createLspActions(set, get), // LSP 操作
  ...createReferenceActions(set, get), // 参考代码仓库操作
  ...createCustomAgentActions(set, get), // 自定义 Agent 操作
  ...createDurableActions(set, get), // 持久化会话操作

  // ════════════════════════════════════════════════════════
  // 自定义 Agent 状态
  // ════════════════════════════════════════════════════════
  customAgents: [],
  isFetchingCustomAgents: false,
}));

// 显式 hydration：在 store 创建后从 localStorage 恢复 GitHub Repo slice 的持久化状态
void hydrateGitHubRepoSlice(useSlicedAppStore.setState);

// Type safety: compile-time assertion that the store satisfies StoreState
// Uses the "never" type trick: if StoreState and actual store types don't match,
// TypeScript will try to assign `true` to `never`, causing a compile-time error.
// This ensures the store always matches the StoreState interface.
type _StoreTypeCheck =
  ReturnType<typeof useSlicedAppStore.getState> extends StoreState ? true : never;
const _storeTypeCheck: _StoreTypeCheck = true;
void _storeTypeCheck;

export const useAppStore = useSlicedAppStore;

/**
 * 导出 shallow 比较器供组件直接使用
 */
export { shallow };
