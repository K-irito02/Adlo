import { defineEntry, readBooleanRecord, type PersistEntry } from './entry';
import {
  readFlag,
  readNumberInRange,
  readFlooredNumberInRange,
  readStringEnum,
  readString,
  readStringRecord,
  readNumberArray,
  readObjectArray,
  readObjectArrayRecord,
  readSearchIgnoredPaths,
  readSearchUseGitignore,
  readBooleanPropRecord,
  readDirExpansionRecord,
  isPlainRecord,
} from './parsers';
import {
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MIN,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_MAX_RESULTS,
  SEARCH_HARD_MAX_RESULTS,
} from '../../../shared/ipc/searchWindow';
import {
  pruneByWorkspaceId,
  pruneBrowserTreeExpanded,
  pruneDirExpansion,
  pruneDirPathsByWorkspace,
} from './prune';
import { DEFAULT_CONFIGURED_PORTS } from '../slices/browserSliceShared';
import type { TreeExpansion } from '../slices/uiSliceTypes';
import type {
  BackgroundConfig,
  BackgroundFit,
  BackgroundMode,
  BrowserBookmark,
  BrowserHistoryState,
  BrowserTabState,
  LocalPort,
  ShortcutSite,
  TabFolderState,
  WorkspaceBookmarkEntry,
} from '../slices/browserTypes';
import type { SearchEngine } from '../slices/browserSearchEnginesSlice';
import {
  LEFT_PANEL_WIDTH_MIN,
  LEFT_PANEL_WIDTH_MAX,
  DEFAULT_LEFT_PANEL_WIDTH,
  RIGHT_PANEL_WIDTH_MIN,
  RIGHT_PANEL_WIDTH_MAX,
  DEFAULT_RIGHT_PANEL_WIDTH,
  FILES_NAVIGATOR_WIDTH_MIN,
  FILES_NAVIGATOR_WIDTH_MAX,
  DEFAULT_FILES_NAVIGATOR_WIDTH,
  CHANGES_NAVIGATOR_WIDTH_MIN,
  CHANGES_NAVIGATOR_WIDTH_MAX,
  DEFAULT_CHANGES_NAVIGATOR_WIDTH,
  GITHUB_NAVIGATOR_WIDTH_MIN,
  GITHUB_NAVIGATOR_WIDTH_MAX,
  DEFAULT_GITHUB_NAVIGATOR_WIDTH,
  SETTINGS_NAVIGATOR_WIDTH_MIN,
  SETTINGS_NAVIGATOR_WIDTH_MAX,
  DEFAULT_SETTINGS_NAVIGATOR_WIDTH,
  BROWSER_NAVIGATOR_WIDTH_MIN,
  BROWSER_NAVIGATOR_WIDTH_MAX,
  DEFAULT_BROWSER_NAVIGATOR_WIDTH,
  defaultNavigatorCollapsed,
} from '../slices/uiSliceTypes';
import type {
  ToolId,
  FilesNavigatorMode,
  ChangesNavigatorMode,
  FilesSearchViewMode,
  FilesSearchScope,
  TerminalProfile,
} from '../types';
import type { HeatmapTab, ChartColorPreset } from '../slices/uiSliceTypes';
import {
  isTerminalProfile,
  readTerminalProfile,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
  type TerminalTabState,
} from '../slices/terminalSliceTypes';
import {
  terminalViewPrefsStore,
  normalizeTerminalViewPrefs,
} from '../../features/terminal/terminalViewPrefs';
import {
  terminalRegionCollapseStore,
  normalizeRegionCollapseMap,
  type RegionCollapse,
} from '../../features/terminal/terminalRegionCollapse';
import { terminalCwdStore } from '../../features/terminal/terminalCwdStore';
import {
  terminalHistoryStore,
  normalizeHistoryIndex,
  type TerminalHistorySegment,
} from '../../features/terminal/terminalHistoryStore';
import type { TerminalViewPrefs } from '../../features/terminal/terminalViewPrefs';

