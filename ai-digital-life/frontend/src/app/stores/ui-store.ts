import { create } from 'zustand';
import type { SettingsGroupId } from '@ai-digital-life/kernel';
import type { ToolId, ChatMode, TerminalProfile } from './types';
import { readJson, writeJson, readFlag, writeFlag, createUiId } from './shared';

/**
 * Renderer-only UI state.
 *
 * Purely cosmetic, navigation, and local-shell behavior that does not need to
 * cross the IPC boundary lives here. Persistence is limited to localStorage.
 *
 * @deprecated 正在迁移至 useAppStore 的 uiSlice，新增字段请直接添加到 uiSlice
 */

/** @deprecated 已迁移至 ./types */
export type { ToolId, ChatMode, TerminalProfile };
export type FilesNavigatorMode = 'tree' | 'search' | 'outline';
export type ChangesNavigatorMode = 'tree' | 'list' | 'outline';

export interface ContextChip {
  id: string;
  kind: 'file' | 'doc' | 'url' | 'codebase' | 'skill' | 'model' | 'mcp';
  label: string;
  detail?: string;
}

export interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
}

export interface BrowserBookmark {
  url: string;
  title: string;
}

export interface BrowserHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export const LEFT_COLLAPSED_KEY = 'adl-ui:left-collapsed';
export const RIGHT_COLLAPSED_KEY = 'adl-ui:right-collapsed';
const ACTIVE_RIGHT_TOOL_KEY = 'adl-ui:active-right-tool';
const SESSION_TABS_EXPANDED_KEY = 'adl-ui:session-tabs-expanded';
export const RIGHT_PANEL_WIDTH_KEY = 'adl-ui:right-panel-width';
export const FILES_NAVIGATOR_WIDTH_KEY = 'adl-ui:files-navigator-width';
export const CHANGES_NAVIGATOR_WIDTH_KEY = 'adl-ui:changes-navigator-width';
export const BROWSER_NAVIGATOR_WIDTH_KEY = 'adl-ui:browser-navigator-width';
const NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
const FILE_TREE_EXPANDED_KEY = 'adl-ui:file-tree-expanded';
const CHANGES_TREE_EXPANDED_KEY = 'adl-ui:changes-tree-expanded';
const FILES_NAVIGATOR_MODE_KEY = 'adl-ui:files-navigator-mode';
const FILE_PREVIEW_MODE_KEY = 'adl-ui:file-preview-mode';
const CHANGES_PREVIEW_ENABLED_KEY = 'adl-ui:changes-preview-enabled';
const CHANGES_NAVIGATOR_MODE_KEY = 'adl-ui:changes-navigator-mode';
const BROWSER_TABS_KEY = 'adl-ui:browser-tabs';
const BROWSER_ACTIVE_TAB_KEY = 'adl-ui:browser-active-tab';
const BROWSER_BOOKMARKS_KEY = 'adl-ui:browser-bookmarks';
const BROWSER_HISTORY_KEY = 'adl-ui:browser-history';
const deferredJsonWriteHandles = new Map<string, number>();

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

type TreeExpansionState = Record<string, boolean>;

function scheduleJsonWrite(key: string, value: unknown): void {
  const previousHandle = deferredJsonWriteHandles.get(key);
  if (previousHandle !== undefined) {
    window.clearTimeout(previousHandle);
  }
  const nextHandle = window.setTimeout(() => {
    deferredJsonWriteHandles.delete(key);
    writeJson(key, value);
  }, 0);
  deferredJsonWriteHandles.set(key, nextHandle);
}

export function setTreePathExpandedInState(
  current: TreeExpansionState,
  path: string,
  expanded: boolean
): TreeExpansionState {
  if ((current[path] ?? false) === expanded) {
    return current;
  }
  return { ...current, [path]: expanded };
}

