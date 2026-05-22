/**
 * 终端切片
 * 管理终端标签页、会话等状态
 */
import type { TerminalProfile, TerminalTabState, ToolId } from "../../ui-store";
import type { StoreState } from "../StoreState";

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

  terminalCreateTab: (profile?: TerminalProfile) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalCloseAllTabs: () => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  toggleTerminalNavigator: () => void;
  setTerminalNavigatorCollapsed: (collapsed: boolean) => void;
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

  terminalCreateTab: (profile = "powershell") =>
    set((state) => {
      const existingCount = state.terminalTabs.filter((tab) => tab.profile === profile).length + 1;
      const tab: TerminalTabState = {
        id: createUiId("terminal"),
        title: deriveTerminalTitle(profile, existingCount),
        profile,
        status: "idle"
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
          ? nextTabs[nextTabs.length - 1]?.id ?? ""
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

  terminalCloseAllTabs: () => {
    writeJson(TERMINAL_TABS_KEY, []);
    writeJson(TERMINAL_ACTIVE_TAB_KEY, "");
    set({ terminalTabs: [], terminalActiveTabId: "" });
  },

  setDefaultTerminalProfile: (profile) => {
    writeJson(TERMINAL_DEFAULT_PROFILE_KEY, profile);
    set({ defaultTerminalProfile: profile });
  },

  setTerminalNavigatorWidth: (width) => {
    const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
    writeNumber(TERMINAL_NAVIGATOR_WIDTH_KEY, next);
    set({ terminalNavigatorWidth: next });
  },

  toggleTerminalNavigator: () =>
    set((state) => {
      const next = {
        ...state.navigatorCollapsedByTool,
        terminal: !(state.navigatorCollapsedByTool.terminal ?? false)
      };
      writeJson(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next);
      return { navigatorCollapsedByTool: next };
    }),

  setTerminalNavigatorCollapsed: (collapsed) =>
    set((state) => {
      const next = { ...state.navigatorCollapsedByTool, terminal: collapsed };
      writeJson(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next);
      return { navigatorCollapsedByTool: next };
    })
});