// ─────────────────────────────────────────────────────────────
// 浏览器面板条目的逐项形状校验器（Task 9）
//
// 数组类字段的每一项都会作为完整领域对象写入 store，单个畸形元素
// （字符串/null/缺关键字段）只会在渲染期暴露，故在读盘处整体拒绝、
// 回退 fallback（并记入 dirtyKeys 于本轮启动被覆盖）。
//
// 这些校验器同时被 composite.ts 的跨键归一化复用（见导出）：同一个键的
// "预期形状"在本应用只能有一份定义，否则弱化过的那一份会绕过登记表的
// 拒绝判定，把登记表已判损坏的值重新写回 store。
// ─────────────────────────────────────────────────────────────

export const isBrowserTab = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' && typeof item.title === 'string' && typeof item.url === 'string';

export const isBookmarkTabItem = (item: Record<string, unknown>): boolean =>
  typeof item.tabId === 'string' && typeof item.url === 'string' && typeof item.title === 'string';

export const isTabFolder = (item: Record<string, unknown>): boolean => {
  if (typeof item.id !== 'string' || typeof item.name !== 'string') {
    return false;
  }
  if (typeof item.createdAt !== 'number') {
    return false;
  }
  if (item.tabs === undefined) {
    return true;
  }
  return (
    Array.isArray(item.tabs) &&
    item.tabs.every((tab) => isPlainRecord(tab) && isBookmarkTabItem(tab))
  );
};

const isHistoryEntry = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' &&
  typeof item.title === 'string' &&
  typeof item.url === 'string' &&
  typeof item.visitedAt === 'number';

const isBookmark = (item: Record<string, unknown>): boolean =>
  typeof item.url === 'string' && typeof item.title === 'string';

const isShortcut = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' &&
  typeof item.name === 'string' &&
  typeof item.url === 'string' &&
  typeof item.sortOrder === 'number' &&
  typeof item.createdAt === 'number';

const isLocalPort = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' &&
  typeof item.host === 'string' &&
  typeof item.port === 'number' &&
  typeof item.sortOrder === 'number' &&
  typeof item.lastAliveAt === 'number';

const isSearchEngine = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' &&
  typeof item.name === 'string' &&
  typeof item.urlTemplate === 'string' &&
  typeof item.isBuiltIn === 'boolean' &&
  typeof item.isDefault === 'boolean';

const BACKGROUND_MODES: readonly BackgroundMode[] = ['default', 'image', 'video'];
const BACKGROUND_FITS: readonly BackgroundFit[] = ['cover', 'contain', 'repeat'];

// ─────────────────────────────────────────────────────────────
// 终端面板条目的逐项形状校验器（Task 10）
//
// 与浏览器条目同构：同一键的"预期形状"本应用只能有一份定义。
// `isTerminalTabState` 被登记表的 `read` 与 terminalComposite.ts 的跨键归一化
// 复用（见导出）；profile 白名单**只有一份定义**，在 slices/terminalSliceTypes.ts
// （`isTerminalProfile` / `readTerminalProfile`）—— 本文件不再抄一份字面量数组，
// 否则某处弱化过的判定会绕过登记表的拒绝分支（这是 T9 被退回的根因）。
// ─────────────────────────────────────────────────────────────

export const isTerminalTabState = (item: Record<string, unknown>): boolean => {
  if (typeof item.id !== 'string') {
    return false;
  }
  if (typeof item.workspaceId !== 'string') {
    return false;
  }
  if (typeof item.title !== 'string') {
    return false;
  }
  if (!isTerminalProfile(item.profile)) {
    return false;
  }
  if (item.status !== 'idle' && item.status !== 'running' && item.status !== 'terminated') {
    return false;
  }
  if (typeof item.isPinned !== 'boolean') {
    return false;
  }
  if (typeof item.sortOrder !== 'number') {
    return false;
  }
  return true;
};

