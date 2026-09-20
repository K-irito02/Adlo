/**
 * UI 切片类型和常量
 * 从 uiSlice.ts 提取，供 uiSlice.ts 和消费者使用
 */
import type {
  ToolId,
  FilesNavigatorMode,
  ChangesNavigatorMode,
  FilesSearchViewMode,
  FilesSearchScope,
} from '../types';
import type { SettingsGroupId } from '@ai-digital-life/kernel';

// ════════════════════════════════════════════════════════
// LocalStorage 键名常量
//
// 注意：Task 7/9 已将全量 UI 状态与浏览器面板状态迁移到 persisted registry。
// 凡已迁移的键不再以本地常量形式存在 —— 它们的单一事实来源是
// persisted/registry.ts 中的 `adl:<域>.<名称>` 登记键，写入一律走
// persistField()，读取一律走 hydrateAll()。下方仅保留尚未迁移的遗留键
// （由 PERSIST_KEEP_KEYS 保护，待后续任务迁移）：
//   - RIGHT_PANEL_MODE_KEY / RIGHT_PANEL_LAST_RESTORABLE_WIDTH_KEY
//     （仅存在于组件本地 state，Task 22 上提到 store 后再登记）
// ════════════════════════════════════════════════════════
export const RIGHT_PANEL_MODE_KEY = 'adl-ui:right-panel-mode';
export const RIGHT_PANEL_LAST_RESTORABLE_WIDTH_KEY = 'adl-ui:right-panel-last-restorable-width';

// 命名说明：state 侧 `leftbar*` 沿用 CSS 类/变量（.adl-leftbar、--leftbar-width），
// key/常量侧 `LEFT_PANEL_*` 沿用面板语义（与 RIGHT_PANEL_* 对齐），两者指同一左面板。

// ════════════════════════════════════════════════════════
// 面板宽度常量
// ════════════════════════════════════════════════════════
export const LEFT_PANEL_WIDTH_MIN = 180;
export const LEFT_PANEL_WIDTH_MAX = 260;
export const DEFAULT_LEFT_PANEL_WIDTH = 180;
export const RIGHT_PANEL_WIDTH_MIN = 320;
export const RIGHT_PANEL_WIDTH_MAX = 4096;
export const DEFAULT_RIGHT_PANEL_WIDTH = 520;
export const FILES_NAVIGATOR_WIDTH_MIN = 180;
export const FILES_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_FILES_NAVIGATOR_WIDTH = 240;
export const CHANGES_NAVIGATOR_WIDTH_MIN = 180;
export const CHANGES_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_CHANGES_NAVIGATOR_WIDTH = 240;
export const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
export const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;
export const GITHUB_NAVIGATOR_WIDTH_MIN = 180;
export const GITHUB_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_GITHUB_NAVIGATOR_WIDTH = 200;
export const SETTINGS_NAVIGATOR_WIDTH_MIN = 160;
export const SETTINGS_NAVIGATOR_WIDTH_MAX = 360;
export const DEFAULT_SETTINGS_NAVIGATOR_WIDTH = 160;

// ════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════
export type TreeExpansionState = Record<string, boolean>;

/**
 * 文件树（按工作区隔离）的展开态。
 *
 * 与变更侧 `TreeExpansionState` 不同，文件侧需要区分两种意图：
 * - `expanded`：该目录当前是否展开（自动展开也会写入它）；
 * - `manualCollapsed`：用户**亲手**折叠过的目录 —— 自动展开链不得覆盖（规格 §3.1.2）。
 *
 * 不变量：`manualCollapsed[k] === true` 与 `expanded[k] === true` 不得同时成立。
 * 当二者冲突时（读盘/剪枝期），以 `expanded[k] === true` 为准删除 `manualCollapsed[k]`
 * （详见 `readDirExpansion` / `pruneDirExpansion` 的"就地修复"裁定）。
 */
export interface TreeExpansion {
  expanded: Record<string, boolean>;
  /** 用户亲手折叠过的路径；叶子恒为 `true`，否则视为非法（见 `readDirExpansion`） */
  manualCollapsed?: Record<string, true>;
}
export type FileTreeExpansionState = Record<string, TreeExpansion>;
export type FilePreviewModeState = Record<string, boolean>;

