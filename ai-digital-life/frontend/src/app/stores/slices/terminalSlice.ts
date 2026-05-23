/**
 * 终端切片
 * 管理终端标签页、会话等状态
 */
import type { StoreState } from "../StoreState";

// 本地类型定义，消除对 ui-store 的跨 store 依赖
export type TerminalProfile = "powershell" | "bash" | "cmd";
export type ToolId = "files" | "changes" | "browser" | "terminal" | "audit" | "settings" | "models";

export interface TerminalTabState {
  id: string;
  workspaceId: string;
  title: string;
  profile: TerminalProfile;
  sessionId?: string;
  status: "idle" | "running" | "terminated";
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
}

// Local storage keys
const TERMINAL_TABS_KEY = "adl-ui:terminal-tabs";
const TERMINAL_ACTIVE_TAB_KEY = "adl-ui:terminal-active-tab";
const TERMINAL_DEFAULT_PROFILE_KEY = "adl-ui:terminal-default-profile";
const TERMINAL_NAVIGATOR_WIDTH_KEY = "adl-ui:terminal-navigator-width";
const TERMINAL_NAVIGATOR_COLLAPSED_KEY = "adl-ui:navigator-collapsed";

// Constants
const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;

// Helper functions
function createUiId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function deriveTerminalTitle(profile: TerminalProfile, count: number): string {
  const label = profile === "powershell" ? "PowerShell" : profile === "bash" ? "Bash" : "CMD";
  return count > 1 ? `${label} ${count}` : label;
}