/** 按工作区隔离的「默认终端类型」映射：任一值不是合法 profile 即整体拒绝 */
function readProfileMap(raw: unknown): Record<string, TerminalProfile> | undefined {
  const record = readStringRecord(raw);
  if (record === undefined) {
    return undefined;
  }
  const result: Record<string, TerminalProfile> = {};
  for (const [workspaceId, profile] of Object.entries(record)) {
    if (!isTerminalProfile(profile)) {
      return undefined;
    }
    result[workspaceId] = profile;
  }
  return result;
}

/** 背景配置：mode/fit 必须在白名单内，可选字符串字段按原样保留 */
function readBackgroundConfig(raw: unknown): BackgroundConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const mode = record.mode;
  const fit = record.fit;
  if (!BACKGROUND_MODES.includes(mode as BackgroundMode)) {
    return undefined;
  }
  if (!BACKGROUND_FITS.includes(fit as BackgroundFit)) {
    return undefined;
  }
  const result: BackgroundConfig = { mode: mode as BackgroundMode, fit: fit as BackgroundFit };
  if (typeof record.filePath === 'string') {
    result.filePath = record.filePath;
  }
  if (typeof record.fileName === 'string') {
    result.fileName = record.fileName;
  }
  return result;
}

/** 浏览器历史：与写入侧一致，最多保留最近 100 条 */
function readBrowserHistory(raw: unknown): BrowserHistoryState[] | undefined {
  const entries = readObjectArray<BrowserHistoryState>(isHistoryEntry)(raw);
  return entries?.slice(0, 100);
}

/**
 * 中心登记表 —— 全局唯一事实来源。
 *
 * 规则：
 * 1. 键名必须符合 parsePersistKey 的规范，且全域唯一（对象字面量重复键在编译期报错；
 *    该编译期保证以 registry 保持为对象字面量为前提，若改为运行时构造的映射
 *    ——如 Object.fromEntries——则必须重新引入运行时唯一性断言）。
 * 2. field 必须全局唯一 —— 同一 store 字段不得由两条键声明。
 * 3. 声明同步读取的条目，单条序列化体积必须 ≤ 32 KB。
 * 以上三条由 __tests__/registrySelfCheck.test.ts 强制校验（键名唯一性除外，见规则 1）。
 */
