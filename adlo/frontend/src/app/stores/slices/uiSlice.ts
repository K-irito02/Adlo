/**
 * UI 切片
 * 管理通用的 UI 状态
 */
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';
import type { UISlice } from './uiSliceTypes';
import {
  defaultNavigatorCollapsed,
  SETTINGS_SEARCH_HISTORY_MAX,
  SETTINGS_SEARCH_HISTORY_MAX_LENGTH,
} from './uiSliceTypes';
import { createUIWidthSlice } from './uiSliceWidths';
import { createUIExpansionSlice } from './uiSliceExpansion';

export type {
  TreeExpansionState,
  FileTreeExpansionState,
  FilePreviewModeState,
  HeatmapTab,
  ChartColorPreset,
  LightMarkdownTheme,
  DarkMarkdownTheme,
  MarkdownTheme,
  UISlice,
} from './uiSliceTypes';
export {
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
} from './uiSliceTypes';

/**
 * UI 切片创建器
 *
 * 全量 UI 状态的持久化已在 Task 7 迁移到 persisted registry：
 * - 写盘统一走 persistField()，经单一写盘通道（persist → scheduleCrossSliceWrite）；
 * - 读取统一走 hydrateAll()，在 store 构造期同步执行一次（slicedStore.ts），
 *   不再有任何 requestIdleCallback / setTimeout 延迟水合。
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): UISlice => {
  return {
    ...createUIWidthSlice(set, get),
    ...createUIExpansionSlice(set, get),

    isFetching: {},
    filesNavigatorMode: 'tree',
    changesNavigatorMode: 'tree',
    filesSearchView: 'list',
    filesSearchScope: 'content',
    filePreviewModeByPath: {},
    changesPreviewEnabled: true,
    showGitVisualization: false,
    activeHeatmapTab: 'calendar',
    activeWorkspaceTab: 'workspace-1',
    chartColorPreset: 'bklit-default',
    lightMarkdownTheme: 'light',
    darkMarkdownTheme: 'dark',
    startupOverlayHidden: false,
    hamburgerOpen: false,
    hoveredMenuCategory: null,
    activeSettingsGroup: 'general',
    aboutDialogRequest: null,
    settingsSearchQuery: '',
    settingsSearchHistory: [],
    storageGroupResetPending: false,
    storageBlocksAtDefault: null,
    browserGroupResetPending: false,
    browserBlocksAtDefault: null,
    dshGroupResetPending: false,
    dshBlocksAtDefault: null,
    networkGroupResetPending: false,
    networkBlocksAtDefault: null,
    environmentGroupResetPending: false,
    opencodeGroupResetPending: false,
    opencodeBlocksAtDefault: null,
    siblingWebviewNonce: 0,
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),
    rightPanelToolbarCollapsed: false,
    changesStatusFilter: new Set(),
    changesOutlineExpanded: {},
    changesLineNumbers: true,
    changesWordWrap: true,

    setIsFetching: (key, value) => {
      set((state) => ({
        isFetching: { ...state.isFetching, [key]: value },
      }));
    },

    setFilesNavigatorMode: (mode) => {
      set(persistField('adl:files.navigatorMode', mode));
    },
    setFilesSearchView: (view) => {
      set(persistField('adl:files.searchView', view));
    },
    setFilesSearchScope: (scope) => {
      set(persistField('adl:files.searchScope', scope));
    },
    setFilePreviewModeForPath: (workspaceId, path, previewEnabled) =>
      set((state) => {
        const nextWs = {
          ...(state.filePreviewModeByPath[workspaceId] ?? {}),
          [path]: previewEnabled,
        };
        return persistField('adl:files.previewMode', {
          ...state.filePreviewModeByPath,
          [workspaceId]: nextWs,
        });
      }),
    carryFilePreviewModeForRename: (workspaceId, oldPath, newPath) =>
      set((state) => {
        const current = state.filePreviewModeByPath[workspaceId];
        const value = current?.[oldPath];
        if (value === undefined) {
          return state;
        }
        if (current[newPath] === value) {
          return state;
        }
        const nextWs = { ...current };
        delete nextWs[oldPath];
        nextWs[newPath] = value;
        return persistField('adl:files.previewMode', {
          ...state.filePreviewModeByPath,
          [workspaceId]: nextWs,
        });
      }),
    setChangesPreviewEnabled: (previewEnabled) => {
      set(persistField('adl:changes.previewEnabled', previewEnabled));
    },
    setShowGitVisualization: (show) => {
      set(persistField('adl:changes.showGitVisualization', show));
    },
    setActiveHeatmapTab: (tab) => {
      set(persistField('adl:changes.activeHeatmapTab', tab));
    },
    setActiveWorkspaceTab: (tab) => {
      set(persistField('adl:changes.activeWorkspaceTab', tab));
    },
    setChartColorPreset: (preset) => {
      set(persistField('adl:changes.chartColorPreset', preset));
    },
    setLightMarkdownTheme: (theme) => {
      set(persistField('adl:files.markdownThemeLight', theme));
    },
    setDarkMarkdownTheme: (theme) => {
      set(persistField('adl:files.markdownThemeDark', theme));
    },
    setStartupOverlayHidden: (hidden) => set({ startupOverlayHidden: hidden }),
    setChangesNavigatorMode: (mode) => {
      set(persistField('adl:changes.navigatorMode', mode));
    },

    setHamburgerOpen: (open) =>
      set({
        hamburgerOpen: open,
        hoveredMenuCategory: null,
      }),
    setHoveredMenuCategory: (category) =>
      set({
        hoveredMenuCategory: category,
      }),
    closeAllMenus: () =>
      set({
        hamburgerOpen: false,
        hoveredMenuCategory: null,
      }),
    setActiveSettingsGroup: (group) => set({ activeSettingsGroup: group }),
    clearAboutDialogRequest: () => set({ aboutDialogRequest: null }),
    openAboutLicense: () => {
      get().navigateRightTool('settings');
      set({
        activeSettingsGroup: 'about',
        aboutDialogRequest: 'license',
        // 设置面板处于跨组搜索态时不会挂载 AboutSettings；清空查询让关于组立即渲染。
        settingsSearchQuery: '',
      });
    },
    openShortcutsSettings: () => {
      get().navigateRightTool('settings');
      set({ activeSettingsGroup: 'shortcuts', settingsSearchQuery: '' });
    },
    setSettingsSearchQuery: (query) => set({ settingsSearchQuery: query }),
    recordSettingsSearch: (query) => {
      const trimmed = query.trim();
      // 超长查询不入历史：历史条目须能完整复现原查询 —— 若存截断串，从历史点击后的
      // 搜索结果可能与当初点击那次不同，「点历史 = 复现」被打破。单条长度上限是持久化
      // 预算约束（登记表单条 ≤32KB）与卡片展示假设，不是存截断串的理由；读盘侧仍按
      // 上限收敛旧数据（含旧版本写入的截断串）。
      if (trimmed === '' || trimmed.length > SETTINGS_SEARCH_HISTORY_MAX_LENGTH) {
        return;
      }
      // 已在首位即无变化：避免每次跳转都写一次盘。
      if (get().settingsSearchHistory[0] === trimmed) {
        return;
      }
      const next = [
        trimmed,
        ...get().settingsSearchHistory.filter((item) => item !== trimmed),
      ].slice(0, SETTINGS_SEARCH_HISTORY_MAX);
      set(persistField('adl:ui.settingsSearchHistory', next));
    },
    clearSettingsSearchHistory: () => {
      // 已为空即无变化：避免空点一次写一次盘。
      if (get().settingsSearchHistory.length === 0) {
        return;
      }
      set(persistField('adl:ui.settingsSearchHistory', []));
    },
    removeSettingsSearchHistoryItem: (item) => {
      // 不存在即无变化：避免无效写盘。
      if (!get().settingsSearchHistory.includes(item)) {
        return;
      }
      set(
        persistField(
          'adl:ui.settingsSearchHistory',
          get().settingsSearchHistory.filter((entry) => entry !== item),
        ),
      );
    },
    requestStorageGroupReset: () => set({ storageGroupResetPending: true }),
    consumeStorageGroupReset: () => set({ storageGroupResetPending: false }),
    setStorageBlocksAtDefault: (value) => {
      // 同值不写：聚合 effect 每次谓词重算都调用，守卫避免订阅者无效通知。
      if (get().storageBlocksAtDefault === value) {
        return;
      }
      set({ storageBlocksAtDefault: value });
    },
    requestBrowserGroupReset: () => set({ browserGroupResetPending: true }),
    consumeBrowserGroupReset: () => set({ browserGroupResetPending: false }),
    setBrowserBlocksAtDefault: (value) => {
      // 同值不写：聚合 effect 每次谓词重算都调用，守卫避免订阅者无效通知。
      if (get().browserBlocksAtDefault === value) {
        return;
      }
      set({ browserBlocksAtDefault: value });
    },
    requestDshGroupReset: () => set({ dshGroupResetPending: true }),
    consumeDshGroupReset: () => set({ dshGroupResetPending: false }),
    setDshBlocksAtDefault: (value) => {
      // 同值不写：聚合 effect 每次谓词重算都调用，守卫避免订阅者无效通知。
      if (get().dshBlocksAtDefault === value) {
        return;
      }
      set({ dshBlocksAtDefault: value });
    },
    requestNetworkGroupReset: () => set({ networkGroupResetPending: true }),
    consumeNetworkGroupReset: () => set({ networkGroupResetPending: false }),
    setNetworkBlocksAtDefault: (value) => {
      // 同值不写：聚合 effect 每次谓词重算都调用，守卫避免订阅者无效通知。
      if (get().networkBlocksAtDefault === value) {
        return;
      }
      set({ networkBlocksAtDefault: value });
    },
    requestEnvironmentGroupReset: () => set({ environmentGroupResetPending: true }),
    consumeEnvironmentGroupReset: () => set({ environmentGroupResetPending: false }),
    requestOpencodeGroupReset: () => set({ opencodeGroupResetPending: true }),
    consumeOpencodeGroupReset: () => set({ opencodeGroupResetPending: false }),
    setOpencodeBlocksAtDefault: (value) => {
      // 同值不写：聚合 effect 每次谓词重算都调用，守卫避免订阅者无效通知。
      if (get().opencodeBlocksAtDefault === value) {
        return;
      }
      set({ opencodeBlocksAtDefault: value });
    },
    bumpSiblingWebviewNonce: () =>
      set((state) => ({ siblingWebviewNonce: state.siblingWebviewNonce + 1 })),
    setNavigatorCollapsed: (tool, collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, [tool]: collapsed };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),
    // 变更状态过滤器（Task 23）：store 持有 Set（渲染直接用），落盘转数组
    // （Set 不可 JSON 序列化）—— 仍是唯一写通道 persist，只是落盘形态与 store 形态
    // 不同，故 value 侧用 as never 桥接（同 pruneWiring 的 persist 调用写法）；
    // 读侧 readStringSet 把数组转回 Set，往返后仍为 Set 实例（见持久化测试）。
    setChangesStatusFilter: (filter) => {
      const next = new Set(filter);
      persist('adl:changes.statusFilter', [...next] as never);
      set({ changesStatusFilter: next });
    },
    toggleChangesStatusFilter: (filter) =>
      set((state) => {
        const next = new Set(state.changesStatusFilter);
        if (next.has(filter)) {
          next.delete(filter);
        } else {
          next.add(filter);
        }
        persist('adl:changes.statusFilter', [...next] as never);
        return { changesStatusFilter: next };
      }),
    setChangesOutlineExpanded: (workspaceId, ids) =>
      set((state) =>
        persistField('adl:changes.outlineExpanded', {
          ...state.changesOutlineExpanded,
          [workspaceId]: [...ids],
        }),
      ),
    setChangesLineNumbers: (enabled) => {
      set(persistField('adl:changes.lineNumbers', enabled));
    },
    setChangesWordWrap: (enabled) => {
      set(persistField('adl:changes.wordWrap', enabled));
    },
    toggleNavigator: (tool) =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          [tool]: !(state.navigatorCollapsedByTool[tool] ?? false),
        };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),
    toggleRightPanelToolbar: () =>
      set((state) =>
        persistField('adl:ui.rightPanelToolbarCollapsed', !state.rightPanelToolbarCollapsed),
      ),
  };
};
