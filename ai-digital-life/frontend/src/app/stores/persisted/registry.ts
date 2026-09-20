import { defineEntry, readBooleanRecord, type PersistEntry } from './entry';
import { readFlag, readNumberInRange, readStringEnum, readBooleanPropRecord } from './parsers';
import { pruneDirPathsByWorkspace } from './prune';
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
  defaultNavigatorCollapsed,
} from '../slices/uiSliceTypes';
import type {
  ToolId,
  FilesNavigatorMode,
  ChangesNavigatorMode,
  FilesSearchViewMode,
  FilesSearchScope,
} from '../types';
import type { HeatmapTab, ChartColorPreset } from '../slices/uiSliceTypes';

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
  'adl:files.dirExpanded': defineEntry<Record<string, Record<string, boolean>>>({
    key: 'adl:files.dirExpanded',
    field: 'expandedFileTreePaths',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanPropRecord,
    prune: pruneDirPathsByWorkspace,
  }),
  'adl:changes.dirExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:changes.dirExpanded',
    field: 'expandedChangesTreePaths',
    fallback: {},
    scope: 'global',
    read: readBooleanRecord,
  }),
  // 注意：filePreviewModeByPath 目前按 global 扁平表（Record<relativePath, boolean>）登记，
  // 与现状数据结构完全一致（Task 7 不改数据结构）；Task 14 会将其改为按工作区隔离
  // （byWorkspaceId）并调整数据结构，本条目届时由 Task 14 改写。
  'adl:files.previewMode': defineEntry<Record<string, boolean>>({
    key: 'adl:files.previewMode',
    field: 'filePreviewModeByPath',
    fallback: {},
    scope: 'global',
    read: readBooleanRecord,
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
  'adl-search:ignored-paths',
  'adl-search:max-results',
  'adl-search:page-size',
  'adl-search:use-gitignore',
  'adl-terminal:cwd-by-tab',
  'adl-terminal:history-index',
  'adl-terminal:region-collapse',
  'adl-terminal:view-prefs',
  'adl-ui:active-communicate-platform',
  'adl-ui:active-github-section',
  'adl-ui:browser-active-tab',
  'adl-ui:browser-bg-config',
  'adl-ui:browser-bookmark-tabid-url-map',
  'adl-ui:browser-bookmarks',
  'adl-ui:browser-configured-ports',
  'adl-ui:browser-history',
  'adl-ui:browser-local-ports',
  'adl-ui:browser-navigate-in-place',
  'adl-ui:browser-navigator-width',
  'adl-ui:browser-shortcuts',
  'adl-ui:browser-tab-folders',
  'adl-ui:browser-tab-tree-expanded',
  'adl-ui:browser-tabs',
  'adl-ui:browser-workspace-bookmarks',
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
  'adl-ui:terminal-active-tab',
  'adl-ui:terminal-default-profile',
  'adl-ui:terminal-navigator-width',
  'adl-ui:terminal-shell-selector-profile',
  'adl-ui:terminal-tabs',
  'adl-ui:terminal-workspace-default-profiles',
  'adl-ui:terminal-workspace-expanded',
  'adl-ui:terminal-workspace-id',
  'adl-ui:workspace-changes-expanded',
  'adl-ui:workspace-tree-expanded',
]);