export const registry = {
  'adl:files.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:files.workspaceExpanded',
    field: 'workspaceTreeExpandedInFileNav',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
    prune: pruneByWorkspaceId,
  }),
  'adl:changes.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:changes.workspaceExpanded',
    field: 'workspaceChangesExpanded',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
    prune: pruneByWorkspaceId,
  }),

  // ─────────────────────────────────────────────────────────────
  // uiSlice 迁移批次（Task 7）：以下键取代原先散落在 uiSlice /
  // uiSliceWidths / uiSliceExpansion 中的 adl-ui:* 遗留键。
  // 全部写盘走 persistField()，全部读取走 hydrateAll()；无第二处水合。
  // ─────────────────────────────────────────────────────────────
  'adl:ui.leftCollapsed': defineEntry<boolean>({
    key: 'adl:ui.leftCollapsed',
    field: 'leftCollapsed',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.leftPanelWidth': defineEntry<number>({
    key: 'adl:ui.leftPanelWidth',
    field: 'leftbarWidth',
    fallback: DEFAULT_LEFT_PANEL_WIDTH,
    scope: 'global',
    read: readNumberInRange(LEFT_PANEL_WIDTH_MIN, LEFT_PANEL_WIDTH_MAX),
  }),
  'adl:ui.rightCollapsed': defineEntry<boolean>({
    key: 'adl:ui.rightCollapsed',
    field: 'rightCollapsed',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.rightPanelWidth': defineEntry<number>({
    key: 'adl:ui.rightPanelWidth',
    field: 'rightPanelWidth',
    fallback: DEFAULT_RIGHT_PANEL_WIDTH,
    scope: 'global',
    read: readNumberInRange(RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
  }),
  'adl:files.navigatorWidth': defineEntry<number>({
    key: 'adl:files.navigatorWidth',
    field: 'filesNavigatorWidth',
    fallback: DEFAULT_FILES_NAVIGATOR_WIDTH,
    scope: 'global',
    read: readNumberInRange(FILES_NAVIGATOR_WIDTH_MIN, FILES_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:changes.navigatorWidth': defineEntry<number>({
    key: 'adl:changes.navigatorWidth',
    field: 'changesNavigatorWidth',
    fallback: DEFAULT_CHANGES_NAVIGATOR_WIDTH,
    scope: 'global',
    read: readNumberInRange(CHANGES_NAVIGATOR_WIDTH_MIN, CHANGES_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:ui.githubNavigatorWidth': defineEntry<number>({
    key: 'adl:ui.githubNavigatorWidth',
    field: 'gitHubNavigatorWidth',
    fallback: DEFAULT_GITHUB_NAVIGATOR_WIDTH,
    scope: 'global',
    read: readNumberInRange(GITHUB_NAVIGATOR_WIDTH_MIN, GITHUB_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:ui.settingsNavigatorWidth': defineEntry<number>({
    key: 'adl:ui.settingsNavigatorWidth',
    field: 'settingsNavigatorWidth',
    fallback: DEFAULT_SETTINGS_NAVIGATOR_WIDTH,
    scope: 'global',
    read: readNumberInRange(SETTINGS_NAVIGATOR_WIDTH_MIN, SETTINGS_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:ui.navigatorCollapsed': defineEntry<Record<string, boolean>>({
    key: 'adl:ui.navigatorCollapsed',
    field: 'navigatorCollapsedByTool',
    fallback: defaultNavigatorCollapsed(),
    scope: 'global',
    read: readBooleanRecord,
  }),
  'adl:ui.activeRightTool': defineEntry<ToolId>({
    key: 'adl:ui.activeRightTool',
    field: 'activeRightTool',
    fallback: 'files',
    scope: 'global',
    // 旧值 'communicate'（已隐藏面板）不在白名单内，readStringEnum 回落 fallback 'files'。
    read: readStringEnum<ToolId>(['files', 'changes', 'browser', 'terminal', 'settings'] as const),
  }),
  'adl:files.navigatorMode': defineEntry<FilesNavigatorMode>({
    key: 'adl:files.navigatorMode',
    field: 'filesNavigatorMode',
    fallback: 'tree',
    scope: 'global',
    read: readStringEnum<FilesNavigatorMode>(['tree', 'search', 'outline'] as const),
  }),
  'adl:changes.navigatorMode': defineEntry<ChangesNavigatorMode>({
    key: 'adl:changes.navigatorMode',
    field: 'changesNavigatorMode',
    fallback: 'tree',
    scope: 'global',
    read: readStringEnum<ChangesNavigatorMode>(['tree', 'list', 'outline'] as const),
  }),
  'adl:files.searchView': defineEntry<FilesSearchViewMode>({
    key: 'adl:files.searchView',
    field: 'filesSearchView',
    fallback: 'list',
    scope: 'global',
    read: readStringEnum<FilesSearchViewMode>(['tree', 'list', 'outline'] as const),
  }),
  'adl:files.searchScope': defineEntry<FilesSearchScope>({
    key: 'adl:files.searchScope',
    field: 'filesSearchScope',
    fallback: 'content',
    scope: 'global',
    read: readStringEnum<FilesSearchScope>(['file', 'content'] as const),
  }),
  'adl:files.dirExpanded': defineEntry<Record<string, TreeExpansion>>({
    key: 'adl:files.dirExpanded',
    field: 'expandedFileTreePaths',
    fallback: {},
    scope: 'byWorkspaceId',
    // 外层按工作区拆开，逐个工作区交给 readDirExpansion 校验 + 修复跨字段不变量；
    // 任一工作区不合法 ⇒ 整条回退 fallback（旧版扁平值会被 readDirExpansion 拒绝，见其注释）。
    read: readDirExpansionRecord,
    prune: pruneDirExpansion,
  }),
  'adl:changes.dirExpanded': defineEntry<Record<string, TreeExpansion>>({
    key: 'adl:changes.dirExpanded',
    field: 'expandedChangesTreePaths',
    fallback: {},
    scope: 'byWorkspaceId',
    // 与文件侧同构：外层按工作区拆开逐个校验 + 修复，任一工作区不合法 ⇒ 整条回退。
    read: readDirExpansionRecord,
    prune: pruneDirExpansion,
  }),
  'adl:files.previewMode': defineEntry<Record<string, Record<string, boolean>>>({
    key: 'adl:files.previewMode',
    field: 'filePreviewModeByPath',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanPropRecord,
    prune: pruneDirPathsByWorkspace,
  }),
  'adl:changes.previewEnabled': defineEntry<boolean>({
    key: 'adl:changes.previewEnabled',
    field: 'changesPreviewEnabled',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:changes.showGitVisualization': defineEntry<boolean>({
    key: 'adl:changes.showGitVisualization',
    field: 'showGitVisualization',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:changes.activeHeatmapTab': defineEntry<HeatmapTab>({
    key: 'adl:changes.activeHeatmapTab',
    field: 'activeHeatmapTab',
    fallback: 'calendar',
    scope: 'global',
    read: readStringEnum<HeatmapTab>(['calendar', 'clock', 'activity', 'module'] as const),
  }),
  'adl:changes.activeWorkspaceTab': defineEntry<string>({
    key: 'adl:changes.activeWorkspaceTab',
    field: 'activeWorkspaceTab',
    fallback: 'workspace-1',
    scope: 'global',
    read: (raw) => (typeof raw === 'string' ? raw : undefined),
  }),
  'adl:changes.chartColorPreset': defineEntry<ChartColorPreset>({
    key: 'adl:changes.chartColorPreset',
    field: 'chartColorPreset',
    fallback: 'bklit-default',
    scope: 'global',
    read: readStringEnum<ChartColorPreset>([
      'bklit-default',
      'cool-ocean',
      'warm-sunset',
      'high-contrast',
    ] as const),
  }),

  // ─────────────────────────────────────────────────────────────
  // 浏览器面板迁移批次（Task 9）：以下键取代原先散落在 browser*Slice /
  // uiSliceWidths 中的 adl-ui:browser-* 与 adl:browser:* 遗留键。
  // 全部写盘走 persist()/persistField()，全部读取走 hydrateAll()（同步，唯一水合时机）；
  // browserSlice 的 requestIdleCallback/setTimeout 延迟水合已随本任务删除。
  //
  // 例外：adl-ui:browser-workspace-expanded（browserWorkspaceExpanded）**不登记** ——
  // 无消费者的死状态，由 Task 20 删除；其字面量暂时保留在生产源码与 PERSIST_KEEP_KEYS 中。
  // ─────────────────────────────────────────────────────────────
  'adl:browser.tabs': defineEntry<BrowserTabState[]>({
    key: 'adl:browser.tabs',
    field: 'browserTabs',
    fallback: [],
    scope: 'global',
    read: readObjectArray<BrowserTabState>(isBrowserTab),
  }),
  'adl:browser.activeTabId': defineEntry<string>({
    key: 'adl:browser.activeTabId',
    field: 'browserActiveTabId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  'adl:browser.tabFolders': defineEntry<TabFolderState[]>({
    key: 'adl:browser.tabFolders',
    field: 'browserTabFolders',
    fallback: [],
    scope: 'global',
    read: readObjectArray<TabFolderState>(isTabFolder),
  }),
  'adl:browser.tabTreeExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:browser.tabTreeExpanded',
    field: 'browserTabTreeExpanded',
    fallback: {},
    scope: 'byTabId',
    read: readBooleanRecord,
    prune: pruneBrowserTreeExpanded,
  }),
  'adl:browser.history': defineEntry<BrowserHistoryState[]>({
    key: 'adl:browser.history',
    field: 'browserHistory',
    fallback: [],
    scope: 'global',
    read: readBrowserHistory,
  }),
  'adl:browser.bookmarks': defineEntry<BrowserBookmark[]>({
    key: 'adl:browser.bookmarks',
    field: 'browserBookmarks',
    fallback: [],
    scope: 'global',
    read: readObjectArray<BrowserBookmark>(isBookmark),
  }),
  'adl:browser.workspaceBookmarks': defineEntry<Record<string, WorkspaceBookmarkEntry[]>>({
    key: 'adl:browser.workspaceBookmarks',
    field: 'browserWorkspaceBookmarks',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readObjectArrayRecord<WorkspaceBookmarkEntry>(isBookmarkTabItem),
    prune: pruneByWorkspaceId,
  }),
  'adl:browser.tabIdUrlMap': defineEntry<Record<string, string>>({
    key: 'adl:browser.tabIdUrlMap',
    field: 'browserBookmarkTabIdUrlMap',
    fallback: {},
    scope: 'global',
    read: readStringRecord,
  }),
  'adl:browser.shortcuts': defineEntry<ShortcutSite[]>({
    key: 'adl:browser.shortcuts',
    field: 'browserShortcuts',
    fallback: [],
    scope: 'global',
    read: readObjectArray<ShortcutSite>(isShortcut),
  }),
  'adl:browser.localPorts': defineEntry<LocalPort[]>({
    key: 'adl:browser.localPorts',
    field: 'browserLocalPorts',
    fallback: [],
    scope: 'global',
    read: readObjectArray<LocalPort>(isLocalPort),
  }),
  'adl:browser.bgConfig': defineEntry<BackgroundConfig>({
    key: 'adl:browser.bgConfig',
    field: 'browserBgConfig',
    fallback: { mode: 'default', fit: 'cover' },
    scope: 'global',
    read: readBackgroundConfig,
  }),
  'adl:browser.configuredPorts': defineEntry<number[]>({
    key: 'adl:browser.configuredPorts',
    field: 'browserConfiguredPorts',
    fallback: [...DEFAULT_CONFIGURED_PORTS],
    scope: 'global',
    read: readNumberArray,
  }),
  'adl:browser.navigatorWidth': defineEntry<number>({
    key: 'adl:browser.navigatorWidth',
    field: 'browserNavigatorWidth',
    fallback: DEFAULT_BROWSER_NAVIGATOR_WIDTH,
    scope: 'global',
    read: readNumberInRange(BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:browser.navigateInPlace': defineEntry<boolean>({
    key: 'adl:browser.navigateInPlace',
    field: 'browserNavigateInPlace',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:browser.searchEngines': defineEntry<SearchEngine[]>({
    key: 'adl:browser.searchEngines',
    field: 'searchEngines',
    fallback: [],
    scope: 'global',
    read: readObjectArray<SearchEngine>(isSearchEngine),
  }),
  'adl:browser.defaultSearchEngineId': defineEntry<string>({
    key: 'adl:browser.defaultSearchEngineId',
    field: 'defaultSearchEngineId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),

  // ─────────────────────────────────────────────────────────────
  // 终端面板迁移批次（Task 10）：以下键取代 adl-ui:terminal-* 与 adl-terminal:* 遗留键。
  // 全部写盘走 persist()/persistField()，全部读取走 hydrateAll()（同步，唯一水合时机）；
  // terminalSlice 的 requestIdleCallback/setTimeout 延迟水合已随本任务删除。
  //
  // 甲类（store 字段）：hydrateAll 写补丁；乙类（外部模块级微型存储）：hydrateAll 调 apply
  // 交回模块缓存。乙类无 prune（见 brief：剪枝归 Task 15/17）。historyIndex 唯一 sync:false。
  // ─────────────────────────────────────────────────────────────
  'adl:terminal.tabs': defineEntry<TerminalTabState[]>({
    key: 'adl:terminal.tabs',
    field: 'terminalTabs',
    fallback: [],
    scope: 'global',
    read: readObjectArray<TerminalTabState>(isTerminalTabState),
  }),
  'adl:terminal.activeTabId': defineEntry<string>({
    key: 'adl:terminal.activeTabId',
    field: 'terminalActiveTabId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  'adl:terminal.defaultProfile': defineEntry<TerminalProfile>({
    key: 'adl:terminal.defaultProfile',
    field: 'defaultTerminalProfile',
    fallback: 'powershell',
    scope: 'global',
    read: readTerminalProfile,
  }),
  'adl:terminal.workspaceDefaultProfiles': defineEntry<Record<string, TerminalProfile>>({
    key: 'adl:terminal.workspaceDefaultProfiles',
    field: 'workspaceDefaultProfiles',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readProfileMap,
    prune: pruneByWorkspaceId,
  }),
  'adl:terminal.shellSelectorProfile': defineEntry<TerminalProfile>({
    key: 'adl:terminal.shellSelectorProfile',
    field: 'shellSelectorProfile',
    fallback: 'powershell',
    scope: 'global',
    read: readTerminalProfile,
  }),
  'adl:terminal.navigatorWidth': defineEntry<number>({
    key: 'adl:terminal.navigatorWidth',
    field: 'terminalNavigatorWidth',
    fallback: DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    scope: 'global',
    // 读侧边界必须与写侧（setTerminalNavigatorWidth 的 clamp）同源：
    // 曾经写死的 180–480 比写侧的 180–300 宽，会接住任何 setter 都产不出的值。
    read: readNumberInRange(TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX),
  }),
  'adl:terminal.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:terminal.workspaceExpanded',
    field: 'terminalWorkspaceExpanded',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
    prune: pruneByWorkspaceId,
  }),
  'adl:terminal.workspaceId': defineEntry<string>({
    key: 'adl:terminal.workspaceId',
    field: 'terminalWorkspaceId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),

  // 乙类：水合目标为 features/terminal/* 的模块级微型存储（apply 交回缓存）
  'adl:terminal.viewPrefs': defineEntry<TerminalViewPrefs>({
    key: 'adl:terminal.viewPrefs',
    apply: (value) => terminalViewPrefsStore.apply(value),
    fallback: { mode: 'single', historyFirst: true, historyRatio: 0.32 },
    scope: 'global',
    read: normalizeTerminalViewPrefs,
  }),
  'adl:terminal.regionCollapse': defineEntry<Record<string, RegionCollapse>>({
    key: 'adl:terminal.regionCollapse',
    apply: (value) => terminalRegionCollapseStore.apply(value),
    fallback: {},
    scope: 'byTabId',
    read: normalizeRegionCollapseMap,
  }),
  'adl:terminal.cwdByTab': defineEntry<Record<string, string>>({
    key: 'adl:terminal.cwdByTab',
    apply: (value) => terminalCwdStore.apply(value),
    fallback: {},
    scope: 'byTabId',
    read: readStringRecord,
  }),
  'adl:terminal.historyIndex': defineEntry<Record<string, TerminalHistorySegment[]>>({
    key: 'adl:terminal.historyIndex',
    apply: (value) => terminalHistoryStore.apply(value),
    fallback: {},
    scope: 'byTabId',
    read: normalizeHistoryIndex,
    sync: false,
  }),

  // ─────────────────────────────────────────────────────────────
  // 检索面板迁移批次（Task 11）：以下键取代 adl-search:* 遗留键。
  // 全部写盘走 persist()/persistField()，全部读取走 hydrateAll()（同步，唯一水合时机）。
  // searchMaxResults 的「page>max 自愈」与 searchLimit 的「首屏对齐步长」由
  // searchComposite.ts 的复合水合器承接（见 Step 1b），因为 searchLimit 不是持久化字段。
  // ─────────────────────────────────────────────────────────────
  'adl:search.pageSize': defineEntry<number>({
    key: 'adl:search.pageSize',
    field: 'searchPageSize',
    fallback: SEARCH_PAGE_SIZE,
    scope: 'global',
    // 读侧边界与写侧（setSearchPageSize 的 clamp）同源；必须 floor（旧读路径 Math.floor）。
    read: readFlooredNumberInRange(SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX),
  }),
  'adl:search.maxResults': defineEntry<number>({
    key: 'adl:search.maxResults',
    field: 'searchMaxResults',
    fallback: SEARCH_MAX_RESULTS,
    scope: 'global',
    // 下界是 SEARCH_PAGE_SIZE（200）而非某 MIN 常量；floor 同 pageSize（Task 11 控制器裁定）。
    read: readFlooredNumberInRange(SEARCH_PAGE_SIZE, SEARCH_HARD_MAX_RESULTS),
  }),
  'adl:search.ignoredPaths': defineEntry<Record<string, string[]>>({
    key: 'adl:search.ignoredPaths',
    field: 'searchIgnoredPaths',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readSearchIgnoredPaths,
    prune: pruneByWorkspaceId,
  }),
  'adl:search.useGitignore': defineEntry<Record<string, boolean>>({
    key: 'adl:search.useGitignore',
    field: 'searchUseGitignore',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readSearchUseGitignore,
    prune: pruneByWorkspaceId,
  }),
} as const;

export type Registry = typeof registry;

export type RegistryKey = keyof Registry;

export type RegistryValue<K extends RegistryKey> =
  Registry[K] extends PersistEntry<infer T> ? T : never;

/** 供自检测试遍历用（registry 的 as const 类型对遍历不友好） */
export const registryEntries: PersistEntry<unknown>[] = Object.values(
  registry,
) as PersistEntry<unknown>[];

/**
 * 启动清理的保留名单（allowlist）。
 *
 * ⚠️ 安全关键：cleanupUnregisteredKeys() 会删除 adl: 命名空间下所有"不在 registry 内"的键。
 * 迁移是分批进行的（Task 7/9/10/11/21/29），在 registry 完成接管前，
 * **全部遗留键字面量都必须列入本清单**，否则首次启动即清空用户的宽度/展开态/
 * 浏览器标签/终端标签/CI 快照/访问令牌等全部 UI 状态。
 *
 * 本清单由下面的命令生成（不要手工增删）：
 *   cd ai-digital-life && grep -rhoE "'adl-(ui|terminal|search|browser):[a-zA-Z0-9:._-]+'" \
 *     frontend/src --include=*.ts --include=*.tsx | grep -v "__tests__" | sort -u
 *
 * 维护规则（由 __tests__/keepListGuard.test.ts 强制）：
 * 1. 任何遗留键字面量必须"已登记 或 在本清单内" —— 否则守卫测试变红，杜绝漏保护。
 * 2. 本清单不得包含已登记的键 —— 每个迁移任务（Task 7/9/10/11/21/29）必须把自己
 *    刚登记的键从本清单删除，守卫测试会强制这一点（迫使清单逐步收窄）。
 * 3. 全部迁移任务完成后（Task 29），本清单必须为空 —— 此时启动清理才真正开始
 *    清除遗留键，命名空间门禁随之生效。
 */
export const PERSIST_KEEP_KEYS = new Set<string>([
  'adl-ui:active-communicate-platform',
  'adl-ui:active-github-section',
  'adl-ui:browser-workspace-expanded',
  'adl-ui:changes-branch',
  'adl-ui:ci-access-token',
  'adl-ui:ci-auto-refresh-on-push',
  'adl-ui:ci-config',
  'adl-ui:ci-log-caches',
  'adl-ui:ci-snapshots',
  'adl-ui:clipboard-scroll-top',
  'adl-ui:communicate-navigator-collapsed',
  'adl-ui:github-access-token',
  'adl-ui:github-ci-folders',
  'adl-ui:github-workspace-configs',
  'adl-ui:right-panel-last-restorable-width',
  'adl-ui:right-panel-mode',
  'adl-ui:sysmon-collapsed',
  'adl-ui:sysmon-scroll-top',
]);
