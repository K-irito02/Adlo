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
  createEditorSlice,
  createPatchSlice,
  createSearchSlice,
  createDiagnosticSlice,
  createClipboardSlice,
  createTerminalSlice,
  createBrowserTabsSlice,
  createBrowserBookmarkSlice,
  createBrowserHistorySlice,
  createBrowserFoldersSlice,
  createBrowserLandingSlice,
  createBrowserSearchEnginesSlice,
  createBrowserSlice,
  createCiSlice,
  createCommunicateSlice,
  createGitHubRepoSlice,
  createGitHubTreeSlice,
  createGitHubSlice,
  createMcpSlice,
  createWebToolsSlice,
  createReferenceSlice,
  createToastSlice,
  createErrorToastSlice,
  createNotificationSlice,
  createFileOpNoticeSlice,
  createBrowserDownloadsSlice,
} from './slices';
import { createGitVisSlice } from './slices/gitVisSlice';
import { hydrateGitHubRepoSlice } from './slices/githubRepoSliceHelpers';
import type { StoreState as FullStoreState } from './StoreState';

import {
  createWorkspaceActions,
  createEditorActions,
  createPatchActions,
  createGitActions,
  createSearchActions,
  createFetchActions,
  createGeneralActions,
  createMcpActions,
  createWebToolsActions,
  createLspActions,
  createReferenceActions,
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
  ...createEditorSlice(set, get), // 编辑器（openTabs, selectedFilePath）
  ...createPatchSlice(set, get), // 补丁状态（activePatchSet）
  ...createSearchSlice(set, get), // 搜索状态（searchQuery, results）
  ...createDiagnosticSlice(set, get), // 诊断/索引（indexingStatus, repoMap）
  ...createClipboardSlice(set, get), // 剪贴板
  ...createTerminalSlice(set, get), // 终端会话管理
  ...createBrowserTabsSlice(set, get), // 浏览器标签页
  ...createBrowserBookmarkSlice(set, get), // 浏览器书签
  ...createBrowserHistorySlice(set, get), // 浏览器历史记录
  ...createBrowserFoldersSlice(set, get), // 浏览器标签文件夹
  ...createBrowserLandingSlice(set, get), // 浏览器落地页（快捷站点、端口、背景）
  ...createBrowserSearchEnginesSlice(set, get), // 浏览器搜索引擎配置
  ...createBrowserSlice(set, get), // 浏览器核心状态（导航栏、视图模式、持久化）
  ...createCiSlice(set, get), // CI 状态（GitHub Actions）
  ...createCommunicateSlice(set, get), // 通信状态（多平台）
  ...createGitHubRepoSlice(set, get), // GitHub 仓库 CRUD（工作区配置、CI 目录管理、Pin/Unpin）
  ...createGitHubTreeSlice(set, get), // GitHub 树导航（展开/折叠、路径选择）
  ...createGitHubSlice(set, get), // GitHub CI 配置 + 状态（分支/提交/远程操作）
  ...createMcpSlice(set, get), // MCP 状态（服务器列表、目录）
  ...createWebToolsSlice(set, get), // Web 工具（抓取/搜索）
  ...createReferenceSlice(set, get), // 参考代码仓库管理
  ...createToastSlice(set, get), // 全局 Toast 通知
  ...createErrorToastSlice(set, get), // 报错 Toast 队列（右下角持久）
  ...createNotificationSlice(set, get), // 通知系统
  ...createFileOpNoticeSlice(set, get), // 文件操作提示卡片（右下角警告）
  ...createGitVisSlice(set, get), // Git 可视化数据缓存
  ...createBrowserDownloadsSlice(set, get), // 浏览器下载管理

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
  ...createEditorActions(set, get), // 编辑器操作
  ...createPatchActions(set, get), // 补丁操作
  ...createGitActions(set, get), // Git 操作
  ...createSearchActions(set, get), // 搜索操作
  ...createFetchActions(set, get), // 数据拉取（indexStatus, repoMap）
  ...createGeneralActions(set, get), // 通用操作（bootstrap, updatePreferences）
  ...createMcpActions(set, get), // MCP 操作（服务器管理、连接）
  ...createWebToolsActions(set, get), // Web 工具操作
  ...createLspActions(set, get), // LSP 操作
  ...createReferenceActions(set, get), // 参考代码仓库操作
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
