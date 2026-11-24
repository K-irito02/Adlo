import { defineEntry, readBooleanRecord, type PersistEntry } from './entry';
import { pruneBrowserHistory } from '../browserHistoryRetention';
import {
  readFlag,
  readNumberInRange,
  readFlooredNumberInRange,
  readStringEnum,
  readString,
  readStringRecord,
  readStringArray,
  readStringArrayRecord,
  readSearchFlags,
  readClickedNodeRecord,
  readStringSet,
  readZoomByTab,
  readNumberArray,
  readObjectArray,
  readObjectArrayRecord,
  readSearchIgnoredPaths,
  readSearchUseGitignore,
  readBooleanPropRecord,
  readDirExpansionRecord,
  readSessionLastFile,
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
  NON_WORKSPACE_PRESERVED_KEYS,
  pruneByTabId,
  pruneBrowserTreeExpanded,
  pruneCenterTabs,
  pruneDirExpansion,
  pruneDirPathsByWorkspace,
} from './prune';
import { DEFAULT_CONFIGURED_PORTS } from '../slices/browserSliceShared';
import type { CenterTabState } from '../slices/centerTabsTypes';
import type { TreeExpansion } from '../slices/uiSliceTypes';
import type {
  BackgroundConfig,
  BackgroundFit,
  BackgroundMode,
  BookmarkEntry,
  BookmarkFolder,
  BrowserBookmark,
  BrowserHistoryState,
  BrowserTabState,
  LocalPort,
  ShortcutSite,
} from '../slices/browserTypes';
import type { SearchEngine } from '../slices/browserSearchEnginesSlice';
import type { BrowserNavigatorMode } from '../../features/browser/useBrowserTabs';
import type { BrowserSearchScope } from '../../features/browser/useBrowserSearch';
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
  SETTINGS_SEARCH_HISTORY_MAX,
  SETTINGS_SEARCH_HISTORY_MAX_LENGTH,
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
import type {
  HeatmapTab,
  ChartColorPreset,
  LightMarkdownTheme,
  DarkMarkdownTheme,
} from '../slices/uiSliceTypes';
import {
  isTerminalProfile,
  readTerminalProfile,
  readTerminalPanes,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  type TerminalTabState,
} from '../slices/terminalSliceTypes';
import { terminalCwdStore } from '../../features/terminal/terminalCwdStore';
import {
  normalizePaneLayoutMap,
  terminalPaneLayoutStore,
  type TerminalPaneLayout,
} from '../../features/terminal/terminalPaneLayout';
import type { SearchFlags } from '../slices/searchSlice';
import type { FileTreeClickedNode, SessionLastFile } from '../slices/editorSlice';
import { applyPersistedScrollTop, MAX_SCROLL_TOP } from '../../hooks/usePersistedScrollTop';
import {
  applyClipboardViewerPreview,
  applyClipboardViewerWrap,
} from '../../features/clipboard-history/clipboardViewerPrefs';
import {
  applyRightPanelMode,
  applyRightPanelLastRestorableWidth,
  RIGHT_PANEL_MODES,
  type RightPanelMode,
} from '../../regions/right-panel/rightPanelLayout';
import { EDITOR_VIEWPORT_KEY, readEditorViewport, type PersistedViewport } from './viewport';
import type { ChangeFileState } from '../../regions/right-panel/changesTree';
import {
  DEFAULT_APP_UPDATE_PERSISTED,
  type AppUpdatePersistedState,
} from '../slices/appUpdateSlice';

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

export const isBrowserTab = (item: Record<string, unknown>): boolean => {
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.url !== 'string'
  ) {
    return false;
  }
  if (item.location !== undefined && item.location !== 'panel' && item.location !== 'center') {
    return false;
  }
  if (item.shareProfile !== undefined && typeof item.shareProfile !== 'boolean') {
    return false;
  }
  return true;
};

export const isBookmarkEntry = (item: Record<string, unknown>): boolean =>
  typeof item.id === 'string' &&
  typeof item.url === 'string' &&
  typeof item.title === 'string' &&
  typeof item.addedAt === 'number' &&
  typeof item.lastModifiedAt === 'number' &&
  (item.sourceTabId === undefined || typeof item.sourceTabId === 'string');

