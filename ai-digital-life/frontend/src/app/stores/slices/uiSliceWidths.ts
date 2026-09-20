/**
 * UI 宽度切片
 * 管理面板宽度相关的 UI 状态
 *
 * 宽度写入时在 store 内先钳制到 [MIN, MAX] 再持久化，保证 in-session 状态也受界；
 * registry 的 readNumberInRange 只是水合期的读取侧安全网，不替代写入侧钳制。
 */
import type { StoreState } from '../StoreState';
import { readNumber, clamp, makePersistedNumberWriter } from '../shared';
import { persistField } from '../persisted/apply';
import type { UISlice } from './uiSliceTypes';
import {
  BROWSER_NAVIGATOR_WIDTH_KEY,
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
      set(
        persistField(
          'adl:ui.leftPanelWidth',
          clamp(width, LEFT_PANEL_WIDTH_MIN, LEFT_PANEL_WIDTH_MAX),
        ),
      );
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
      set(
        persistField(
          'adl:ui.rightPanelWidth',
          clamp(width, RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
        ),
      );
    },
    setFilesNavigatorWidth: (width) => {
      set(
        persistField(
          'adl:files.navigatorWidth',
          clamp(width, FILES_NAVIGATOR_WIDTH_MIN, FILES_NAVIGATOR_WIDTH_MAX),
        ),
      );
    },
    setChangesNavigatorWidth: (width) => {
      set(
        persistField(
          'adl:changes.navigatorWidth',
          clamp(width, CHANGES_NAVIGATOR_WIDTH_MIN, CHANGES_NAVIGATOR_WIDTH_MAX),
        ),
      );
    },
    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      writeBrowserNavigatorWidth(next);
      set({ browserNavigatorWidth: next });
    },
    setGitHubNavigatorWidth: (width) => {
      set(
        persistField(
          'adl:ui.githubNavigatorWidth',
          clamp(width, GITHUB_NAVIGATOR_WIDTH_MIN, GITHUB_NAVIGATOR_WIDTH_MAX),
        ),
      );
    },
    setSettingsNavigatorWidth: (width) => {
      set(
        persistField(
          'adl:ui.settingsNavigatorWidth',
          clamp(width, SETTINGS_NAVIGATOR_WIDTH_MIN, SETTINGS_NAVIGATOR_WIDTH_MAX),
        ),
      );
    },
  };
}
