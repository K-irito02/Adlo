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
import type { SettingsGroupId } from '@adlo/kernel';
import type { ChangeFileState } from '@regions/right-panel/changesTree';

// ════════════════════════════════════════════════════════
// LocalStorage 键名常量
//
// 注意：Task 7/9/29 已将全量 UI 状态、浏览器面板状态与右侧面板布局状态迁移到
// persisted registry。凡已迁移的键不再以本地常量形式存在 —— 它们的单一事实来源是
// persisted/registry.ts 中的 `adl:<域>.<名称>` 登记键，写入一律走
// persist()/persistField()，读取一律走 hydrateAll()。
// 右侧面板模式与可恢复宽度（Task 29）是 useRightPanelLayout 的 hook 本地 state，
// 经登记表 `adl:ui.rightPanelMode` / `adl:ui.rightPanelLastRestorableWidth` 的
// apply 交回 rightPanelLayout.ts 的模块缓存（乙类契约），写入走 persist()。
// ════════════════════════════════════════════════════════

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
export const DEFAULT_FILES_NAVIGATOR_WIDTH = FILES_NAVIGATOR_WIDTH_MIN;
export const CHANGES_NAVIGATOR_WIDTH_MIN = 180;
export const CHANGES_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_CHANGES_NAVIGATOR_WIDTH = CHANGES_NAVIGATOR_WIDTH_MIN;
export const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
export const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_BROWSER_NAVIGATOR_WIDTH = BROWSER_NAVIGATOR_WIDTH_MIN;
export const GITHUB_NAVIGATOR_WIDTH_MIN = 180;
export const GITHUB_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_GITHUB_NAVIGATOR_WIDTH = 200;
export const SETTINGS_NAVIGATOR_WIDTH_MIN = 160;
export const SETTINGS_NAVIGATOR_WIDTH_MAX = 360;
export const DEFAULT_SETTINGS_NAVIGATOR_WIDTH = SETTINGS_NAVIGATOR_WIDTH_MIN;

/**
 * 设置面板「搜索设置」历史记录条数上限（最近在前）。
 * 读盘（`readSettingsSearchHistory` 的截断）与写盘（`recordSettingsSearch` 的截断）共用此值，
 * 两侧口径同源 —— 上限下调后旧数据在下次写盘自然收敛。
 */
export const SETTINGS_SEARCH_HISTORY_MAX = 20;

/**
 * 单条历史记录的长度上限（字符）。同步读盘预算（登记表要求单条序列化 ≤ 32KB）与
 * 卡片「单行省略 + title 看全文」的预期都假设条目是短查询串；粘贴超长文本时按此截断，
 * 读盘侧同值收敛（避免「写短读长」漂移）。
 */
export const SETTINGS_SEARCH_HISTORY_MAX_LENGTH = 200;

// ════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════
export type TreeExpansionState = Record<string, boolean>;

/**
 * 文件树与变更树（均按工作区隔离）的展开态。
 *
 * 需要区分两种意图：
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
export type ChangesTreeExpansionState = Record<string, TreeExpansion>;

/**
 * 文件树定位滚动请求（瞬态，不落盘）：由 Markdown 预览链接跳转等程序化
 * 导航发起，文件导航器消费后滚动到对应行。`nonce` 区分连续两次相同的定位。
 */
export interface FileTreeRevealRequest {
  workspaceId: string;
  path: string;
  nonce: number;
}
export type FilePreviewModeState = Record<string, Record<string, boolean>>;

export type HeatmapTab = 'calendar' | 'clock' | 'activity' | 'module';

export type ChartColorPreset = 'bklit-default' | 'cool-ocean' | 'warm-sunset' | 'high-contrast';

/** Markdown 预览主题（github-markdown-css 官方 7 主题去 auto 后按亮暗分组，不混用）。 */
export type LightMarkdownTheme = 'light' | 'light-colorblind';
export type DarkMarkdownTheme = 'dark' | 'dark-dimmed' | 'dark-high-contrast' | 'dark-colorblind';
export type MarkdownTheme = LightMarkdownTheme | DarkMarkdownTheme;

