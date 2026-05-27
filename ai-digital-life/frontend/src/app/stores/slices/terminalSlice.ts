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
const TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY = "adl-ui:terminal-workspace-default-profiles";
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

function buildTabsById(tabs: TerminalTabState[]): Record<string, TerminalTabState> {
  const result: Record<string, TerminalTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
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

// Batch write scheduler — coalesces multiple localStorage writes into one
const pendingWrites = new Map<string, unknown>();
const pendingNumberWrites = new Map<string, number>();
let writeScheduled = false;

function scheduleWrite(key: string, value: unknown): void {
  pendingWrites.set(key, value);
  scheduleFlush();
}

function scheduleNumberWrite(key: string, value: number): void {
  pendingNumberWrites.set(key, value);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  const flush = () => {
    writeScheduled = false;
    for (const [key, value] of pendingWrites) {
      writeJson(key, value);
    }
    pendingWrites.clear();
    for (const [key, value] of pendingNumberWrites) {
      writeNumber(key, value);
    }
    pendingNumberWrites.clear();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 500 });
  } else {
    setTimeout(flush, 50);
  }
}

// Lazy localStorage hydration — reads persisted values in idle time
let _defaultsHydrated = false;

function hydrateTerminalDefaults(get: () => StoreState, set: (partial: Partial<StoreState>) => void): void {
  if (_defaultsHydrated) return;
  _defaultsHydrated = true;
  const doHydrate = () => {
    const profile = readJson<TerminalProfile>(TERMINAL_DEFAULT_PROFILE_KEY, "powershell");
    const workspaceProfiles = readJson<Record<string, TerminalProfile>>(TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY, {});
    const width = readNumber(TERMINAL_NAVIGATOR_WIDTH_KEY, DEFAULT_TERMINAL_NAVIGATOR_WIDTH, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
    const collapsed = {
      ...defaultNavigatorCollapsed(),
      ...readJson<Record<ToolId, boolean>>(TERMINAL_NAVIGATOR_COLLAPSED_KEY, defaultNavigatorCollapsed())
    };
    set({
      defaultTerminalProfile: profile,
      workspaceDefaultProfiles: workspaceProfiles,
      terminalNavigatorWidth: width,
      navigatorCollapsedByTool: collapsed,
    });
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, 200);
  }
}

const initialTerminalTabs: TerminalTabState[] = [];

// Type and slice definition
export interface TerminalSlice {
  terminalTabs: TerminalTabState[];
  terminalTabsById: Record<string, TerminalTabState>;
  terminalActiveTabId: string;
  defaultTerminalProfile: TerminalProfile;
  workspaceDefaultProfiles: Record<string, TerminalProfile>;
  terminalNavigatorWidth: number;
  navigatorCollapsedByTool: Record<ToolId, boolean>;
  terminalWorkspaceExpanded: Record<string, boolean>;
  terminalPersisted: boolean;
  terminalWorkspaceId: string;

  terminalCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalUpdateTab: (tabId: string, patch: Partial<Omit<TerminalTabState, "id">>) => void;
  terminalTogglePin: (tabId: string) => void;
  terminalReorderTabs: (newOrder: TerminalTabState[]) => void;
  terminalCloseAllTabs: () => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setWorkspaceDefaultTerminalProfile: (workspaceId: string, profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  toggleTerminalNavigator: () => void;
  setTerminalNavigatorCollapsed: (collapsed: boolean) => void;
  setTerminalWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setTerminalPersisted: (persisted: boolean) => void;
  setTerminalWorkspaceId: (workspaceId: string) => void;
}

export const createTerminalSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): TerminalSlice => {
  hydrateTerminalDefaults(get, set);
  return {
    terminalTabs: initialTerminalTabs,
    terminalTabsById: {},
    terminalActiveTabId: "",
    defaultTerminalProfile: "powershell",
    workspaceDefaultProfiles: {},
    terminalNavigatorWidth: DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),
    terminalWorkspaceExpanded: {},
    terminalPersisted: false,
    terminalWorkspaceId: "",

    terminalCreateTab: (profile: TerminalProfile | undefined, workspaceId = "") =>
      set((state) => {
        // 使用工作区专属默认终端类型，如果没有则使用全局默认
        let finalProfile: TerminalProfile;
        if (profile) {
          finalProfile = profile;
        } else if (workspaceId && state.workspaceDefaultProfiles[workspaceId]) {
          finalProfile = state.workspaceDefaultProfiles[workspaceId];
        } else {
          finalProfile = state.defaultTerminalProfile;
        }
        const existingCount = state.terminalTabs.filter((tab) => tab.profile === finalProfile).length + 1;
        const maxSortOrder = state.terminalTabs.length > 0 ? Math.max(...state.terminalTabs.map(t => t.sortOrder)) : 0;
        const tab: TerminalTabState = {
          id: createUiId("terminal"),
          workspaceId,
          title: deriveTerminalTitle(finalProfile, existingCount),
          profile: finalProfile,
          status: "idle",
          isPinned: false,
          sortOrder: maxSortOrder + 1
        };
        const nextTabs = sortTabs([...state.terminalTabs, tab]);
        scheduleWrite(TERMINAL_TABS_KEY, nextTabs);
        scheduleWrite(TERMINAL_ACTIVE_TAB_KEY, tab.id);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs), terminalActiveTabId: tab.id };
      }),

    terminalSelectTab: (tabId) => {
      scheduleWrite(TERMINAL_ACTIVE_TAB_KEY, tabId);
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
        scheduleWrite(TERMINAL_TABS_KEY, nextTabs);
        scheduleWrite(TERMINAL_ACTIVE_TAB_KEY, nextActive);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: nextActive
        };
      }),

    terminalUpdateActiveTab: (patch) =>
      set((state) => {
        const nextTabs = sortTabs(state.terminalTabs.map((tab) =>
          tab.id === state.terminalActiveTabId ? { ...tab, ...patch } : tab
        ));
        scheduleWrite(TERMINAL_TABS_KEY, nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalUpdateTab: (tabId, patch) =>
      set((state) => {
        const nextTabs = sortTabs(state.terminalTabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab
        ));
        scheduleWrite(TERMINAL_TABS_KEY, nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
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
        scheduleWrite(TERMINAL_TABS_KEY, nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalReorderTabs: (newOrder) =>
      set((state) => {
        const pinnedTabs = newOrder.filter(t => t.isPinned);
        const unpinnedTabs = newOrder.filter(t => !t.isPinned);

        const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
          ...tab,
          sortOrder: index
        }));

        scheduleWrite(TERMINAL_TABS_KEY, reorderedWithSort);
        return { terminalTabs: reorderedWithSort, terminalTabsById: buildTabsById(reorderedWithSort) };
      }),

    terminalCloseAllTabs: () => {
      scheduleWrite(TERMINAL_TABS_KEY, []);
      scheduleWrite(TERMINAL_ACTIVE_TAB_KEY, "");
      set({ terminalTabs: [], terminalTabsById: {}, terminalActiveTabId: "" });
    },

    setDefaultTerminalProfile: (profile) => {
      scheduleWrite(TERMINAL_DEFAULT_PROFILE_KEY, profile);
      set({ defaultTerminalProfile: profile });
    },

    setWorkspaceDefaultTerminalProfile: (workspaceId, profile) => {
      set((state) => {
        const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
        scheduleWrite(TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY, nextWorkspaceProfiles);
        return { workspaceDefaultProfiles: nextWorkspaceProfiles };
      });
    },

    setTerminalNavigatorWidth: (width) => {
      const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
      scheduleNumberWrite(TERMINAL_NAVIGATOR_WIDTH_KEY, next);
      set({ terminalNavigatorWidth: next });
    },

    toggleTerminalNavigator: () =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          terminal: !(state.navigatorCollapsedByTool.terminal ?? false)
        };
        scheduleWrite(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),

    setTerminalNavigatorCollapsed: (collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, terminal: collapsed };
        scheduleWrite(TERMINAL_NAVIGATOR_COLLAPSED_KEY, next);
        return { navigatorCollapsedByTool: next };
      }),

    setTerminalWorkspaceExpanded: (expanded) =>
      set({ terminalWorkspaceExpanded: expanded }),

    setTerminalPersisted: (persisted) =>
      set({ terminalPersisted: persisted }),

    setTerminalWorkspaceId: (workspaceId) =>
      set({ terminalWorkspaceId: workspaceId })
  };
};
