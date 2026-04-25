import { create } from "zustand";
import type { SettingsGroupId } from "@ai-digital-life/kernel";

/**
 * Renderer-only UI state.
 *
 * Purely cosmetic, navigation, and local-shell behavior that does not need to
 * cross the IPC boundary lives here. Persistence is limited to localStorage.
 */

export type ToolId = "files" | "changes" | "browser" | "terminal" | "audit" | "settings" | "models";
export type ChatMode = "plan" | "debug" | "ask";
export type TerminalProfile = "powershell" | "bash" | "cmd";
export type TerminalLayout = "single" | "vertical" | "horizontal";

export interface ContextChip {
  id: string;
  kind: "file" | "doc" | "url" | "codebase" | "skill" | "model" | "mcp";
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

export interface TerminalTabState {
  id: string;
  title: string;
  profile: TerminalProfile;
  commandBinary: string;
  commandArgs: string;
  live: boolean;
}

const LEFT_COLLAPSED_KEY = "adl-ui:left-collapsed";
const RIGHT_COLLAPSED_KEY = "adl-ui:right-collapsed";
const ACTIVE_TOOL_KEY = "adl-ui:active-tool";
const SESSION_TABS_EXPANDED_KEY = "adl-ui:session-tabs-expanded";
const RIGHT_PANEL_WIDTH_KEY = "adl-ui:right-panel-width";
const FILES_NAVIGATOR_WIDTH_KEY = "adl-ui:files-navigator-width";
const CHANGES_NAVIGATOR_WIDTH_KEY = "adl-ui:changes-navigator-width";
const BROWSER_NAVIGATOR_WIDTH_KEY = "adl-ui:browser-navigator-width";
const TERMINAL_NAVIGATOR_WIDTH_KEY = "adl-ui:terminal-navigator-width";
const NAVIGATOR_COLLAPSED_KEY = "adl-ui:navigator-collapsed";
const FILE_TREE_EXPANDED_KEY = "adl-ui:file-tree-expanded";
const BROWSER_TABS_KEY = "adl-ui:browser-tabs";
const BROWSER_ACTIVE_TAB_KEY = "adl-ui:browser-active-tab";
const BROWSER_BOOKMARKS_KEY = "adl-ui:browser-bookmarks";
const BROWSER_HISTORY_KEY = "adl-ui:browser-history";
const TERMINAL_TABS_KEY = "adl-ui:terminal-tabs";
const TERMINAL_ACTIVE_TAB_KEY = "adl-ui:terminal-active-tab";
const TERMINAL_LAYOUT_KEY = "adl-ui:terminal-layout";

export const RIGHT_PANEL_WIDTH_MIN = 520;
export const RIGHT_PANEL_WIDTH_MAX = 680;
const DEFAULT_RIGHT_PANEL_WIDTH = 620;
const FILES_NAVIGATOR_WIDTH_MIN = 180;
const FILES_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_FILES_NAVIGATOR_WIDTH = 240;
const CHANGES_NAVIGATOR_WIDTH_MIN = 180;
const CHANGES_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_CHANGES_NAVIGATOR_WIDTH = 240;
const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;
const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;
const TOOL_IDS: ToolId[] = ["files", "changes", "browser", "terminal", "audit", "settings", "models"];

function createUiId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readTool(): ToolId {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TOOL_KEY);
    if (raw === "files" || raw === "changes" || raw === "browser" || raw === "terminal" || raw === "audit" || raw === "settings" || raw === "models") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "files";
}

function writeTool(tool: ToolId): void {
  try {
    window.localStorage.setItem(ACTIVE_TOOL_KEY, tool);
  } catch {
    /* ignore */
  }
}

function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key));
    if (Number.isFinite(raw)) {
      return clamp(raw, min, max);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
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
    models: false
  };
}

function defaultBrowserTabs(): BrowserTabState[] {
  return [{ id: createUiId("browser"), title: "Start Page", url: "about:blank" }];
}

function normalizeBrowserTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs.length > 0 ? tabs : defaultBrowserTabs();
}

function defaultTerminalTabs(): TerminalTabState[] {
  return [
    {
      id: createUiId("terminal"),
      title: "PowerShell",
      profile: "powershell",
      commandBinary: "npm",
      commandArgs: "run test",
      live: true
    }
  ];
}

function normalizeTerminalTabs(tabs: TerminalTabState[]): TerminalTabState[] {
  return tabs.length > 0 ? tabs : defaultTerminalTabs();
}

function deriveTerminalTitle(profile: TerminalProfile, count: number): string {
  const label = profile === "powershell" ? "PowerShell" : profile === "bash" ? "Bash" : "CMD";
  return count > 1 ? `${label} ${count}` : label;
}

