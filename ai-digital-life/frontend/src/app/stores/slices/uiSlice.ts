/**
 * UI 切片
 * 管理通用的 UI 状态，保持向后兼容
 */
import type {
  ChatMode,
  ToolId,
  FilesNavigatorMode,
  ChangesNavigatorMode,
  ContextChip,
} from '../types';
import type { SettingsGroupId } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';
import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
import {
  readFlag,
  writeFlag,
  readNumber,
  writeNumber,
  readJson,
  writeJson,
  clamp,
  createDebouncedWrite,
} from '../shared';

// Local storage keys and constants
export const LEFT_COLLAPSED_KEY = 'adl-ui:left-collapsed';
export const RIGHT_COLLAPSED_KEY = 'adl-ui:right-collapsed';
export const RIGHT_PANEL_WIDTH_KEY = 'adl-ui:right-panel-width';
export const FILES_NAVIGATOR_WIDTH_KEY = 'adl-ui:files-navigator-width';
export const CHANGES_NAVIGATOR_WIDTH_KEY = 'adl-ui:changes-navigator-width';
export const BROWSER_NAVIGATOR_WIDTH_KEY = 'adl-ui:browser-navigator-width';
export const GITHUB_NAVIGATOR_WIDTH_KEY = 'adl-ui:github-navigator-width';
export const FILE_TREE_EXPANDED_KEY = 'adl-ui:file-tree-expanded';
export const CHANGES_TREE_EXPANDED_KEY = 'adl-ui:changes-tree-expanded';
export const FILES_NAVIGATOR_MODE_KEY = 'adl-ui:files-navigator-mode';
export const CHANGES_NAVIGATOR_MODE_KEY = 'adl-ui:changes-navigator-mode';
export const FILE_PREVIEW_MODE_KEY = 'adl-ui:file-preview-mode';
export const CHANGES_PREVIEW_ENABLED_KEY = 'adl-ui:changes-preview-enabled';
export const SESSION_TABS_EXPANDED_KEY = 'adl-ui:session-tabs-expanded';
export const ACTIVE_RIGHT_TOOL_KEY = 'adl-ui:active-right-tool';

// Constants
export const RIGHT_PANEL_WIDTH_MIN = 320;
export const RIGHT_PANEL_WIDTH_MAX = 4096;
export const DEFAULT_RIGHT_PANEL_WIDTH = 520;
export const FILES_NAVIGATOR_WIDTH_MIN = 180;
export const FILES_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_FILES_NAVIGATOR_WIDTH = 240;
export const CHANGES_NAVIGATOR_WIDTH_MIN = 180;
export const CHANGES_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_CHANGES_NAVIGATOR_WIDTH = 240;
export const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
export const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;
export const GITHUB_NAVIGATOR_WIDTH_MIN = 180;
export const GITHUB_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_GITHUB_NAVIGATOR_WIDTH = 200;

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

type TreeExpansionState = Record<string, boolean>;
type FileTreeExpansionState = Record<string, TreeExpansionState>;
type FilePreviewModeState = Record<string, boolean>;

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