/** 各导航器折叠态的默认（全展开）。同时作为注册表 `adl:ui.navigatorCollapsed` 的 fallback。 */
export function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    settings: false,
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
  expandedChangesTreePaths: ChangesTreeExpansionState;
  /** 文件树定位滚动请求（瞬态，不落盘；消费方见 useFileTreeRevealOnRequest）。 */
  fileTreeRevealRequest: FileTreeRevealRequest | null;
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
  lightMarkdownTheme: LightMarkdownTheme;
  darkMarkdownTheme: DarkMarkdownTheme;
  startupOverlayHidden: boolean;
  hamburgerOpen: boolean;
  hoveredMenuCategory: 'file' | 'view' | 'help' | null;
  activeSettingsGroup: SettingsGroupId;
  settingsSearchQuery: string;
  /**
   * 设置面板「搜索设置」的历史记录（最近在前，上限 `SETTINGS_SEARCH_HISTORY_MAX`）。
   * 仅在用户点击某个搜索结果、跳转真正发生时记入 —— 只留用过的查询，不让半截输入污染历史。
   */
  settingsSearchHistory: string[];
  /**
   * 「存储」组级恢复默认**待处理**信号（transient，不持久化）：侧边栏重置按钮置 true，
   * StorageSettings 承接消费（开框前 consume）。布尔 pending 而非序号，是为了消除
   * 「未挂载 → 切组+信号同批 → 挂载即把新值当历史播种而漏弹」的首跳竞态（Phase 4 H1）。
   */
  storageGroupResetPending: boolean;
  /**
   * 存储各块是否全默认的聚合信号（transient，不持久化）：StorageSettings 挂载时按
   * 各块判定写入并在卸载时清 null，供侧边栏存储行 disabled 用。null = 未知 → 启用。
   */
  storageBlocksAtDefault: boolean | null;
  /**
   * 「浏览器」组级恢复默认**待处理**信号（transient，不持久化）：与 storage 同构
   * （Phase 4 H1 首跳竞态消除）——侧边栏重置按钮置 true，BrowserSettings 承接消费。
   */
  browserGroupResetPending: boolean;
  /**
   * 浏览器三块（挂起/下载模式/下载路径）是否全默认的聚合信号（transient，不持久化）：
   * BrowserSettings 挂载时判定写入并在卸载时清 null，供侧边栏浏览器行 disabled 用。
   * null = 未知 → 启用（fail-open）。
   */
  browserBlocksAtDefault: boolean | null;
  /**
   * 「DSH」组级恢复默认**待处理**信号（transient，不持久化）：与 storage/browser 同构
   * ——侧边栏重置按钮置 true，DshSettings 承接消费（DSH 配置走 saveSourceConfig 桥，
   * 无偏好 patch，须自有确认对话框与执行流程）。
   */
  dshGroupResetPending: boolean;
  /**
   * DSH 组版本块是否默认的聚合信号（transient，不持久化）：
   * DshSettings 挂载时按 `sourceStatus.config.version_source` 判定写入，卸载保留，
   * 供侧边栏 DSH 行 disabled 用。null = 未知 → 启用（fail-open）。
   * 源/代理两块 Task 5 起归网络组（`networkBlocksAtDefault`）。
   */
  dshBlocksAtDefault: boolean | null;
  /**
   * 「网络」组级恢复默认**待处理**信号（transient，不持久化）：与 dsh 同构
   * ——侧边栏重置按钮置 true，NetworkSettings 承接消费（源/代理走 saveSourceConfig 桥，
   * 无偏好 patch，须自有确认对话框与执行流程；Task 5 填充实装）。
   */
  networkGroupResetPending: boolean;
  /**
   * 网络两块（下载源/代理设置）是否全默认的聚合信号（transient，不持久化）：
   * NetworkSettings 挂载时按本地选项判定（`sourceStatus` 仅作未知门）写入，卸载保留，
   * 供侧边栏网络行 disabled 用。null = 未知 → 启用（fail-open）。
   */
  networkBlocksAtDefault: boolean | null;
  /**
   * 「环境」组级恢复默认**待处理**信号（transient，不持久化）：与 network 同构
   * ——侧边栏重置按钮置 true，EnvironmentSettings 承接消费（Task 7 填充实装；
   * 环境不进 ResetAll 自动序列，其组级重置仅侧边栏自助）。
   */
  environmentGroupResetPending: boolean;
  /**
   * 「OpenCode CLI」组级恢复默认**待处理**信号（transient，不持久化）：与 dsh 同构
   * ——侧边栏重置按钮置 true，OpencodeSettings 承接消费（版本来源走 opencode 桥
   * saveVersionSource + 终端可用性走 setTerminalInjection，无偏好 patch，
   * 须自有确认对话框与执行流程）。
   */
  opencodeGroupResetPending: boolean;
  /**
   * OpenCode CLI 组（版本来源 + 终端可用性）是否全默认的聚合信号（transient，不持久化）：
   * OpencodeSettings 挂载时按 `source.versionSource.mode === 'auto' && terminalInjection === true`
   * 判定写入，未知（source 为 null）保持启用 fail-open，卸载保留，供侧边栏行 disabled 用。
   */
  opencodeBlocksAtDefault: boolean | null;
  /**
   * 兄弟子窗口（dsh/浏览器 tab 原生 WebView）创建计数器（transient，不持久化）：
   * 每次新建原生子窗口即 +1（新窗口盖在最上层），透明桥接条据此重建回到最上层。
   */
  siblingWebviewNonce: number;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  /** 变更状态过滤器（`adl:changes.statusFilter`，Task 23；空集 = 不过滤） */
  changesStatusFilter: Set<ChangeFileState>;
  /** 变更大纲展开项（按工作区隔离，`adl:changes.outlineExpanded`，Task 23） */
  changesOutlineExpanded: Record<string, string[]>;
  /** 变更 diff 行号开关（`adl:changes.lineNumbers`，Task 23） */
  changesLineNumbers: boolean;
  /** 变更 diff 自动换行开关（`adl:changes.wordWrap`，Task 23） */
  changesWordWrap: boolean;

  setActiveRightTool: (tool: ToolId) => void;
  /**
   * 用户主动导航（菜单/快捷键/设置跳转）：切换工具并同时展开右侧面板。
   * 与 `setActiveRightTool` 的区别：后者只切工具（被动同步用，如 usePatchReview 的守卫调用），
   * 收起态下调用它会导致"切了但看不见"。
   */
  navigateRightTool: (tool: ToolId) => void;
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
  /** 发起一次文件树定位滚动（瞬态，不落盘；nonce 保证连续相同定位可重复触发）。 */
  requestFileTreeReveal: (workspaceId: string, path: string) => void;
  /** 消费（清除）定位滚动请求：成功滚动后调用，避免 remount 重放。 */
  consumeFileTreeReveal: () => void;
  setFilesNavigatorMode: (mode: FilesNavigatorMode) => void;
  setFilesSearchView: (view: FilesSearchViewMode) => void;
  setFilesSearchScope: (scope: FilesSearchScope) => void;
  setFilePreviewModeForPath: (workspaceId: string, path: string, previewEnabled: boolean) => void;
  carryFilePreviewModeForRename: (workspaceId: string, oldPath: string, newPath: string) => void;
  setChangesPreviewEnabled: (previewEnabled: boolean) => void;
  setShowGitVisualization: (show: boolean) => void;
  setActiveHeatmapTab: (tab: HeatmapTab) => void;
  setActiveWorkspaceTab: (tab: string) => void;
  setChartColorPreset: (preset: ChartColorPreset) => void;
  setLightMarkdownTheme: (theme: LightMarkdownTheme) => void;
  setDarkMarkdownTheme: (theme: DarkMarkdownTheme) => void;
  setStartupOverlayHidden: (hidden: boolean) => void;
  setChangesNavigatorMode: (mode: ChangesNavigatorMode) => void;
  setChangesTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
  toggleChangesTreePath: (workspaceId: string, path: string) => void;
  expandChangesTreePathChain: (workspaceId: string, path: string) => { blocked: string[] };
  collapseAllChangesTreePaths: (workspaceId: string) => void;
  setHamburgerOpen: (open: boolean) => void;
  setHoveredMenuCategory: (category: 'file' | 'view' | 'help' | null) => void;
  closeAllMenus: () => void;
  setActiveSettingsGroup: (group: SettingsGroupId) => void;
  setSettingsSearchQuery: (query: string) => void;
  /** 记入一次设置搜索历史（去重置顶 + 截断到上限；空白串与「已在首位」为无变化，不写盘）。 */
  recordSettingsSearch: (query: string) => void;
  /** 清空设置搜索历史（已为空为无变化，不写盘）。 */
  clearSettingsSearchHistory: () => void;
  /** 删除单条设置搜索历史（不存在为无变化，不写盘）。 */
  removeSettingsSearchHistoryItem: (item: string) => void;
  /** 置位组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestStorageGroupReset: () => void;
  /** 消费组级恢复待处理（承接方开框前/丢弃信号时调用）。 */
  consumeStorageGroupReset: () => void;
  /** 设置存储各块全默认聚合信号（StorageSettings 挂载维护，卸载清 null）。 */
  setStorageBlocksAtDefault: (value: boolean | null) => void;
  /** 置位浏览器组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestBrowserGroupReset: () => void;
  /** 消费浏览器组级恢复待处理（BrowserSettings 开框前/入口守卫丢弃时调用）。 */
  consumeBrowserGroupReset: () => void;
  /** 设置浏览器三块全默认聚合信号（BrowserSettings 挂载维护，卸载清 null）。 */
  setBrowserBlocksAtDefault: (value: boolean | null) => void;
  /** 置位 DSH 组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestDshGroupReset: () => void;
  /** 消费 DSH 组级恢复待处理（DshSettings 开框前/入口守卫丢弃时调用）。 */
  consumeDshGroupReset: () => void;
  /** 设置 DSH 版本块是否默认的聚合信号（DshSettings 挂载维护，卸载保留）。 */
  setDshBlocksAtDefault: (value: boolean | null) => void;
  /** 置位网络组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestNetworkGroupReset: () => void;
  /** 消费网络组级恢复待处理（NetworkSettings 开框前/入口守卫丢弃时调用）。 */
  consumeNetworkGroupReset: () => void;
  /** 设置网络两块全默认聚合信号（NetworkSettings 挂载维护，卸载保留）。 */
  setNetworkBlocksAtDefault: (value: boolean | null) => void;
  /** 置位环境组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestEnvironmentGroupReset: () => void;
  /** 消费环境组级恢复待处理（EnvironmentSettings 开框前/入口守卫丢弃时调用）。 */
  consumeEnvironmentGroupReset: () => void;
  /** 置位 OpenCode CLI 组级恢复待处理（幂等：已 pending 再点保持 true）。 */
  requestOpencodeGroupReset: () => void;
  /** 消费 OpenCode CLI 组级恢复待处理（OpencodeSettings 开框前/入口守卫丢弃时调用）。 */
  consumeOpencodeGroupReset: () => void;
  /** 设置 OpenCode CLI 组是否全默认的聚合信号（OpencodeSettings 挂载维护，卸载保留）。 */
  setOpencodeBlocksAtDefault: (value: boolean | null) => void;
  /** 兄弟子窗口新建即 +1（透明桥接条 z-order 重建信号）。 */
  bumpSiblingWebviewNonce: () => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
  setChangesStatusFilter: (filter: Set<ChangeFileState>) => void;
  toggleChangesStatusFilter: (filter: ChangeFileState) => void;
  setChangesOutlineExpanded: (workspaceId: string, ids: string[]) => void;
  setChangesLineNumbers: (enabled: boolean) => void;
  setChangesWordWrap: (enabled: boolean) => void;
}
