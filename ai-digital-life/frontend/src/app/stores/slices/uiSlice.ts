/**
 * UI 切片
 * 管理通用的 UI 状态
 */
import type { ToolId, FilesNavigatorMode, ChangesNavigatorMode } from '../types';
import type { StoreState } from '../StoreState';
import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
import { readFlag, writeFlag, readJson, createDebouncedWrite } from '../shared';
import type {
  TreeExpansionState,
  FileTreeExpansionState,
  FilePreviewModeState,
  UISlice,
} from './uiSliceTypes';
import {
  CHANGES_PREVIEW_ENABLED_KEY,
  SHOW_GIT_VISUALIZATION_KEY,
  FILE_PREVIEW_MODE_KEY,
  FILES_NAVIGATOR_MODE_KEY,
  CHANGES_NAVIGATOR_MODE_KEY,
  FILE_TREE_EXPANDED_KEY,
  CHANGES_TREE_EXPANDED_KEY,
  SESSION_TABS_EXPANDED_KEY,
} from './uiSliceTypes';
import { readRightTool } from './uiSliceWidths';
import { createUIWidthSlice } from './uiSliceWidths';
import { createUIExpansionSlice } from './uiSliceExpansion';

export type {
  TreeExpansionState,
  FileTreeExpansionState,
  FilePreviewModeState,
  UISlice,
} from './uiSliceTypes';
export {
  LEFT_COLLAPSED_KEY,
  RIGHT_COLLAPSED_KEY,
  RIGHT_PANEL_WIDTH_KEY,
  FILES_NAVIGATOR_WIDTH_KEY,
  CHANGES_NAVIGATOR_WIDTH_KEY,
  BROWSER_NAVIGATOR_WIDTH_KEY,
  GITHUB_NAVIGATOR_WIDTH_KEY,
  FILE_TREE_EXPANDED_KEY,
  CHANGES_TREE_EXPANDED_KEY,
  FILES_NAVIGATOR_MODE_KEY,
  CHANGES_NAVIGATOR_MODE_KEY,
  FILE_PREVIEW_MODE_KEY,
  CHANGES_PREVIEW_ENABLED_KEY,
  SHOW_GIT_VISUALIZATION_KEY,
  SESSION_TABS_EXPANDED_KEY,
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
} from './uiSliceTypes';

function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    audit: false,
    settings: false,
    models: false,
    ci: false,
    communicate: false,
  };
}

// Batch write scheduler
const { scheduleWrite } = createDebouncedWrite(50);

// Lazy localStorage hydration
let _defaultsHydrated = false;