export const isBookmarkFolder = (item: Record<string, unknown>): boolean => {
  if (typeof item.id !== 'string' || typeof item.name !== 'string') {
    return false;
  }
  if (typeof item.createdAt !== 'number') {
    return false;
  }
  if (item.entries === undefined) {
    return true;
  }
  return (
    Array.isArray(item.entries) &&
    item.entries.every((entry) => isPlainRecord(entry) && isBookmarkEntry(entry))
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

// 中心标签（Task 5）：kind 白名单 + refId string|null + createdAt number。
// 与浏览器/终端条目同构 —— 逐项校验，畸形元素整体拒绝，避免渲染期才暴露。
const CENTER_TAB_KINDS = ['launcher', 'browser', 'terminal'] as const;
export const isCenterTab = (item: Record<string, unknown>): boolean => {
  if (typeof item.id !== 'string') {
    return false;
  }
  if (!(CENTER_TAB_KINDS as readonly unknown[]).includes(item.kind)) {
    return false;
  }
  if (item.refId !== null && typeof item.refId !== 'string') {
    return false;
  }
  return typeof item.createdAt === 'number';
};

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
  // 窗格数组必须存在且至少含一个合法窗格（spec §5.1「至少 1 个」）。
  // 旧标签数据（无 panes）在此被整体拒绝，由 readObjectArray 回退空数组，不做迁移。
  const panes = readTerminalPanes(item.panes);
  if (panes === undefined || panes.length === 0) {
    return false;
  }
  if (item.activePaneId !== undefined && typeof item.activePaneId !== 'string') {
    return false;
  }
  if (typeof item.isPinned !== 'boolean') {
    return false;
  }
  if (typeof item.sortOrder !== 'number') {
    return false;
  }
  if (item.location !== undefined && item.location !== 'panel' && item.location !== 'center') {
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

/** 浏览器历史：与写入侧一致，最多 1000 条 / 180 天（读侧同样裁剪）。 */
function readBrowserHistory(raw: unknown): BrowserHistoryState[] | undefined {
  const entries = readObjectArray<BrowserHistoryState>(isHistoryEntry)(raw);
  return entries ? pruneBrowserHistory(entries) : undefined;
}

/**
 * 设置搜索历史：读取侧同样**规整**后再交给 store —— trim → 丢空 → 去重（保留首个）→ 截断条数。
 * 顺序有意如此：先规整再截断，否则超出上限的脏数据（如 `['', ' a ', 'a']`）会先吃掉名额、
 * 把真正有效但排后的条目挤掉。写入侧只保证「本进程写出的」形态干净；手工改过 localStorage、
 * 旧版本残留或未来写入路径变更都可能带入脏数据，而消费方（卡片的非空/已去重契约、`key={item}`）
 * 依赖它成立。
 */
function readSettingsSearchHistory(raw: unknown): string[] | undefined {
  const entries = readStringArray(raw);
  if (!entries) {
    return undefined;
  }
  const normalized: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim().slice(0, SETTINGS_SEARCH_HISTORY_MAX_LENGTH);
    if (trimmed !== '' && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
      // 攒满上限即止：后续条目无论去重与否都会被末尾截掉 —— 纯加速（脏数据规模异常时
      // 把最坏 O(n²) 的去重比较压回 O(n)），截断语义与不加早退严格等价。
      if (normalized.length === SETTINGS_SEARCH_HISTORY_MAX) {
        break;
      }
    }
  }
  return normalized.slice(0, SETTINGS_SEARCH_HISTORY_MAX);
}

/**
 * 应用更新的持久偏好：四个字段都允许 `null`（从未发生过），其余类型一律拒绝并回退
 * 默认值。`skippedVersion` 是版本号字符串，跨版本升级后自然失效（新版本 ≠ 跳过值）。
 */
function readAppUpdatePersisted(raw: unknown): AppUpdatePersistedState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const isNullableString = (value: unknown) => value === null || typeof value === 'string';
  const isNullableTimestamp = (value: unknown) =>
    value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (
    !isNullableString(record.skippedVersion) ||
    !isNullableString(record.lastPromptedVersion) ||
    !isNullableTimestamp(record.lastPromptedAt) ||
    !isNullableTimestamp(record.lastCheckedAt)
  ) {
    return undefined;
  }
  return {
    skippedVersion: record.skippedVersion as string | null,
    lastPromptedVersion: record.lastPromptedVersion as string | null,
    lastPromptedAt: record.lastPromptedAt as number | null,
    lastCheckedAt: record.lastCheckedAt as number | null,
  };
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
  'adl:ui.settingsSearchHistory': defineEntry<string[]>({
    key: 'adl:ui.settingsSearchHistory',
    field: 'settingsSearchHistory',
    fallback: [],
    scope: 'global',
    read: readSettingsSearchHistory,
  }),
  'adl:ui.navigatorCollapsed': defineEntry<Record<string, boolean>>({
    key: 'adl:ui.navigatorCollapsed',
    field: 'navigatorCollapsedByTool',
    fallback: defaultNavigatorCollapsed(),
    scope: 'global',
    read: readBooleanRecord,
  }),
  // 右侧面板第一行工具栏折叠态：全局统一一份（不按面板分别持久化），
  // 供工具切换器「折叠/展开工具栏」按钮写、RightPanel 根节点读。
  'adl:ui.rightPanelToolbarCollapsed': defineEntry<boolean>({
    key: 'adl:ui.rightPanelToolbarCollapsed',
    field: 'rightPanelToolbarCollapsed',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.activeRightTool': defineEntry<ToolId>({
    key: 'adl:ui.activeRightTool',
    field: 'activeRightTool',
    fallback: 'files',
    scope: 'global',
    // 旧值 'communicate'（已删除面板）的本地残留不在白名单内，readStringEnum 回落 fallback 'files'。
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
  'adl:files.childOrder': defineEntry<Record<string, string[]>>({
    key: 'adl:files.childOrder',
    field: 'fileChildOrder',
    fallback: {},
    scope: 'global',
    // 键 = 工作区路径 + NUL + 目录相对路径；只校验「字符串 → 字符串数组」形状。
    // 陈旧工作区键不主动清理（体积小，工作区移除后再加回仍能命中旧顺序）。
    read: readStringArrayRecord,
  }),
  'adl:files.previewMode': defineEntry<Record<string, Record<string, boolean>>>({
    key: 'adl:files.previewMode',
    field: 'filePreviewModeByPath',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanPropRecord,
    prune: pruneDirPathsByWorkspace,
  }),
  // ─────────────────────────────────────────────────────────────
  // 文件面板子状态补齐（Task 22）：树选中节点（三字段合一，避免三次写盘；
  // 重复选中同一节点时 setter 提前 return，不写盘）+ 检索三开关（单对象一次落盘）
  // + 文件大纲展开（组件本地 state 上提 store，挂载时按工作区回填）。
  // ─────────────────────────────────────────────────────────────
  'adl:files.clickedNode': defineEntry<Record<string, FileTreeClickedNode>>({
    key: 'adl:files.clickedNode',
    field: 'fileTreeClicked',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readClickedNodeRecord,
    prune: pruneByWorkspaceId,
  }),
  // ─────────────────────────────────────────────────────────────
  // 面板"选中工作区"持久化（事项1 方案A）：点击工作区根/树节点只写会话态，
  // 重启后回退 derivedActive（后端 current_workspace）导致高亮恒落最新打开。
  // fallback 用 null 而非 undefined（registrySelfCheck 的 32KB 断言对 fallback
  // 做 JSON.stringify，undefined 会抛；约定与 adl:session.lastFile 同理）。
  // scope 为 global 且无 prune —— 陈旧 id（工作区已移除）由 FileNavigatorShell /
  // useChangesFilters 按 recentWorkspaces 做派生式回退，不写回 store，避免构造期
  // 清单为空时误删（规格 §3.5.1）。
  // ─────────────────────────────────────────────────────────────
  'adl:files.activeWorkspace': defineEntry<string | null>({
    key: 'adl:files.activeWorkspace',
    field: 'fileNavigatorActiveWorkspaceId',
    fallback: null,
    scope: 'global',
    read: (raw) => (raw === null ? null : readString(raw)),
  }),
  'adl:changes.activeWorkspace': defineEntry<string | null>({
    key: 'adl:changes.activeWorkspace',
    field: 'changesNavigatorActiveWorkspaceId',
    fallback: null,
    scope: 'global',
    read: (raw) => (raw === null ? null : readString(raw)),
  }),
  'adl:files.searchFlags': defineEntry<SearchFlags>({
    key: 'adl:files.searchFlags',
    field: 'searchFlags',
    fallback: { matchCase: false, matchWholeWord: false, useRegex: false },
    scope: 'global',
    read: readSearchFlags,
  }),
  'adl:files.outlineExpanded': defineEntry<Record<string, string[]>>({
    key: 'adl:files.outlineExpanded',
    field: 'filesOutlineExpanded',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readStringArrayRecord,
    prune: pruneByWorkspaceId,
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
  'adl:files.markdownThemeLight': defineEntry<LightMarkdownTheme>({
    key: 'adl:files.markdownThemeLight',
    field: 'lightMarkdownTheme',
    fallback: 'light',
    scope: 'global',
    read: readStringEnum<LightMarkdownTheme>(['light', 'light-colorblind'] as const),
  }),
  'adl:files.markdownThemeDark': defineEntry<DarkMarkdownTheme>({
    key: 'adl:files.markdownThemeDark',
    field: 'darkMarkdownTheme',
    fallback: 'dark',
    scope: 'global',
    read: readStringEnum<DarkMarkdownTheme>([
      'dark',
      'dark-dimmed',
      'dark-high-contrast',
      'dark-colorblind',
    ] as const),
  }),
  // ─────────────────────────────────────────────────────────────
  // 变更面板子状态补齐（Task 23）：状态过滤器（store 持 Set、落盘转数组，
  // 读侧 readStringSet 把非法成员逐个过滤；空集 = 不过滤）+ 变更大纲展开
  // （组件本地 state 上提 store，挂载时按工作区回填）+ diff 行号/换行开关。
  // ─────────────────────────────────────────────────────────────
  'adl:changes.statusFilter': defineEntry<Set<ChangeFileState>>({
    key: 'adl:changes.statusFilter',
    field: 'changesStatusFilter',
    fallback: new Set(),
    scope: 'global',
    read: readStringSet<ChangeFileState>([
      'staged',
      'modified',
      'untracked',
      'conflicted',
    ] as const),
  }),
  'adl:changes.outlineExpanded': defineEntry<Record<string, string[]>>({
    key: 'adl:changes.outlineExpanded',
    field: 'changesOutlineExpanded',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readStringArrayRecord,
    prune: pruneByWorkspaceId,
  }),
  'adl:changes.lineNumbers': defineEntry<boolean>({
    key: 'adl:changes.lineNumbers',
    field: 'changesLineNumbers',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:changes.wordWrap': defineEntry<boolean>({
    key: 'adl:changes.wordWrap',
    field: 'changesWordWrap',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),

  // ─────────────────────────────────────────────────────────────
  // 浏览器面板迁移批次（Task 9）：以下键取代原先散落在 browser*Slice /
  // uiSliceWidths 中的 adl-ui:browser-* 与 adl:browser:* 遗留键。
  // 全部写盘走 persist()/persistField()，全部读取走 hydrateAll()（同步，唯一水合时机）；
  // browserSlice 的 requestIdleCallback/setTimeout 延迟水合已随本任务删除。
  //
  // 工作区行展开死状态已由 Task 20 全套删除，此处不再为例外。
  // ─────────────────────────────────────────────────────────────
  'adl:browser.tabs': defineEntry<BrowserTabState[]>({
    key: 'adl:browser.tabs',
    field: 'browserTabs',
    fallback: [],
    scope: 'global',
    // dsh 标签是普通浏览器标签，跨重启持久化（其承载的 dsh 进程由应用启动期重新拉起）。
    read: (raw) => readObjectArray<BrowserTabState>(isBrowserTab)(raw),
  }),
  'adl:browser.activeTabId': defineEntry<string>({
    key: 'adl:browser.activeTabId',
    field: 'browserActiveTabId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  'adl:browser.bookmarkFolders': defineEntry<BookmarkFolder[]>({
    key: 'adl:browser.bookmarkFolders',
    field: 'browserBookmarkFolders',
    fallback: [],
    scope: 'global',
    read: readObjectArray<BookmarkFolder>(isBookmarkFolder),
  }),
  'adl:browser.bookmarkChildOrder': defineEntry<Record<string, string[]>>({
    key: 'adl:browser.bookmarkChildOrder',
    field: 'browserBookmarkChildOrder',
    fallback: {},
    scope: 'global',
    read: readStringArrayRecord,
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
  'adl:browser.workspaceBookmarks': defineEntry<Record<string, BookmarkEntry[]>>({
    key: 'adl:browser.workspaceBookmarks',
    field: 'browserWorkspaceBookmarks',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readObjectArrayRecord<BookmarkEntry>(isBookmarkEntry),
    prune: pruneByWorkspaceId,
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
  'adl:browser.shareProfile': defineEntry<boolean>({
    key: 'adl:browser.shareProfile',
    field: 'browserShareProfile',
    fallback: true,
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
  // 是否已完成首次引擎选择（自动或手动）：true 后启动期不再探测，避免覆盖用户选择。
  'adl:browser.searchEngineAutoSelected': defineEntry<boolean>({
    key: 'adl:browser.searchEngineAutoSelected',
    field: 'searchEngineAutoSelected',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  // ─────────────────────────────────────────────────────────────
  // 浏览器面板子状态补齐（Task 24）：导航子视图模式 + 导航检索范围（检索词
  // 本体是瞬态草稿，不登记，同 T22）+ 树选中项（"点击外部即清空"保留，
  // 清空同样落盘 null，否则重启高亮已放弃项）+ 每标签缩放（按标签隔离，
  // 关标签经 pruneByTabId 清理）+ 三大类区展开（记录驱动，无记录默认展开）。
  // ─────────────────────────────────────────────────────────────
  'adl:browser.navigatorMode': defineEntry<BrowserNavigatorMode>({
    key: 'adl:browser.navigatorMode',
    field: 'browserNavigatorMode',
    fallback: 'tree',
    scope: 'global',
    read: readStringEnum<BrowserNavigatorMode>(['open', 'tree', 'list', 'search'] as const),
  }),
  'adl:browser.searchScope': defineEntry<BrowserSearchScope>({
    key: 'adl:browser.searchScope',
    field: 'browserSearchScope',
    fallback: 'all',
    scope: 'global',
    read: readStringEnum<BrowserSearchScope>(['bookmarks', 'history', 'all'] as const),
  }),
  'adl:browser.selectedTreePath': defineEntry<string | null>({
    key: 'adl:browser.selectedTreePath',
    field: 'browserSelectedTreePath',
    fallback: null,
    scope: 'global',
    // null（用户清空）是合法持久值；只有类型不符才回退（仍为 null）并记脏
    read: (raw) => (raw === null || typeof raw === 'string' ? raw : undefined),
  }),
  'adl:browser.zoomByTab': defineEntry<Record<string, number>>({
    key: 'adl:browser.zoomByTab',
    field: 'browserZoomByTab',
    fallback: {},
    scope: 'byTabId',
    read: readZoomByTab,
    prune: pruneByTabId,
  }),

  // ─────────────────────────────────────────────────────────────
  // 终端面板迁移批次（Task 10）：以下键取代 adl-ui:terminal-* 与 adl-terminal:* 遗留键。
  // 全部写盘走 persist()/persistField()，全部读取走 hydrateAll()（同步，唯一水合时机）；
  // terminalSlice 的 requestIdleCallback/setTimeout 延迟水合已随本任务删除。
  //
  // 甲类（store 字段）：hydrateAll 写补丁；乙类（外部模块级微型存储）：hydrateAll 调 apply
  // 交回模块缓存。乙类无 prune（见 brief：剪枝归 Task 15/17）。
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
    // `__independent__`（终端"默认终端目录"）不是工作区 id，必须豁免，
    // 否则每次剪枝删除它，重启后该目录必展开（事项 3 根因）。
    prune: (value, ctx) => pruneByWorkspaceId(value, ctx, NON_WORKSPACE_PRESERVED_KEYS),
  }),
  'adl:terminal.workspaceId': defineEntry<string>({
    key: 'adl:terminal.workspaceId',
    field: 'terminalWorkspaceId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  'adl:terminal.showPaneBorders': defineEntry<boolean>({
    key: 'adl:terminal.showPaneBorders',
    field: 'terminalShowPaneBorders',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:terminal.showActiveHighlight': defineEntry<boolean>({
    key: 'adl:terminal.showActiveHighlight',
    field: 'terminalShowActiveHighlight',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:terminal.fontSize': defineEntry<number>({
    key: 'adl:terminal.fontSize',
    field: 'terminalFontSize',
    fallback: TERMINAL_FONT_SIZE_DEFAULT,
    scope: 'global',
    // 读写同源：写侧 clampTerminalFontSize（钳制 + 取整），读侧同范围钳制后再取整。
    // 不直接用 readFlooredNumberInRange：它是 floor 语义（13.7→13），与写侧 round 分叉。
    read: (raw: unknown) => {
      const value = readNumberInRange(TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX)(raw);
      return value === undefined ? undefined : Math.round(value);
    },
  }),

  // 乙类：水合目标为 features/terminal/* 的模块级微型存储（apply 交回缓存）
  'adl:terminal.cwdByTab': defineEntry<Record<string, string>>({
    key: 'adl:terminal.cwdByTab',
    apply: (value) => terminalCwdStore.apply(value),
    fallback: {},
    scope: 'byTabId',
    read: readStringRecord,
  }),
  'adl:terminal.paneLayout': defineEntry<Record<string, TerminalPaneLayout>>({
    key: 'adl:terminal.paneLayout',
    apply: (value) => terminalPaneLayoutStore.apply(value),
    fallback: {},
    scope: 'byTabId',
    read: normalizePaneLayoutMap,
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
  // 检索绑定模式（事项 3 双模式）：follow 缺省 true（跟随文件面板高亮）；pinned 存固定
  // 工作区 id（null 合法值，与 adl:files.activeWorkspace 同约定；陈旧 id 由消费端
  // 派生回退，不写回、不 prune，保证重启后固定绑定仍在）。
  // ─────────────────────────────────────────────────────────────
  'adl:search.followWorkspace': defineEntry<boolean>({
    key: 'adl:search.followWorkspace',
    field: 'searchFollowWorkspace',
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:search.pinnedWorkspaceId': defineEntry<string | null>({
    key: 'adl:search.pinnedWorkspaceId',
    field: 'searchPinnedWorkspaceId',
    fallback: null,
    scope: 'global',
    read: (raw) => (raw === null ? null : readString(raw)),
  }),

  // ─────────────────────────────────────────────────────────────
  // 会话恢复（Task 26）：上次打开的文件（单文件级全局）。
  // fallback 用 null 而非 undefined：registrySelfCheck 的 32KB 断言对 fallback
  // 做 JSON.stringify，undefined 会使其抛错；null 即"从未打开过"，是合法持久值。
  // scope 为 global 且无 prune —— 工作区消失后的陈旧指向由 restoreLastOpenedFile
  // 的降级路径处理（置瞬态提示，不删键），启动剪枝不碰它。
  // ─────────────────────────────────────────────────────────────
  'adl:session.lastFile': defineEntry<SessionLastFile | null>({
    key: 'adl:session.lastFile',
    field: 'lastOpenedFile',
    fallback: null,
    scope: 'global',
    // null（从未打开过）直接合法；类型不符才回退 null 并记脏
    read: (raw) => (raw === null ? null : readSessionLastFile(raw)),
  }),

  // ─────────────────────────────────────────────────────────────
  // 会话恢复（Task 27）：编辑器视口（单文件级全局，只存数值）。
  // fallback / null 约定与 adl:session.lastFile 同理（见上条注释）。
  // ─────────────────────────────────────────────────────────────
  'adl:session.editorViewport': defineEntry<PersistedViewport | null>({
    key: EDITOR_VIEWPORT_KEY,
    field: 'editorViewport',
    fallback: null,
    scope: 'global',
    read: (raw) => (raw === null ? null : readEditorViewport(raw)),
  }),

  // ─────────────────────────────────────────────────────────────
  // 其余右侧面板工具：变更 / 系统监控 / 剪贴板 / 右侧布局。
  // CI / GitHub / 通信面板已随分支 remove-communicate-panel 彻底删除，
  // 其登记条目同步移除；用户本地残留旧键由 cleanupUnregisteredKeys 在启动时清理，无需迁移。
  // 全部写盘走 persist()/persistField()，读取走 hydrateAll()。
  // ─────────────────────────────────────────────────────────────
  'adl:changes.branch': defineEntry<string>({
    key: 'adl:changes.branch',
    field: 'selectedBranch',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  'adl:ui.sysmonCollapsed': defineEntry<boolean>({
    key: 'adl:ui.sysmonCollapsed',
    field: 'sysmonCollapsed',
    // 默认收起：与旧 readFlag(SYSMON_COLLAPSED_KEY, true) 的默认值一致。
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.sysmonScrollTop': defineEntry<number>({
    key: 'adl:ui.sysmonScrollTop',
    apply: (value) => applyPersistedScrollTop('adl:ui.sysmonScrollTop', value),
    fallback: 0,
    scope: 'global',
    // 上界以 hook 的实际钳制 MAX_SCROLL_TOP 为准（旧 readNumber 同界），非 1e9。
    read: readNumberInRange(0, MAX_SCROLL_TOP),
  }),
  'adl:ui.clipboardScrollTop': defineEntry<number>({
    key: 'adl:ui.clipboardScrollTop',
    apply: (value) => applyPersistedScrollTop('adl:ui.clipboardScrollTop', value),
    fallback: 0,
    scope: 'global',
    read: readNumberInRange(0, MAX_SCROLL_TOP),
  }),
  'adl:ui.clipboardViewerWrap': defineEntry<boolean>({
    key: 'adl:ui.clipboardViewerWrap',
    apply: (value) => applyClipboardViewerWrap(value),
    // 默认换行：与弹窗此前写死的初始值一致。
    fallback: true,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.clipboardViewerPreview': defineEntry<boolean>({
    key: 'adl:ui.clipboardViewerPreview',
    apply: (value) => applyClipboardViewerPreview(value),
    // 默认浏览态：与弹窗此前写死的初始值一致。
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.rightPanelMode': defineEntry<RightPanelMode>({
    key: 'adl:ui.rightPanelMode',
    apply: (value) => applyRightPanelMode(value),
    fallback: 'docked',
    scope: 'global',
    read: readStringEnum<RightPanelMode>(RIGHT_PANEL_MODES),
  }),
  'adl:ui.rightPanelLastRestorableWidth': defineEntry<number>({
    key: 'adl:ui.rightPanelLastRestorableWidth',
    apply: (value) => applyRightPanelLastRestorableWidth(value),
    // NaN 即"从未存储"：apply 忽略非有限数，缓存保持 empty，hook 即回退到
    // 实时的 rightPanelWidth（与旧"无存储即用当前宽度"一致）。静态回退值无法
    // 表达该动态默认，故此处不用 DEFAULT_RIGHT_PANEL_WIDTH。
    fallback: Number.NaN,
    scope: 'global',
    read: readNumberInRange(RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
  }),

  // ─────────────────────────────────────────────────────────────
  // 中心标签宿主（Task 5）：中心常驻的中心标签（launcher / browser / terminal）。
  // 水合后、以及每次标签集合变化剪枝后，保证至少一个 launcher 的
  // 不变量分别落在 pruneWiring.applyTabPrune 与 centerTabsSlice.centerRemoveTab。
  // 剪枝参照 ctx.tabIds（终端 + 浏览器标签 id 并集，见 pruneWiring.currentCtx）。
  // ─────────────────────────────────────────────────────────────
  'adl:center.tabs': defineEntry<CenterTabState[]>({
    key: 'adl:center.tabs',
    field: 'centerTabs',
    fallback: [],
    scope: 'global',
    read: readObjectArray<CenterTabState>(isCenterTab),
    prune: pruneCenterTabs,
  }),
  'adl:center.activeTabId': defineEntry<string>({
    key: 'adl:center.activeTabId',
    field: 'centerActiveTabId',
    fallback: '',
    scope: 'global',
    read: readString,
  }),
  // ─────────────────────────────────────────────────────────────
  // 环境依赖引导（Task 2 定义字段 + 读写器，Task 8 消费）：
  // wizardDone = 引导已完成；wizardSkippedAt = 跳过时间戳（ms，null = 未跳过）。
  // 读写一律走 persistField（唯一写盘通道），读取走 hydrateAll 构造期同步水合。
  // ─────────────────────────────────────────────────────────────
  'adl:env.wizardDone': defineEntry<boolean>({
    key: 'adl:env.wizardDone',
    field: 'envWizardDone',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:env.wizardSkippedAt': defineEntry<number | null>({
    key: 'adl:env.wizardSkippedAt',
    field: 'envWizardSkippedAt',
    fallback: null,
    scope: 'global',
    read: (raw: unknown) =>
      raw === null ? null : readNumberInRange(0, Number.MAX_SAFE_INTEGER)(raw),
  }),

  // ─────────────────────────────────────────────────────────────
  // 应用自身更新（ADR-0026 / ADR-0027）：只存偏好与时间戳。
  // 「已下载待安装」有意不落盘 —— 重启后临时包不再保证可用，界面回到可下载态。
  // ─────────────────────────────────────────────────────────────
  'adl:update.state': defineEntry<AppUpdatePersistedState>({
    key: 'adl:update.state',
    field: 'appUpdatePersisted',
    fallback: DEFAULT_APP_UPDATE_PERSISTED,
    scope: 'global',
    read: readAppUpdatePersisted,
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
