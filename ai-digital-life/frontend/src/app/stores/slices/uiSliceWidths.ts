/**
 * UI 宽度切片
 * 管理面板宽度相关的 UI 状态
 */
import type { StoreState } from '../StoreState';
import { readNumber, clamp, makePersistedNumberWriter } from '../shared';
import { persistField } from '../persisted/apply';
import type { UISlice } from './uiSliceTypes';
import {
  BROWSER_NAVIGATOR_WIDTH_KEY,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_FILES_NAVIGATOR_WIDTH,
  DEFAULT_CHANGES_NAVIGATOR_WIDTH,
  BROWSER_NAVIGATOR_WIDTH_MIN,
  BROWSER_NAVIGATOR_WIDTH_MAX,
  DEFAULT_BROWSER_NAVIGATOR_WIDTH,
  DEFAULT_GITHUB_NAVIGATOR_WIDTH,
  DEFAULT_SETTINGS_NAVIGATOR_WIDTH,
} from './uiSliceTypes';

/**
 * 浏览器导航器宽度尚未迁移（不在 Task 7 迁移表内），暂保留遗留写盘通道，
 * 由后续任务迁移到 registry；其遗留键在 PERSIST_KEEP_KEYS 中受保护。
 */
const writeBrowserNavigatorWidth = makePersistedNumberWriter(BROWSER_NAVIGATOR_WIDTH_KEY);

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
    leftCollapsed: false,
    leftbarWidth: DEFAULT_LEFT_PANEL_WIDTH,
    rightCollapsed: false,
    rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
    filesNavigatorWidth: DEFAULT_FILES_NAVIGATOR_WIDTH,
    changesNavigatorWidth: DEFAULT_CHANGES_NAVIGATOR_WIDTH,
    browserNavigatorWidth: readNumber(
      BROWSER_NAVIGATOR_WIDTH_KEY,
      DEFAULT_BROWSER_NAVIGATOR_WIDTH,
      BROWSER_NAVIGATOR_WIDTH_MIN,
      BROWSER_NAVIGATOR_WIDTH_MAX,
    ),
    gitHubNavigatorWidth: DEFAULT_GITHUB_NAVIGATOR_WIDTH,
    settingsNavigatorWidth: DEFAULT_SETTINGS_NAVIGATOR_WIDTH,

    setActiveRightTool: (tool) => {
      set(persistField('adl:ui.activeRightTool', tool));
    },
    setLeftCollapsed: (collapsed) => {
      set(persistField('adl:ui.leftCollapsed', collapsed));
    },
    setLeftbarWidth: (width) => {
      set(persistField('adl:ui.leftPanelWidth', width));
    },
    setRightCollapsed: (collapsed) => {
      set(persistField('adl:ui.rightCollapsed', collapsed));
    },
    toggleLeft: () => set((state) => persistField('adl:ui.leftCollapsed', !state.leftCollapsed)),
    toggleRight: () => set((state) => persistField('adl:ui.rightCollapsed', !state.rightCollapsed)),
    toggleBoth: () =>
      set((state) => {
        const next = !(state.leftCollapsed && state.rightCollapsed);
        return {
          ...persistField('adl:ui.leftCollapsed', next),
          ...persistField('adl:ui.rightCollapsed', next),
        };
      }),
    setRightPanelWidth: (width) => {
      set(persistField('adl:ui.rightPanelWidth', width));
    },
    setFilesNavigatorWidth: (width) => {
      set(persistField('adl:files.navigatorWidth', width));
    },
    setChangesNavigatorWidth: (width) => {
      set(persistField('adl:changes.navigatorWidth', width));
    },
    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      writeBrowserNavigatorWidth(next);
      set({ browserNavigatorWidth: next });
    },
    setGitHubNavigatorWidth: (width) => {
      set(persistField('adl:ui.githubNavigatorWidth', width));
    },
    setSettingsNavigatorWidth: (width) => {
      set(persistField('adl:ui.settingsNavigatorWidth', width));
    },
  };
}