export function toggleTreePathExpandedInState(
  current: TreeExpansionState,
  path: string
): TreeExpansionState {
  return { ...current, [path]: !(current[path] ?? false) };
}

export function expandTreePathChainInState(
  current: TreeExpansionState,
  path: string
): TreeExpansionState {
  let next = current;
  let changed = false;
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
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

function writeRightTool(tool: ToolId): void {
  try {
    window.localStorage.setItem(ACTIVE_RIGHT_TOOL_KEY, tool);
  } catch {
    /* ignore */
  }
}

function defaultNavigatorCollapsed(): Record<ToolId, boolean> {
  return {
    files: false,
    changes: false,
    browser: false,
    terminal: false,
    audit: false,
    settings: false,
    models: false,
  };
}

function defaultBrowserTabs(): BrowserTabState[] {
  return [{ id: createUiId('browser'), title: 'Start Page', url: 'about:blank' }];
}

function normalizeBrowserTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs.length > 0 ? tabs : defaultBrowserTabs();
}

export interface UiState {
  activeRightTool: ToolId;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  expandedFileTreePaths: Record<string, Record<string, boolean>>;
  expandedChangesTreePaths: Record<string, boolean>;
  filesNavigatorMode: FilesNavigatorMode;
  filePreviewModeByPath: Record<string, boolean>;
  changesPreviewEnabled: boolean;
  changesNavigatorMode: ChangesNavigatorMode;
  expandedSessionWorkspaces: Record<string, boolean>;
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarks: BrowserBookmark[];
  browserHistory: BrowserHistoryEntry[];
  chatMode: ChatMode;
  contextChips: ContextChip[];
  contextMenuOpen: boolean;
  fileMenuOpen: boolean;
  viewMenuOpen: boolean;
  helpMenuOpen: boolean;
  activeSettingsGroup: SettingsGroupId;
  settingsSearchQuery: string;
  setActiveSettingsGroup: (group: SettingsGroupId) => void;
  setSettingsSearchQuery: (query: string) => void;
  setActiveRightTool: (tool: ToolId) => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
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
  setChatMode: (mode: ChatMode) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;
  setContextMenuOpen: (open: boolean) => void;
  setFileMenuOpen: (open: boolean) => void;
  setViewMenuOpen: (open: boolean) => void;
  setHelpMenuOpen: (open: boolean) => void;
  closeAllMenus: () => void;
  browserOpenTab: (input?: Partial<BrowserTabState>) => void;
  browserSelectTab: (tabId: string) => void;
  browserCloseTab: (tabId: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserToggleBookmark: (input?: { url?: string; title?: string }) => void;
  browserClearHistory: () => void;
}

const initialBrowserTabs = normalizeBrowserTabs(readJson<BrowserTabState[]>(BROWSER_TABS_KEY, []));
const initialNavigatorCollapsed = {
  ...defaultNavigatorCollapsed(),
  ...readJson<Record<ToolId, boolean>>(NAVIGATOR_COLLAPSED_KEY, defaultNavigatorCollapsed()),
};

/**
 * @deprecated 正在迁移至 useAppStore 的 uiSlice，新增字段请直接添加到 uiSlice
 */
export const useUiStore = create<UiState>((set) => ({
  activeRightTool: readRightTool(),
  navigatorCollapsedByTool: initialNavigatorCollapsed,
  expandedFileTreePaths: readJson<Record<string, Record<string, boolean>>>(
    FILE_TREE_EXPANDED_KEY,
    {}
  ),
  expandedChangesTreePaths: readJson<Record<string, boolean>>(CHANGES_TREE_EXPANDED_KEY, {}),
  filesNavigatorMode: readFilesNavigatorMode(),
  filePreviewModeByPath: readJson<Record<string, boolean>>(FILE_PREVIEW_MODE_KEY, {}),
  changesPreviewEnabled: readFlag(CHANGES_PREVIEW_ENABLED_KEY, true),
  changesNavigatorMode: readChangesNavigatorMode(),
  expandedSessionWorkspaces: readJson<Record<string, boolean>>(SESSION_TABS_EXPANDED_KEY, {}),
  browserTabs: initialBrowserTabs,
  browserActiveTabId:
    readJson<string | null>(BROWSER_ACTIVE_TAB_KEY, null) ?? initialBrowserTabs[0].id,
  browserBookmarks: readJson<BrowserBookmark[]>(BROWSER_BOOKMARKS_KEY, []),
  browserHistory: readJson<BrowserHistoryEntry[]>(BROWSER_HISTORY_KEY, []),
  chatMode: 'ask',
  contextChips: [],
  contextMenuOpen: false,
  fileMenuOpen: false,
  viewMenuOpen: false,
  helpMenuOpen: false,
  activeSettingsGroup: 'general',
  settingsSearchQuery: '',
  setActiveRightTool: (tool) => {
    writeRightTool(tool);
    set({ activeRightTool: tool });
  },
  setNavigatorCollapsed: (tool, collapsed) =>
    set((state) => {
      const next = { ...state.navigatorCollapsedByTool, [tool]: collapsed };
      writeJson(NAVIGATOR_COLLAPSED_KEY, next);
      return { navigatorCollapsedByTool: next };
    }),
  toggleNavigator: (tool) =>
    set((state) => {
      const next = {
        ...state.navigatorCollapsedByTool,
        [tool]: !(state.navigatorCollapsedByTool[tool] ?? false),
      };
      writeJson(NAVIGATOR_COLLAPSED_KEY, next);
      return { navigatorCollapsedByTool: next };
    }),
  setFileTreePathExpanded: (workspaceId, path, expanded) =>
    set((state) => {
      const current = state.expandedFileTreePaths[workspaceId] ?? {};
      const next = setTreePathExpandedInState(current, path, expanded);
      if (next === current) {
        return state;
      }
      const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
      scheduleJsonWrite(FILE_TREE_EXPANDED_KEY, allPaths);
      return { expandedFileTreePaths: allPaths };
    }),
  toggleFileTreePath: (workspaceId, path) =>
    set((state) => {
      const current = state.expandedFileTreePaths[workspaceId] ?? {};
      const next = toggleTreePathExpandedInState(current, path);
      const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: next };
      scheduleJsonWrite(FILE_TREE_EXPANDED_KEY, allPaths);
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
      scheduleJsonWrite(FILE_TREE_EXPANDED_KEY, allPaths);
      return { expandedFileTreePaths: allPaths };
    }),
  collapseAllFileTreePaths: (workspaceId) =>
    set((state) => {
      const allPaths = { ...state.expandedFileTreePaths, [workspaceId]: {} };
      scheduleJsonWrite(FILE_TREE_EXPANDED_KEY, allPaths);
      return { expandedFileTreePaths: allPaths };
    }),
  setFilesNavigatorMode: (mode) => {
    writeFilesNavigatorMode(mode);
    set({ filesNavigatorMode: mode });
  },
  setFilePreviewModeForPath: (path, previewEnabled) =>
    set((state) => {
      const next = { ...state.filePreviewModeByPath, [path]: previewEnabled };
      scheduleJsonWrite(FILE_PREVIEW_MODE_KEY, next);
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
      scheduleJsonWrite(CHANGES_TREE_EXPANDED_KEY, next);
      return { expandedChangesTreePaths: next };
    }),
  toggleChangesTreePath: (path) =>
    set((state) => {
      const next = toggleTreePathExpandedInState(state.expandedChangesTreePaths, path);
      scheduleJsonWrite(CHANGES_TREE_EXPANDED_KEY, next);
      return { expandedChangesTreePaths: next };
    }),
  expandChangesTreePathChain: (path) =>
    set((state) => {
      const next = expandTreePathChainInState(state.expandedChangesTreePaths, path);
      if (next === state.expandedChangesTreePaths) {
        return state;
      }
      scheduleJsonWrite(CHANGES_TREE_EXPANDED_KEY, next);
      return { expandedChangesTreePaths: next };
    }),
  collapseAllChangesTreePaths: () => {
    scheduleJsonWrite(CHANGES_TREE_EXPANDED_KEY, {});
    set({ expandedChangesTreePaths: {} });
  },
  toggleSessionWorkspace: (workspaceId) =>
    set((state) => {
      const current = state.expandedSessionWorkspaces[workspaceId] ?? true;
      const next = { ...state.expandedSessionWorkspaces, [workspaceId]: !current };
      writeJson(SESSION_TABS_EXPANDED_KEY, next);
      return { expandedSessionWorkspaces: next };
    }),
  setChatMode: (mode) => set({ chatMode: mode }),
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
  browserOpenTab: (input) =>
    set((state) => {
      const tab: BrowserTabState = {
        id: createUiId('browser'),
        title: input?.title?.trim() || 'Start Page',
        url: input?.url?.trim() || 'about:blank',
        pinned: input?.pinned ?? false,
      };
      const nextTabs = [...state.browserTabs, tab];
      writeJson(BROWSER_TABS_KEY, nextTabs);
      writeJson(BROWSER_ACTIVE_TAB_KEY, tab.id);
      return { browserTabs: nextTabs, browserActiveTabId: tab.id };
    }),
  browserSelectTab: (tabId) => {
    writeJson(BROWSER_ACTIVE_TAB_KEY, tabId);
    set({ browserActiveTabId: tabId });
  },
  browserCloseTab: (tabId) =>
    set((state) => {
      const filtered = state.browserTabs.filter((tab) => tab.id !== tabId);
      const nextTabs = normalizeBrowserTabs(filtered);
      const nextActive =
        state.browserActiveTabId === tabId
          ? (nextTabs[Math.max(0, filtered.length - 1)]?.id ?? nextTabs[0].id)
          : state.browserActiveTabId;
      writeJson(BROWSER_TABS_KEY, nextTabs);
      writeJson(BROWSER_ACTIVE_TAB_KEY, nextActive);
      return {
        browserTabs: nextTabs,
        browserActiveTabId: nextActive,
      };
    }),
  browserNavigateActiveTab: (url, title) =>
    set((state) => {
      const cleanUrl = url.trim() || 'about:blank';

      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === state.browserActiveTabId
          ? {
              ...tab,
              url: cleanUrl,
              title: title?.trim() || (cleanUrl === 'about:blank' ? 'Start Page' : cleanUrl),
            }
          : tab
      );

      const nextHistory = [
        {
          id: createUiId('visit'),
          url: cleanUrl,
          title: title?.trim() || cleanUrl,
          visitedAt: Date.now(),
        },
        ...state.browserHistory,
      ].slice(0, 24);
      writeJson(BROWSER_TABS_KEY, nextTabs);
      writeJson(BROWSER_HISTORY_KEY, nextHistory);
      return { browserTabs: nextTabs, browserHistory: nextHistory };
    }),
  browserToggleBookmark: (input) =>
    set((state) => {
      const active =
        state.browserTabs.find((tab) => tab.id === state.browserActiveTabId) ??
        state.browserTabs[0];
      const url = input?.url?.trim() || active.url;
      const title = input?.title?.trim() || active.title;
      const exists = state.browserBookmarks.some((bookmark) => bookmark.url === url);
      const nextBookmarks = exists
        ? state.browserBookmarks.filter((bookmark) => bookmark.url !== url)
        : [...state.browserBookmarks, { url, title }];
      writeJson(BROWSER_BOOKMARKS_KEY, nextBookmarks);
      return { browserBookmarks: nextBookmarks };
    }),
  browserClearHistory: () => {
    writeJson(BROWSER_HISTORY_KEY, []);
    set({ browserHistory: [] });
  },
}));