function sortTabs(tabs: TerminalTabState[]): TerminalTabState[] {
  return [...tabs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

function normalizeTerminalTabs(tabs: TerminalTabState[]): TerminalTabState[] {
  return tabs;
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

// Initialize values (clear old terminal tabs from localStorage for consistency)
try {
  localStorage.removeItem(TERMINAL_TABS_KEY);
} catch {}
try {
  localStorage.removeItem(TERMINAL_ACTIVE_TAB_KEY);
} catch {}
const initialTerminalTabs: TerminalTabState[] = [];

// Type and slice definition
export interface TerminalSlice {
  terminalTabs: TerminalTabState[];
  terminalActiveTabId: string;
  defaultTerminalProfile: TerminalProfile;
  terminalNavigatorWidth: number;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  terminalWorkspaceExpanded: Record<string, boolean>;
  terminalPersisted: boolean;

  terminalCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalUpdateTab: (tabId: string, patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalTogglePin: (tabId: string) => void;
  terminalReorderTabs: (newOrder: TerminalTabState[]) => void;
  terminalCloseAllTabs: () => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  toggleTerminalNavigator: () => void;
  setTerminalNavigatorCollapsed: (collapsed: boolean) => void;
  setTerminalWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setTerminalPersisted: (persisted: boolean) => void;
}

export const createTerminalSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): TerminalSlice => ({
  terminalTabs: initialTerminalTabs,
  terminalActiveTabId: "",
  defaultTerminalProfile: readJson<TerminalProfile>(TERMINAL_DEFAULT_PROFILE_KEY, "powershell"),
  terminalNavigatorWidth: readNumber(
    TERMINAL_NAVIGATOR_WIDTH_KEY,
    DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    TERMINAL_NAVIGATOR_WIDTH_MIN,
    TERMINAL_NAVIGATOR_WIDTH_MAX
  ),
  navigatorCollapsedByTool: {
    ...defaultNavigatorCollapsed(),
    ...readJson<Record<ToolId, boolean>>(TERMINAL_NAVIGATOR_COLLAPSED_KEY, defaultNavigatorCollapsed())
  },
  terminalWorkspaceExpanded: {},
  terminalPersisted: false,

  terminalCreateTab: (profile = "powershell", workspaceId = "") =>
    set((state) => {
      const existingCount = state.terminalTabs.filter((tab) => tab.profile === profile).length + 1;
      const maxSortOrder = state.terminalTabs.length > 0 ? Math.max(...state.terminalTabs.map(t => t.sortOrder)) : 0;
      const tab: TerminalTabState = {
        id: createUiId("terminal"),
        workspaceId,
        title: deriveTerminalTitle(profile, existingCount),
        profile,
        status: "idle",
        isPinned: false,
        sortOrder: maxSortOrder + 1
      };
      const nextTabs = sortTabs([...state.terminalTabs, tab]);
      setTimeout(() => writeJson(TERMINAL_TABS_KEY, nextTabs), 0);
      setTimeout(() => writeJson(TERMINAL_ACTIVE_TAB_KEY, tab.id), 0);
      return { terminalTabs: nextTabs, terminalActiveTabId: tab.id };
    }),

  terminalSelectTab: (tabId) => {
    setTimeout(() => writeJson(TERMINAL_ACTIVE_TAB_KEY, tabId), 0);
    set({ terminalActiveTabId: tabId });
  },

  terminalCloseTab: (tabId) =>
    set((state) => {
      const filtered = state.terminalTabs.filter((tab) => tab.id !== tabId);
      const nextTabs = sortTabs(filtered);
      const nextActive =
        state.terminalActiveTabId === tabId
          ? nextTabs[nextTabs.length - 1]?.id ?? ""
          : state.terminalActiveTabId;
      setTimeout(() => writeJson(TERMINAL_TABS_KEY, nextTabs), 0);
      setTimeout(() => writeJson(TERMINAL_ACTIVE_TAB_KEY, nextActive), 0);
      return {
        terminalTabs: nextTabs,
        terminalActiveTabId: nextActive
      };
    }),

  terminalUpdateActiveTab: (patch) =>
    set((state) => {
      const nextTabs = sortTabs(state.terminalTabs.map((tab) =>
        tab.id === state.terminalActiveTabId ? { ...tab, ...patch } : tab
      ));
      setTimeout(() => writeJson(TERMINAL_TABS_KEY, nextTabs), 0);
      return { terminalTabs: nextTabs };
    }),

  terminalUpdateTab: (tabId, patch) =>
    set((state) => {
      const nextTabs = sortTabs(state.terminalTabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...patch } : tab
      ));
      setTimeout(() => writeJson(TERMINAL_TABS_KEY, nextTabs), 0);
      return { terminalTabs: nextTabs };
    }),

  terminalTogglePin: (tabId) =>
    set((state) => {
      const nextTabs = sortTabs(state.terminalTabs.map((tab) => {
        if (tab.id === tabId) {
          return {
            ...tab,
            isPinned: !tab.isPinned,
            pinnedAt: !tab.isPinned ? Date.now() : undefined
          };
        }
        return tab;
      }));
      setTimeout(() => writeJson(TERMINAL_TABS_KEY, nextTabs), 0);
      return { terminalTabs: nextTabs };
    }),

  terminalReorderTabs: (newOrder) =>
    set((state) => {
      const pinnedTabs = newOrder.filter(t => t.isPinned);
      const unpinnedTabs = newOrder.filter(t => !t.isPinned);

      const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
        ...tab,
        sortOrder: index
      }));

      setTimeout(() => writeJson(TERMINAL_TABS_KEY, reorderedWithSort), 0);
      return { terminalTabs: reorderedWithSort };
    }),

  terminalCloseAllTabs: () => {
    setTimeout(() => writeJson(TERMINAL_TABS_KEY, []), 0);
    setTimeout(() => writeJson(TERMINAL_ACTIVE_TAB_KEY, ""), 0);
    set({ terminalTabs: [], terminalActiveTabId: "" });
  },

  setDefaultTerminalProfile: (profile) => {
    setTimeout(() => writeJson(TERMINAL_DEFAULT_PROFILE_KEY, profile), 0);
    set({ defaultTerminalProfile: profile });
  },

  setTerminalNavigatorWidth: (width) => {
    const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
    setTimeout(() => writeNumber(TERMINAL_NAVIGATOR_WIDTH_KEY, next), 0);
    set({ terminalNavigatorWidth: next });
  },

  toggleTerminalNavigator: () =>
    set((state) => {
      const next = {
        ...state.navigatorCollapsedByTool,
        terminal: !(state.navigatorCollapsedByTool.terminal ?? false)
      };
      setTimeout(() => writeJson(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next), 0);
      return { navigatorCollapsedByTool: next };
    }),

  setTerminalNavigatorCollapsed: (collapsed) =>
    set((state) => {
      const next = { ...state.navigatorCollapsedByTool, terminal: collapsed };
      setTimeout(() => writeJson(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next), 0);
      return { navigatorCollapsedByTool: next };
    }),

  setTerminalWorkspaceExpanded: (expanded) =>
    set({ terminalWorkspaceExpanded: expanded }),

  setTerminalPersisted: (persisted) =>
    set({ terminalPersisted: persisted })
});