export interface UiState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  activeTool: ToolId;
  rightPanelWidth: number;
  filesNavigatorWidth: number;
  changesNavigatorWidth: number;
  browserNavigatorWidth: number;
  terminalNavigatorWidth: number;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  expandedFileTreePaths: Record<string, boolean>;
  expandedSessionWorkspaces: Record<string, boolean>;
  browserTabs: BrowserTabState[];
  browserActiveTabId: string;
  browserBookmarks: BrowserBookmark[];
  browserHistory: BrowserHistoryEntry[];
  terminalTabs: TerminalTabState[];
  terminalActiveTabId: string;
  terminalLayout: TerminalLayout;
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
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBoth: () => void;
  setActiveTool: (tool: ToolId) => void;
  setRightPanelWidth: (width: number) => void;
  setFilesNavigatorWidth: (width: number) => void;
  setChangesNavigatorWidth: (width: number) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
  setFileTreePathExpanded: (path: string, expanded: boolean) => void;
  toggleFileTreePath: (path: string) => void;
  expandFileTreePathChain: (path: string) => void;
  collapseAllFileTreePaths: () => void;
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
  terminalCreateTab: (profile?: TerminalProfile) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalSetLayout: (layout: TerminalLayout) => void;
}

const initialBrowserTabs = normalizeBrowserTabs(readJson<BrowserTabState[]>(BROWSER_TABS_KEY, []));
const initialTerminalTabs = normalizeTerminalTabs(readJson<TerminalTabState[]>(TERMINAL_TABS_KEY, []));
const initialNavigatorCollapsed = {
  ...defaultNavigatorCollapsed(),
  ...readJson<Record<ToolId, boolean>>(NAVIGATOR_COLLAPSED_KEY, defaultNavigatorCollapsed())
};

