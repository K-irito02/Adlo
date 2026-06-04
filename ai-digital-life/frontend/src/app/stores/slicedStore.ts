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
  createBrowserSlice,
} from './slices';
import type {
  UISlice,
  WorkspaceSlice,
  GitSlice,
  SessionSlice,
  EditorSlice,
  PatchSlice,
  SearchSlice,
  DiagnosticSlice,
  TaskSlice,
  CommandSlice,
  ClipboardSlice,
  TerminalSlice,
  BrowserSlice,
} from './slices';
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
  // 状态切片（12 个）— 纯状态 + 切片内 actions
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
  ...createBrowserSlice(set, get), // 浏览器标签管理

  // ════════════════════════════════════════════════════════
  // 根级状态
  // ════════════════════════════════════════════════════════
  loading: true,
  error: undefined,
  isFetching: {},

  // ════════════════════════════════════════════════════════
  // 跨切片 Actions（9 个领域模块）
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
}));

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
