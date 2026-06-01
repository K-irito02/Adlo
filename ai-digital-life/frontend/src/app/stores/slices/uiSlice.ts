/**
 * UI 切片
 * 管理通用的 UI 状态，保持向后兼容
 */
import type { ChatMode, ToolId } from "../types";
import type { StoreState } from "../StoreState";
import {
  LEFT_COLLAPSED_KEY,
  RIGHT_COLLAPSED_KEY,
  RIGHT_PANEL_WIDTH_KEY,
  FILES_NAVIGATOR_WIDTH_KEY,
  CHANGES_NAVIGATOR_WIDTH_KEY,
  BROWSER_NAVIGATOR_WIDTH_KEY,
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
} from "../ui-store";
import { readFlag, writeFlag, readNumber, writeNumber, clamp } from "../shared";

export interface UISlice {
  activeRightTool: ToolId;
  chatMode: ChatMode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightPanelWidth: number;
  filesNavigatorWidth: number;
  changesNavigatorWidth: number;
  browserNavigatorWidth: number;
  isFetching: Record<string, boolean>;

  setActiveRightTool: (tool: ToolId) => void;
  setChatMode: (mode: ChatMode) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBoth: () => void;
  setRightPanelWidth: (width: number) => void;
  setFilesNavigatorWidth: (width: number) => void;
  setChangesNavigatorWidth: (width: number) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  setIsFetching: (key: string, value: boolean) => void;
  setError: (message?: string) => void;
}

/**
 * UI 切片创建器
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): UISlice => ({
  activeRightTool: 'files',
  chatMode: "ask",
  leftCollapsed: readFlag(LEFT_COLLAPSED_KEY, false),
  rightCollapsed: readFlag(RIGHT_COLLAPSED_KEY, false),
  rightPanelWidth: readNumber(RIGHT_PANEL_WIDTH_KEY, DEFAULT_RIGHT_PANEL_WIDTH, RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
  filesNavigatorWidth: readNumber(FILES_NAVIGATOR_WIDTH_KEY, DEFAULT_FILES_NAVIGATOR_WIDTH, FILES_NAVIGATOR_WIDTH_MIN, FILES_NAVIGATOR_WIDTH_MAX),
  changesNavigatorWidth: readNumber(CHANGES_NAVIGATOR_WIDTH_KEY, DEFAULT_CHANGES_NAVIGATOR_WIDTH, CHANGES_NAVIGATOR_WIDTH_MIN, CHANGES_NAVIGATOR_WIDTH_MAX),
  browserNavigatorWidth: readNumber(BROWSER_NAVIGATOR_WIDTH_KEY, DEFAULT_BROWSER_NAVIGATOR_WIDTH, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX),
  isFetching: {},

  setActiveRightTool: (tool) => set({ activeRightTool: tool }),
  setChatMode: (mode) => set({ chatMode: mode }),
  setLeftCollapsed: (collapsed) => {
    writeFlag(LEFT_COLLAPSED_KEY, collapsed);
    set({ leftCollapsed: collapsed });
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
  setIsFetching: (key, value) => {
    set((state) => ({
      isFetching: { ...state.isFetching, [key]: value },
    }));
  },
  setError: (message) => set({ error: message }),
});
