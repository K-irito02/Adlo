/**
 * UI 宽度切片
 * 管理面板宽度相关的 UI 状态
 */
import type { ToolId } from '../types';
import type { StoreState } from '../StoreState';
import { readFlag, writeFlag, readNumber, writeNumber, clamp } from '../shared';
import type { UISlice } from './uiSliceTypes';
import {
  LEFT_COLLAPSED_KEY,
  LEFT_PANEL_WIDTH_KEY,
  LEFT_PANEL_WIDTH_MIN,
  LEFT_PANEL_WIDTH_MAX,
  DEFAULT_LEFT_PANEL_WIDTH,
  RIGHT_COLLAPSED_KEY,
  RIGHT_PANEL_WIDTH_KEY,
  FILES_NAVIGATOR_WIDTH_KEY,
  CHANGES_NAVIGATOR_WIDTH_KEY,
  BROWSER_NAVIGATOR_WIDTH_KEY,
  GITHUB_NAVIGATOR_WIDTH_KEY,
  SETTINGS_NAVIGATOR_WIDTH_KEY,
  ACTIVE_RIGHT_TOOL_KEY,
  RIGHT_PANEL_WIDTH_MIN,
  RIGHT_PANEL_WIDTH_MAX,
  DEFAULT_RIGHT_PANEL_WIDTH,
  FILES_NAVIGATOR_WIDTH_MIN,
  FILES_NAVIGATOR_WIDTH_MAX,
  DEFAULT_FILES_NAVIGATOR_WIDTH,
  CHANGES_NAVIGATOR_WIDTH_MIN,
  CHANGES_NAVIGATOR_WIDTH_MAX,
  DEFAULT_CHANGES_NAVIGATOR_WIDTH,
  BROWSER_NAVIGATOR_WIDTH_MIN,
  BROWSER_NAVIGATOR_WIDTH_MAX,
  DEFAULT_BROWSER_NAVIGATOR_WIDTH,
  GITHUB_NAVIGATOR_WIDTH_MIN,
  GITHUB_NAVIGATOR_WIDTH_MAX,
  DEFAULT_GITHUB_NAVIGATOR_WIDTH,
  SETTINGS_NAVIGATOR_WIDTH_MIN,
  SETTINGS_NAVIGATOR_WIDTH_MAX,
  DEFAULT_SETTINGS_NAVIGATOR_WIDTH,
} from './uiSliceTypes';

export function readRightTool(): ToolId {
  try {
    const raw = window.localStorage.getItem(ACTIVE_RIGHT_TOOL_KEY);
    // 注意：'communicate'（通信面板）为发布前隐藏状态，这里有意不接受旧持久化值，
    // 读到旧值时自动回落到 'files'，避免恢复隐藏后面板空白。恢复显示时把 'communicate'
    // 加回下面的白名单即可（与 ToolSwitcher / RightPanel 两处注释配合）。
    if (
      raw === 'files' ||
      raw === 'changes' ||
      raw === 'browser' ||
      raw === 'terminal' ||
      raw === 'settings'
    ) {
      return raw;
    }
  } catch (err) {
    console.warn('uiSliceWidths: localStorage operation failed:', err);
  }
  return 'files';
}

function writeRightTool(tool: ToolId): void {
  try {
    window.localStorage.setItem(ACTIVE_RIGHT_TOOL_KEY, tool);
  } catch (err) {
    console.warn('uiSliceWidths: localStorage operation failed:', err);
  }
}

export type UIWidthSlice = Pick<
  UISlice,
  | 'activeRightTool'
  | 'leftCollapsed'
  | 'leftbarWidth'
  | 'rightCollapsed'
  | 'rightPanelWidth'
  | 'filesNavigatorWidth'
  | 'changesNavigatorWidth'
  | 'browserNavigatorWidth'
  | 'gitHubNavigatorWidth'
  | 'settingsNavigatorWidth'
  | 'setActiveRightTool'
  | 'setLeftCollapsed'
  | 'setLeftbarWidth'
  | 'setRightCollapsed'
  | 'toggleLeft'
  | 'toggleRight'
  | 'toggleBoth'
  | 'setRightPanelWidth'
  | 'setFilesNavigatorWidth'
  | 'setChangesNavigatorWidth'
  | 'setBrowserNavigatorWidth'
  | 'setGitHubNavigatorWidth'
  | 'setSettingsNavigatorWidth'
>;