function readRightTool(): ToolId {
  try {
    const raw = window.localStorage.getItem(ACTIVE_RIGHT_TOOL_KEY);
    if (
      raw === 'files' ||
      raw === 'changes' ||
      raw === 'browser' ||
      raw === 'terminal' ||
      raw === 'audit' ||
      raw === 'settings' ||
      raw === 'models'
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'files';
}

function writeRightTool(tool: ToolId): void {
  try {
    window.localStorage.setItem(ACTIVE_RIGHT_TOOL_KEY, tool);
  } catch {
    /* ignore */
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

function setTreePathExpandedInState(
  current: TreeExpansionState,
  path: string,
  expanded: boolean
): TreeExpansionState {
  if ((current[path] ?? false) === expanded) {
    return current;
  }
  return { ...current, [path]: expanded };
}

function toggleTreePathExpandedInState(
  current: TreeExpansionState,
  path: string
): TreeExpansionState {
  return { ...current, [path]: !(current[path] ?? false) };
}

function expandTreePathChainInState(current: TreeExpansionState, path: string): TreeExpansionState {
  let next = current;
  let changed = false;
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  for (let i = 0; i < segments.length - 1; i += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
    if (next[currentPath]) {
      continue;
    }
    if (!changed) {
      next = { ...current };
      changed = true;
    }
    next[currentPath] = true;
  }
  return next;
}

export interface UISlice {
  activeRightTool: ToolId;
  chatMode: ChatMode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightPanelWidth: number;
  filesNavigatorWidth: number;
  changesNavigatorWidth: number;
  browserNavigatorWidth: number;
  gitHubNavigatorWidth: number;
  isFetching: Record<string, boolean>;
  expandedFileTreePaths: FileTreeExpansionState;
  expandedChangesTreePaths: TreeExpansionState;
  filesNavigatorMode: FilesNavigatorMode;
  changesNavigatorMode: ChangesNavigatorMode;
  filePreviewModeByPath: FilePreviewModeState;
  changesPreviewEnabled: boolean;
  expandedSessionWorkspaces: Record<string, boolean>;
  contextChips: ContextChip[];
  contextMenuOpen: boolean;
  fileMenuOpen: boolean;
  viewMenuOpen: boolean;
  helpMenuOpen: boolean;
  activeSettingsGroup: SettingsGroupId;
  settingsSearchQuery: string;
  navigatorCollapsedByTool: Record<ToolId, boolean>;

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
  setGitHubNavigatorWidth: (width: number) => void;
  setIsFetching: (key: string, value: boolean) => void;
  setError: (message?: string) => void;
  setFileTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
  toggleFileTreePath: (workspaceId: string, path: string) => void;
  expandFileTreePathChain: (workspaceId: string, path: string) => void;
  collapseAllFileTreePaths: (workspaceId: string) => void;
  setFilesNavigatorMode: (mode: FilesNavigatorMode) => void;
  setFilePreviewModeForPath: (path: string, previewEnabled: boolean) => void;
  setChangesPreviewEnabled: (previewEnabled: boolean) => void;
  setChangesNavigatorMode: (mode: ChangesNavigatorMode) => void;
  setChangesTreePathExpanded: (path: string, expanded: boolean) => void;
  toggleChangesTreePath: (path: string) => void;
  expandChangesTreePathChain: (path: string) => void;
  collapseAllChangesTreePaths: () => void;
  toggleSessionWorkspace: (workspaceId: string) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;
  setContextMenuOpen: (open: boolean) => void;
  setFileMenuOpen: (open: boolean) => void;
  setViewMenuOpen: (open: boolean) => void;
  setHelpMenuOpen: (open: boolean) => void;
  closeAllMenus: () => void;
  setActiveSettingsGroup: (group: SettingsGroupId) => void;
  setSettingsSearchQuery: (query: string) => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
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
    activeRightTool: 'files',
    chatMode: 'ask',
    leftCollapsed: readFlag(LEFT_COLLAPSED_KEY, false),
    rightCollapsed: readFlag(RIGHT_COLLAPSED_KEY, false),
    rightPanelWidth: readNumber(
      RIGHT_PANEL_WIDTH_KEY,
      DEFAULT_RIGHT_PANEL_WIDTH,
      RIGHT_PANEL_WIDTH_MIN,
      RIGHT_PANEL_WIDTH_MAX
    ),
    filesNavigatorWidth: readNumber(
      FILES_NAVIGATOR_WIDTH_KEY,
      DEFAULT_FILES_NAVIGATOR_WIDTH,
      FILES_NAVIGATOR_WIDTH_MIN,
      FILES_NAVIGATOR_WIDTH_MAX
    ),
    changesNavigatorWidth: readNumber(
      CHANGES_NAVIGATOR_WIDTH_KEY,
      DEFAULT_CHANGES_NAVIGATOR_WIDTH,
      CHANGES_NAVIGATOR_WIDTH_MIN,
      CHANGES_NAVIGATOR_WIDTH_MAX
    ),
    browserNavigatorWidth: readNumber(
      BROWSER_NAVIGATOR_WIDTH_KEY,
      DEFAULT_BROWSER_NAVIGATOR_WIDTH,
      BROWSER_NAVIGATOR_WIDTH_MIN,
      BROWSER_NAVIGATOR_WIDTH_MAX
    ),
    gitHubNavigatorWidth: readNumber(
      GITHUB_NAVIGATOR_WIDTH_KEY,
      DEFAULT_GITHUB_NAVIGATOR_WIDTH,
      GITHUB_NAVIGATOR_WIDTH_MIN,
      GITHUB_NAVIGATOR_WIDTH_MAX
    ),
    isFetching: {},
    expandedFileTreePaths: {},
    expandedChangesTreePaths: {},
    filesNavigatorMode: 'tree',
    changesNavigatorMode: 'tree',
    filePreviewModeByPath: {},
    changesPreviewEnabled: true,
    expandedSessionWorkspaces: {},
    contextChips: [],
    contextMenuOpen: false,
    fileMenuOpen: false,
    viewMenuOpen: false,
    helpMenuOpen: false,
    activeSettingsGroup: 'general',
    settingsSearchQuery: '',
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),

    setActiveRightTool: (tool) => {
      writeRightTool(tool);
      set({ activeRightTool: tool });
    },
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
    setGitHubNavigatorWidth: (width) => {
      const next = clamp(width, GITHUB_NAVIGATOR_WIDTH_MIN, GITHUB_NAVIGATOR_WIDTH_MAX);
      writeNumber(GITHUB_NAVIGATOR_WIDTH_KEY, next);
      set({ gitHubNavigatorWidth: next });
    },
    setIsFetching: (key, value) => {
      set((state) => ({
        isFetching: { ...state.isFetching, [key]: value },
      }));
    },
    setError: (message) => set({ error: message }),

    setFileTreePathExpanded: (workspaceId, path, expanded) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = setTreePathExpandedInState(current, path, expanded);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    toggleFileTreePath: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = toggleTreePathExpandedInState(current, path);
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    expandFileTreePathChain: (workspaceId, path) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? {};
        const next = expandTreePathChainInState(current, path);
        if (next === current) {
          return state;
        }
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
    collapseAllFileTreePaths: (workspaceId) =>
      set((state) => {
        const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: {} };
        scheduleWrite(FILE_TREE_EXPANDED_KEY, allPaths);
        return { expandedFileTreePaths: allPaths };
      }),
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
    setChangesNavigatorMode: (mode) => {
      writeChangesNavigatorMode(mode);
      set({ changesNavigatorMode: mode });
    },
    setChangesTreePathExpanded: (path, expanded) =>
      set((state) => {
        const next = setTreePathExpandedInState(state.expandedChangesTreePaths, path, expanded);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    toggleChangesTreePath: (path) =>
      set((state) => {
        const next = toggleTreePathExpandedInState(state.expandedChangesTreePaths, path);
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    expandChangesTreePathChain: (path) =>
      set((state) => {
        const next = expandTreePathChainInState(state.expandedChangesTreePaths, path);
        if (next === state.expandedChangesTreePaths) {
          return state;
        }
        scheduleWrite(CHANGES_TREE_EXPANDED_KEY, next);
        return { expandedChangesTreePaths: next };
      }),
    collapseAllChangesTreePaths: () => {
      scheduleWrite(CHANGES_TREE_EXPANDED_KEY, {});
      set({ expandedChangesTreePaths: {} });
    },
    toggleSessionWorkspace: (workspaceId) =>
      set((state) => {
        const current = state.expandedSessionWorkspaces[workspaceId] ?? true;
        const next = { ...state.expandedSessionWorkspaces, [workspaceId]: !current };
        writeJson(SESSION_TABS_EXPANDED_KEY, next);
        return { expandedSessionWorkspaces: next };
      }),
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