function hydrateUIDefaults(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void
): void {
  if (_defaultsHydrated) {
    return;
  }
  _defaultsHydrated = true;
  const doHydrate = () => {
    const _state = get();
    const activeRightTool = readRightTool();
    const expandedFileTreePaths = readJson<FileTreeExpansionState>(FILE_TREE_EXPANDED_KEY, {});
    const expandedChangesTreePaths = readJson<TreeExpansionState>(CHANGES_TREE_EXPANDED_KEY, {});
    const filesNavigatorMode = readFilesNavigatorMode();
    const changesNavigatorMode = readChangesNavigatorMode();
    const filePreviewModeByPath = readJson<FilePreviewModeState>(FILE_PREVIEW_MODE_KEY, {});
    const changesPreviewEnabled = readFlag(CHANGES_PREVIEW_ENABLED_KEY, true);
    const showGitVisualization = readFlag(SHOW_GIT_VISUALIZATION_KEY, false);
    const expandedSessionWorkspaces = readJson<Record<string, boolean>>(
      SESSION_TABS_EXPANDED_KEY,
      {}
    );
    const navigatorCollapsedByTool = {
      ...defaultNavigatorCollapsed(),
      ...readJson<Record<ToolId, boolean>>(
        BROWSER_NAVIGATOR_COLLAPSED_KEY,
        defaultNavigatorCollapsed()
      ),
    };

    set({
      activeRightTool,
      expandedFileTreePaths,
      expandedChangesTreePaths,
      filesNavigatorMode,
      changesNavigatorMode,
      filePreviewModeByPath,
      changesPreviewEnabled,
      showGitVisualization,
      expandedSessionWorkspaces,
      navigatorCollapsedByTool,
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

function readFilesNavigatorMode(): FilesNavigatorMode {
  try {
    const raw = window.localStorage.getItem(FILES_NAVIGATOR_MODE_KEY);
    if (raw === 'tree' || raw === 'search' || raw === 'outline') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'tree';
}

function writeFilesNavigatorMode(mode: FilesNavigatorMode): void {
  try {
    window.localStorage.setItem(FILES_NAVIGATOR_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function readChangesNavigatorMode(): ChangesNavigatorMode {
  try {
    const raw = window.localStorage.getItem(CHANGES_NAVIGATOR_MODE_KEY);
    if (raw === 'tree' || raw === 'list' || raw === 'outline') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'tree';
}

function writeChangesNavigatorMode(mode: ChangesNavigatorMode): void {
  try {
    window.localStorage.setItem(CHANGES_NAVIGATOR_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * UI 切片创建器
 */
export const createUISlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): UISlice => {
  hydrateUIDefaults(_get, set);

  return {
    ...createUIWidthSlice(set, _get),
    ...createUIExpansionSlice(set, _get),

    chatMode: 'ask',
    isFetching: {},
    filesNavigatorMode: 'tree',
    changesNavigatorMode: 'tree',
    filePreviewModeByPath: {},
    changesPreviewEnabled: true,
    showGitVisualization: false,
    startupOverlayHidden: false,
    contextChips: [],
    contextMenuOpen: false,
    fileMenuOpen: false,
    viewMenuOpen: false,
    helpMenuOpen: false,
    activeSettingsGroup: 'general',
    settingsSearchQuery: '',
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),

    setChatMode: (mode) => set({ chatMode: mode }),
    setIsFetching: (key, value) => {
      set((state) => ({
        isFetching: { ...state.isFetching, [key]: value },
      }));
    },
    setError: (message) => set({ error: message }),

    setFilesNavigatorMode: (mode) => {
      writeFilesNavigatorMode(mode);
      set({ filesNavigatorMode: mode });
    },
    setFilePreviewModeForPath: (path, previewEnabled) =>
      set((state) => {
        const next = { ...state.filePreviewModeByPath, [path]: previewEnabled };
        scheduleWrite(FILE_PREVIEW_MODE_KEY, next);
        return { filePreviewModeByPath: next };
      }),
    setChangesPreviewEnabled: (previewEnabled) => {
      writeFlag(CHANGES_PREVIEW_ENABLED_KEY, previewEnabled);
      set({ changesPreviewEnabled: previewEnabled });
    },
    setShowGitVisualization: (show) => {
      writeFlag(SHOW_GIT_VISUALIZATION_KEY, show);
      set({ showGitVisualization: show });
    },
    setStartupOverlayHidden: (hidden) => set({ startupOverlayHidden: hidden }),
    setChangesNavigatorMode: (mode) => {
      writeChangesNavigatorMode(mode);
      set({ changesNavigatorMode: mode });
    },

    addContextChip: (chip) =>
      set((state) => {
        if (state.contextChips.some((candidate) => candidate.id === chip.id)) {
          return state;
        }
        return { contextChips: [...state.contextChips, chip] };
      }),
    removeContextChip: (id) =>
      set((state) => ({ contextChips: state.contextChips.filter((chip) => chip.id !== id) })),
    clearContextChips: () => set({ contextChips: [] }),
    setContextMenuOpen: (open) => set({ contextMenuOpen: open }),
    setFileMenuOpen: (open) =>
      set({
        fileMenuOpen: open,
        viewMenuOpen: false,
        helpMenuOpen: false,
        contextMenuOpen: false,
      }),
    setViewMenuOpen: (open) =>
      set({
        viewMenuOpen: open,
        fileMenuOpen: false,
        helpMenuOpen: false,
        contextMenuOpen: false,
      }),
    setHelpMenuOpen: (open) =>
      set({
        helpMenuOpen: open,
        fileMenuOpen: false,
        viewMenuOpen: false,
        contextMenuOpen: false,
      }),
    closeAllMenus: () =>
      set({
        fileMenuOpen: false,
        viewMenuOpen: false,
        helpMenuOpen: false,
        contextMenuOpen: false,
      }),
    setActiveSettingsGroup: (group) => set({ activeSettingsGroup: group }),
    setSettingsSearchQuery: (query) => set({ settingsSearchQuery: query }),
    setNavigatorCollapsed: (tool, collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, [tool]: collapsed };
        scheduleWrite(BROWSER_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),
    toggleNavigator: (tool) =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          [tool]: !(state.navigatorCollapsedByTool[tool] ?? false),
        };
        scheduleWrite(BROWSER_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),
  };
};
