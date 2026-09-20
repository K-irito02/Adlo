/**
 * UI 切片
 * 管理通用的 UI 状态
 */
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import type { UISlice } from './uiSliceTypes';
import { defaultNavigatorCollapsed } from './uiSliceTypes';
import { createUIWidthSlice } from './uiSliceWidths';
import { createUIExpansionSlice } from './uiSliceExpansion';

export type {
  TreeExpansionState,
  FileTreeExpansionState,
  FilePreviewModeState,
  HeatmapTab,
  ChartColorPreset,
  UISlice,
} from './uiSliceTypes';
export {
  RIGHT_PANEL_MODE_KEY,
  RIGHT_PANEL_LAST_RESTORABLE_WIDTH_KEY,
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
  _get: () => StoreState,
): UISlice => {
  return {
    ...createUIWidthSlice(set, _get),
    ...createUIExpansionSlice(set, _get),

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
    startupOverlayHidden: false,
    hamburgerOpen: false,
    hoveredMenuCategory: null,
    activeSettingsGroup: 'general',
    settingsSearchQuery: '',
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),

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
    setSettingsSearchQuery: (query) => set({ settingsSearchQuery: query }),
    setNavigatorCollapsed: (tool, collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, [tool]: collapsed };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),
    toggleNavigator: (tool) =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          [tool]: !(state.navigatorCollapsedByTool[tool] ?? false),
        };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),
  };
};