export type HeatmapTab = 'calendar' | 'clock' | 'activity' | 'module';

export type ChartColorPreset = 'bklit-default' | 'cool-ocean' | 'warm-sunset' | 'high-contrast';

/** 各导航器折叠态的默认（全展开）。同时作为注册表 `adl:ui.navigatorCollapsed` 的 fallback。 */
export function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    settings: false,
    communicate: false,
  };
}

export interface UISlice {
  activeRightTool: ToolId;
  leftCollapsed: boolean;
  leftbarWidth: number;
  rightCollapsed: boolean;
  rightPanelWidth: number;
  filesNavigatorWidth: number;
  changesNavigatorWidth: number;
  browserNavigatorWidth: number;
  gitHubNavigatorWidth: number;
  settingsNavigatorWidth: number;
  isFetching: Record<string, boolean>;
  expandedFileTreePaths: FileTreeExpansionState;
  expandedChangesTreePaths: TreeExpansionState;
  filesNavigatorMode: FilesNavigatorMode;
  changesNavigatorMode: ChangesNavigatorMode;
  filesSearchView: FilesSearchViewMode;
  filesSearchScope: FilesSearchScope;
  filePreviewModeByPath: FilePreviewModeState;
  changesPreviewEnabled: boolean;
  showGitVisualization: boolean;
  activeHeatmapTab: HeatmapTab;
  activeWorkspaceTab: string;
  chartColorPreset: ChartColorPreset;
  startupOverlayHidden: boolean;
  hamburgerOpen: boolean;
  hoveredMenuCategory: 'file' | 'view' | 'help' | null;
  activeSettingsGroup: SettingsGroupId;
  settingsSearchQuery: string;
  navigatorCollapsedByTool: Record<ToolId, boolean>;

  setActiveRightTool: (tool: ToolId) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setLeftbarWidth: (width: number) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBoth: () => void;
  setRightPanelWidth: (width: number) => void;
  setFilesNavigatorWidth: (width: number) => void;
  setChangesNavigatorWidth: (width: number) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  setGitHubNavigatorWidth: (width: number) => void;
  setSettingsNavigatorWidth: (width: number) => void;
  setIsFetching: (key: string, value: boolean) => void;
  setFileTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
  toggleFileTreePath: (workspaceId: string, path: string) => void;
  expandFileTreePathChain: (workspaceId: string, path: string) => { blocked: string[] };
  collapseAllFileTreePaths: (workspaceId: string) => void;
  setFilesNavigatorMode: (mode: FilesNavigatorMode) => void;
  setFilesSearchView: (view: FilesSearchViewMode) => void;
  setFilesSearchScope: (scope: FilesSearchScope) => void;
  setFilePreviewModeForPath: (path: string, previewEnabled: boolean) => void;
  carryFilePreviewModeForRename: (oldPath: string, newPath: string) => void;
  setChangesPreviewEnabled: (previewEnabled: boolean) => void;
  setShowGitVisualization: (show: boolean) => void;
  setActiveHeatmapTab: (tab: HeatmapTab) => void;
  setActiveWorkspaceTab: (tab: string) => void;
  setChartColorPreset: (preset: ChartColorPreset) => void;
  setStartupOverlayHidden: (hidden: boolean) => void;
  setChangesNavigatorMode: (mode: ChangesNavigatorMode) => void;
  setChangesTreePathExpanded: (path: string, expanded: boolean) => void;
  toggleChangesTreePath: (path: string) => void;
  expandChangesTreePathChain: (path: string) => void;
  collapseAllChangesTreePaths: () => void;
  setHamburgerOpen: (open: boolean) => void;
  setHoveredMenuCategory: (category: 'file' | 'view' | 'help' | null) => void;
  closeAllMenus: () => void;
  setActiveSettingsGroup: (group: SettingsGroupId) => void;
  setSettingsSearchQuery: (query: string) => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
}