export function createUIWidthSlice(
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): UIWidthSlice {
  return {
    activeRightTool: 'files',
    leftCollapsed: readFlag(LEFT_COLLAPSED_KEY, false),
    leftbarWidth: readNumber(
      LEFT_PANEL_WIDTH_KEY,
      DEFAULT_LEFT_PANEL_WIDTH,
      LEFT_PANEL_WIDTH_MIN,
      LEFT_PANEL_WIDTH_MAX,
    ),
    rightCollapsed: readFlag(RIGHT_COLLAPSED_KEY, false),
    rightPanelWidth: readNumber(
      RIGHT_PANEL_WIDTH_KEY,
      DEFAULT_RIGHT_PANEL_WIDTH,
      RIGHT_PANEL_WIDTH_MIN,
      RIGHT_PANEL_WIDTH_MAX,
    ),
    filesNavigatorWidth: readNumber(
      FILES_NAVIGATOR_WIDTH_KEY,
      DEFAULT_FILES_NAVIGATOR_WIDTH,
      FILES_NAVIGATOR_WIDTH_MIN,
      FILES_NAVIGATOR_WIDTH_MAX,
    ),
    changesNavigatorWidth: readNumber(
      CHANGES_NAVIGATOR_WIDTH_KEY,
      DEFAULT_CHANGES_NAVIGATOR_WIDTH,
      CHANGES_NAVIGATOR_WIDTH_MIN,
      CHANGES_NAVIGATOR_WIDTH_MAX,
    ),
    browserNavigatorWidth: readNumber(
      BROWSER_NAVIGATOR_WIDTH_KEY,
      DEFAULT_BROWSER_NAVIGATOR_WIDTH,
      BROWSER_NAVIGATOR_WIDTH_MIN,
      BROWSER_NAVIGATOR_WIDTH_MAX,
    ),
    gitHubNavigatorWidth: readNumber(
      GITHUB_NAVIGATOR_WIDTH_KEY,
      DEFAULT_GITHUB_NAVIGATOR_WIDTH,
      GITHUB_NAVIGATOR_WIDTH_MIN,
      GITHUB_NAVIGATOR_WIDTH_MAX,
    ),
    settingsNavigatorWidth: readNumber(
      SETTINGS_NAVIGATOR_WIDTH_KEY,
      DEFAULT_SETTINGS_NAVIGATOR_WIDTH,
      SETTINGS_NAVIGATOR_WIDTH_MIN,
      SETTINGS_NAVIGATOR_WIDTH_MAX,
    ),

    setActiveRightTool: (tool) => {
      writeRightTool(tool);
      set({ activeRightTool: tool });
    },
    setLeftCollapsed: (collapsed) => {
      writeFlag(LEFT_COLLAPSED_KEY, collapsed);
      set({ leftCollapsed: collapsed });
    },
    setLeftbarWidth: (width) => {
      const next = clamp(width, LEFT_PANEL_WIDTH_MIN, LEFT_PANEL_WIDTH_MAX);
      writeNumber(LEFT_PANEL_WIDTH_KEY, next);
      set({ leftbarWidth: next });
    },
    setRightCollapsed: (collapsed) => {
      writeFlag(RIGHT_COLLAPSED_KEY, collapsed);
      set({ rightCollapsed: collapsed });
    },
    toggleLeft: () =>
      set((state) => {
        const next = !state.leftCollapsed;
        writeFlag(LEFT_COLLAPSED_KEY, next);
        return { leftCollapsed: next };
      }),
    toggleRight: () =>
      set((state) => {
        const next = !state.rightCollapsed;
        writeFlag(RIGHT_COLLAPSED_KEY, next);
        return { rightCollapsed: next };
      }),
    toggleBoth: () =>
      set((state) => {
        const next = !(state.leftCollapsed && state.rightCollapsed);
        writeFlag(LEFT_COLLAPSED_KEY, next);
        writeFlag(RIGHT_COLLAPSED_KEY, next);
        return { leftCollapsed: next, rightCollapsed: next };
      }),
    setRightPanelWidth: (width) => {
      const next = clamp(width, RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX);
      writeNumber(RIGHT_PANEL_WIDTH_KEY, next);
      set({ rightPanelWidth: next });
    },
    setFilesNavigatorWidth: (width) => {
      const next = clamp(width, FILES_NAVIGATOR_WIDTH_MIN, FILES_NAVIGATOR_WIDTH_MAX);
      writeNumber(FILES_NAVIGATOR_WIDTH_KEY, next);
      set({ filesNavigatorWidth: next });
    },
    setChangesNavigatorWidth: (width) => {
      const next = clamp(width, CHANGES_NAVIGATOR_WIDTH_MIN, CHANGES_NAVIGATOR_WIDTH_MAX);
      writeNumber(CHANGES_NAVIGATOR_WIDTH_KEY, next);
      set({ changesNavigatorWidth: next });
    },
    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      writeNumber(BROWSER_NAVIGATOR_WIDTH_KEY, next);
      set({ browserNavigatorWidth: next });
    },
    setGitHubNavigatorWidth: (width) => {
      const next = clamp(width, GITHUB_NAVIGATOR_WIDTH_MIN, GITHUB_NAVIGATOR_WIDTH_MAX);
      writeNumber(GITHUB_NAVIGATOR_WIDTH_KEY, next);
      set({ gitHubNavigatorWidth: next });
    },
    setSettingsNavigatorWidth: (width) => {
      const next = clamp(width, SETTINGS_NAVIGATOR_WIDTH_MIN, SETTINGS_NAVIGATOR_WIDTH_MAX);
      writeNumber(SETTINGS_NAVIGATOR_WIDTH_KEY, next);
      set({ settingsNavigatorWidth: next });
    },
  };
}
