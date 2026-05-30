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
const TERMINAL_WORKSPACE_EXPANDED_KEY = "adl-ui:terminal-workspace-expanded";

// Constants
const TERMINAL_NAVIGATOR_WIDTH_MIN = 180;
const TERMINAL_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 240;

// Helper functions
import { clamp, readJson, writeJson, readNumber, writeNumber, createUiId, createDebouncedWrite } from "../shared";

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
const { scheduleWrite, scheduleNumberWrite } = createDebouncedWrite(50);

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
    const workspaceExpanded = readJson<Record<string, boolean>>(TERMINAL_WORKSPACE_EXPANDED_KEY, {});
    set({
      defaultTerminalProfile: profile,
      workspaceDefaultProfiles: workspaceProfiles,
      terminalNavigatorWidth: width,
      navigatorCollapsedByTool: collapsed,
      terminalWorkspaceExpanded: workspaceExpanded,
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
        if (state.terminalTabs === newOrder) return state;

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
      try {
        window.localStorage.setItem(TERMINAL_DEFAULT_PROFILE_KEY, JSON.stringify(profile));
      } catch {
        /* ignore */
      }
      scheduleWrite(TERMINAL_DEFAULT_PROFILE_KEY, profile);
      set({ defaultTerminalProfile: profile });
    },

    setWorkspaceDefaultTerminalProfile: (workspaceId, profile) => {
      set((state) => {
        const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
        try {
          window.localStorage.setItem(
            TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
            JSON.stringify(nextWorkspaceProfiles)
          );
        } catch {
          /* ignore */
        }
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

    setTerminalWorkspaceExpanded: (expanded) => {
      scheduleWrite(TERMINAL_WORKSPACE_EXPANDED_KEY, expanded);
      set({ terminalWorkspaceExpanded: expanded });
    },

    setTerminalPersisted: (persisted) =>
      set({ terminalPersisted: persisted }),

    setTerminalWorkspaceId: (workspaceId) =>
      set({ terminalWorkspaceId: workspaceId })
  };
};
