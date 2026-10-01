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
  createClipboardHistorySlice,
  createDshSlice,
  createSystemMonitorSlice,
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
  createReferenceSlice,
  createToastSlice,
  createErrorToastSlice,
  createNotificationSlice,
  createFileOpNoticeSlice,
  createBrowserDownloadsSlice,
} from './slices';
import { createGitVisSlice } from './slices/gitVisSlice';
import { createCenterTabsSlice } from './slices/centerTabsSlice';
import { createCenterActions } from './actions/centerActions';
import type { StoreState as FullStoreState } from './StoreState';

import {
  createWorkspaceActions,
  createEditorActions,
  createPatchActions,
  createGitActions,
  createSearchActions,
  createFetchActions,
  createGeneralActions,
  createReferenceActions,
  createUtilitiesActions,
  createDshActions,
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
  ...createDshSlice(set, get), // dsh 宿主壳
  ...createClipboardHistorySlice(set, get), // 剪贴板历史（系统剪贴板）
  ...createSystemMonitorSlice(set, get), // 系统监控（CPU/内存/磁盘/网络/进程）
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
  ...createReferenceSlice(set, get), // 参考代码仓库管理
  ...createToastSlice(set, get), // 全局 Toast 通知
  ...createErrorToastSlice(set, get), // 报错 Toast 队列（右下角持久）
  ...createNotificationSlice(set, get), // 通知系统
  ...createFileOpNoticeSlice(set, get), // 文件操作提示卡片（右下角警告）
  ...createGitVisSlice(set, get), // Git 可视化数据缓存
  ...createBrowserDownloadsSlice(set, get), // 浏览器下载管理
  ...createCenterTabsSlice(set, get), // 中心标签宿主

  // ════════════════════════════════════════════════════════
  // 根级状态
  // ════════════════════════════════════════════════════════
  loading: true,
  appReady: false,
  isFetching: {},
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
  ...createReferenceActions(set, get), // 参考代码仓库操作
  ...createUtilitiesActions(set, get), // 系统工具操作（剪贴板历史、系统监控）
  ...createDshActions(set, get), // dsh 宿主壳操作（打开/关闭/版本管理）
  ...createCenterActions(set, get), // 中心标签宿主编排（移入中心/移回面板）
}));

import { hydrateAll } from './persisted/hydrate';
import { cleanupUnregisteredKeys } from './persisted/cleanup';
import { registerPruneStore } from './persisted/pruneWiring';

// 过渡保留名单（PERSIST_KEEP_KEYS）已随 Task 29 删除：全部遗留键完成登记，
// 启动清理只需处理水合失败的脏键（extra）。遗留 adl-ui:* 键残留无害且不再被读取。

// 剪枝接线注册：pruneWiring 经注入拿 store 引用（而非静态 import），
// 避免 slicedStore → slice → pruneWiring → slicedStore 的求值环。
registerPruneStore({
  getState: useSlicedAppStore.getState,
  setState: (partial) => useSlicedAppStore.setState(partial),
});

// 同步水合：必须在 store 创建后立即执行，且早于任何 React 渲染 ——
// 全应用唯一的水合时机（规格 §3.3）。禁止再引入第二处异步水合。
const hydration = hydrateAll();
if (Object.keys(hydration.patch).length > 0) {
  useSlicedAppStore.setState(hydration.patch);
}
cleanupUnregisteredKeys({ extra: hydration.dirtyKeys });

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