export const useUiStore = create<UiState>((set) => ({
  leftCollapsed: readFlag(LEFT_COLLAPSED_KEY, false),
  rightCollapsed: readFlag(RIGHT_COLLAPSED_KEY, false),
  activeTool: readTool(),
  rightPanelWidth: readNumber(RIGHT_PANEL_WIDTH_KEY, DEFAULT_RIGHT_PANEL_WIDTH, RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
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
  terminalNavigatorWidth: readNumber(
    TERMINAL_NAVIGATOR_WIDTH_KEY,
    DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    TERMINAL_NAVIGATOR_WIDTH_MIN,
    TERMINAL_NAVIGATOR_WIDTH_MAX
  ),
  navigatorCollapsedByTool: initialNavigatorCollapsed,
  expandedFileTreePaths: readJson<Record<string, boolean>>(FILE_TREE_EXPANDED_KEY, {}),
  expandedSessionWorkspaces: readJson<Record<string, boolean>>(SESSION_TABS_EXPANDED_KEY, {}),
  browserTabs: initialBrowserTabs,
  browserActiveTabId: readJson<string | null>(BROWSER_ACTIVE_TAB_KEY, null) ?? initialBrowserTabs[0].id,
  browserBookmarks: readJson<BrowserBookmark[]>(BROWSER_BOOKMARKS_KEY, []),
  browserHistory: readJson<BrowserHistoryEntry[]>(BROWSER_HISTORY_KEY, []),
  terminalTabs: initialTerminalTabs,
  terminalActiveTabId: readJson<string | null>(TERMINAL_ACTIVE_TAB_KEY, null) ?? initialTerminalTabs[0].id,
  terminalLayout: readJson<TerminalLayout>(TERMINAL_LAYOUT_KEY, "single"),
  chatMode: "ask",
  contextChips: [],
  contextMenuOpen: false,
  fileMenuOpen: false,
  viewMenuOpen: false,
  helpMenuOpen: false,
  activeSettingsGroup: "general",
  settingsSearchQuery: "",
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
  setActiveTool: (tool) => {
    writeTool(tool);
    set({ activeTool: tool, rightCollapsed: false });
  },
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
  setTerminalNavigatorWidth: (width) => {
    const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
    writeNumber(TERMINAL_NAVIGATOR_WIDTH_KEY, next);
    set({ terminalNavigatorWidth: next });
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
        [tool]: !(state.navigatorCollapsedByTool[tool] ?? false)
      };
      writeJson(NAVIGATOR_COLLAPSED_KEY, next);
      return { navigatorCollapsedByTool: next };
    }),
  setFileTreePathExpanded: (path, expanded) =>
    set((state) => {
      const next = { ...state.expandedFileTreePaths, [path]: expanded };
      writeJson(FILE_TREE_EXPANDED_KEY, next);
      return { expandedFileTreePaths: next };
    }),
  toggleFileTreePath: (path) =>
    set((state) => {
      const next = { ...state.expandedFileTreePaths, [path]: !(state.expandedFileTreePaths[path] ?? false) };
      writeJson(FILE_TREE_EXPANDED_KEY, next);
      return { expandedFileTreePaths: next };
    }),
  expandFileTreePathChain: (path) =>
    set((state) => {
      const next = { ...state.expandedFileTreePaths };
      const segments = path.split("/").filter(Boolean);
      let current = "";
      for (let index = 0; index < segments.length - 1; index += 1) {
        current = current ? `${current}/${segments[index]}` : segments[index];
        next[current] = true;
      }
      writeJson(FILE_TREE_EXPANDED_KEY, next);
      return { expandedFileTreePaths: next };
    }),
  collapseAllFileTreePaths: () => {
    writeJson(FILE_TREE_EXPANDED_KEY, {});
    set({ expandedFileTreePaths: {} });
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
      contextMenuOpen: false
    }),
  setViewMenuOpen: (open) =>
    set({
      viewMenuOpen: open,
      fileMenuOpen: false,
      helpMenuOpen: false,
      contextMenuOpen: false
    }),
  setHelpMenuOpen: (open) =>
    set({
      helpMenuOpen: open,
      fileMenuOpen: false,
      viewMenuOpen: false,
      contextMenuOpen: false
    }),
  closeAllMenus: () =>
    set({
      fileMenuOpen: false,
      viewMenuOpen: false,
      helpMenuOpen: false,
      contextMenuOpen: false
    }),
  setActiveSettingsGroup: (group) => set({ activeSettingsGroup: group }),
  setSettingsSearchQuery: (query) => set({ settingsSearchQuery: query }),
  browserOpenTab: (input) =>
    set((state) => {
      const tab: BrowserTabState = {
        id: createUiId("browser"),
        title: input?.title?.trim() || "Start Page",
        url: input?.url?.trim() || "about:blank",
        pinned: input?.pinned ?? false
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
          ? nextTabs[Math.max(0, filtered.length - 1)]?.id ?? nextTabs[0].id
          : state.browserActiveTabId;
      writeJson(BROWSER_TABS_KEY, nextTabs);
      writeJson(BROWSER_ACTIVE_TAB_KEY, nextActive);
      return {
        browserTabs: nextTabs,
        browserActiveTabId: nextActive
      };
    }),
  browserNavigateActiveTab: (url, title) =>
    set((state) => {
      const cleanUrl = url.trim() || "about:blank";
      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === state.browserActiveTabId
          ? {
              ...tab,
              url: cleanUrl,
              title: title?.trim() || (cleanUrl === "about:blank" ? "Start Page" : cleanUrl)
            }
          : tab
      );
      const nextHistory = [
        {
          id: createUiId("visit"),
          url: cleanUrl,
          title: title?.trim() || cleanUrl,
          visitedAt: Date.now()
        },
        ...state.browserHistory
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
  terminalCreateTab: (profile = "powershell") =>
    set((state) => {
      const existingCount = state.terminalTabs.filter((tab) => tab.profile === profile).length + 1;
      const tab: TerminalTabState = {
        id: createUiId("terminal"),
        title: deriveTerminalTitle(profile, existingCount),
        profile,
        commandBinary: "npm",
        commandArgs: "run test",
        live: existingCount === 1
      };
      const nextTabs = [...state.terminalTabs, tab];
      writeJson(TERMINAL_TABS_KEY, nextTabs);
      writeJson(TERMINAL_ACTIVE_TAB_KEY, tab.id);
      return { terminalTabs: nextTabs, terminalActiveTabId: tab.id };
    }),
  terminalSelectTab: (tabId) => {
    writeJson(TERMINAL_ACTIVE_TAB_KEY, tabId);
    set({ terminalActiveTabId: tabId });
  },
  terminalCloseTab: (tabId) =>
    set((state) => {
      const filtered = state.terminalTabs.filter((tab) => tab.id !== tabId);
      const nextTabs = normalizeTerminalTabs(filtered);
      const nextActive =
        state.terminalActiveTabId === tabId
          ? nextTabs[Math.max(0, filtered.length - 1)]?.id ?? nextTabs[0].id
          : state.terminalActiveTabId;
      writeJson(TERMINAL_TABS_KEY, nextTabs);
      writeJson(TERMINAL_ACTIVE_TAB_KEY, nextActive);
      return {
        terminalTabs: nextTabs,
        terminalActiveTabId: nextActive
      };
    }),
  terminalUpdateActiveTab: (patch) =>
    set((state) => {
      const nextTabs = state.terminalTabs.map((tab) =>
        tab.id === state.terminalActiveTabId ? { ...tab, ...patch } : tab
      );
      writeJson(TERMINAL_TABS_KEY, nextTabs);
      return { terminalTabs: nextTabs };
    }),
  terminalSetLayout: (layout) => {
    writeJson(TERMINAL_LAYOUT_KEY, layout);
    set({ terminalLayout: layout });
  }
}));
