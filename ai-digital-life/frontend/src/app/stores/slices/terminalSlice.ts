/**
 * 终端切片
 * 管理终端标签页、会话等状态
 */
import type { StoreState } from '../StoreState';
import type { TerminalProfile, ToolId } from '../types';
import type { TerminalTabState, CommandHistoryEntry } from './terminalSliceTypes';
import {
  TERMINAL_TABS_KEY,
  TERMINAL_ACTIVE_TAB_KEY,
  TERMINAL_DEFAULT_PROFILE_KEY,
  TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
  TERMINAL_NAVIGATOR_WIDTH_KEY,
  TERMINAL_NAVIGATOR_COLLAPSED_KEY,
  TERMINAL_WORKSPACE_EXPANDED_KEY,
  TERMINAL_COMMAND_HISTORY_KEY,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
} from './terminalSliceTypes';

export type { TerminalTabState, CommandHistoryEntry };
export {
  TERMINAL_TABS_KEY,
  TERMINAL_ACTIVE_TAB_KEY,
  TERMINAL_DEFAULT_PROFILE_KEY,
  TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
  TERMINAL_NAVIGATOR_WIDTH_KEY,
  TERMINAL_NAVIGATOR_COLLAPSED_KEY,
  TERMINAL_WORKSPACE_EXPANDED_KEY,
  TERMINAL_COMMAND_HISTORY_KEY,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
};

// Helper functions
import {
  clamp,
  readJson,
  readNumber,
  createUiId,
  makePersistedWriter,
  makePersistedNumberWriter,
} from '../shared';
import { STORAGE_HYDRATION_DELAY_MS } from '../constants';

function deriveTerminalTitle(profile: TerminalProfile, count: number): string {
  const label = profile === 'powershell' ? 'PowerShell' : profile === 'bash' ? 'Bash' : 'CMD';
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
    settings: false,
    communicate: false,
  };
}

// Persisted writers — coalesce multiple localStorage writes via shared 50ms scheduler
const writeTerminalTabs = makePersistedWriter(TERMINAL_TABS_KEY);
const writeTerminalActiveTab = makePersistedWriter(TERMINAL_ACTIVE_TAB_KEY);
const writeDefaultProfile = makePersistedWriter(TERMINAL_DEFAULT_PROFILE_KEY);
const writeWorkspaceDefaultProfiles = makePersistedWriter(TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY);
const writeNavigatorCollapsed = makePersistedWriter(TERMINAL_NAVIGATOR_COLLAPSED_KEY);
const writeWorkspaceExpanded = makePersistedWriter(TERMINAL_WORKSPACE_EXPANDED_KEY);
const writeNavigatorWidth = makePersistedNumberWriter(TERMINAL_NAVIGATOR_WIDTH_KEY);
const writeCommandHistory = makePersistedWriter(TERMINAL_COMMAND_HISTORY_KEY);

// Lazy localStorage hydration — reads persisted values in idle time
let _defaultsHydrated = false;

function hydrateTerminalDefaults(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
): void {
  if (_defaultsHydrated) {
    return;
  }
  _defaultsHydrated = true;
  const doHydrate = () => {
    const profile = readJson<TerminalProfile>(TERMINAL_DEFAULT_PROFILE_KEY, 'powershell');
    const workspaceProfiles = readJson<Record<string, TerminalProfile>>(
      TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
      {},
    );
    const width = readNumber(
      TERMINAL_NAVIGATOR_WIDTH_KEY,
      DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
      TERMINAL_NAVIGATOR_WIDTH_MIN,
      TERMINAL_NAVIGATOR_WIDTH_MAX,
    );
    const collapsed = {
      ...defaultNavigatorCollapsed(),
      ...readJson<Record<ToolId, boolean>>(
        TERMINAL_NAVIGATOR_COLLAPSED_KEY,
        defaultNavigatorCollapsed(),
      ),
    };
    const workspaceExpanded = readJson<Record<string, boolean>>(
      TERMINAL_WORKSPACE_EXPANDED_KEY,
      {},
    );
    const commandHistory = readJson<CommandHistoryEntry[]>(TERMINAL_COMMAND_HISTORY_KEY, []);
    set({
      defaultTerminalProfile: profile,
      workspaceDefaultProfiles: workspaceProfiles,
      terminalNavigatorWidth: width,
      navigatorCollapsedByTool: collapsed,
      terminalWorkspaceExpanded: workspaceExpanded,
      commandHistory,
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
  }
}

const initialTerminalTabs: TerminalTabState[] = [];
const initialCommandHistory: CommandHistoryEntry[] = [];

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
  commandHistory: CommandHistoryEntry[];

  terminalCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, 'id'>>) => void;
  terminalUpdateTab: (tabId: string, patch: Partial<Omit<TerminalTabState, 'id'>>) => void;
  terminalTogglePin: (tabId: string) => void;
  terminalReorderTabs: (newOrder: TerminalTabState[]) => void;
  terminalCloseAllTabs: (workspaceId?: string) => void;
  addCommandHistory: (command: string) => void;
  clearCommandHistory: () => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setWorkspaceDefaultTerminalProfile: (workspaceId: string, profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  toggleTerminalNavigator: () => void;
  setTerminalNavigatorCollapsed: (collapsed: boolean) => void;
  setTerminalWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setTerminalPersisted: (persisted: boolean) => void;
  setTerminalWorkspaceId: (workspaceId: string) => void;
  shellSelectorProfile: TerminalProfile;
  setShellSelectorProfile: (profile: TerminalProfile) => void;
}

export const createTerminalSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): TerminalSlice => {
  hydrateTerminalDefaults(get, set);
  return {
    terminalTabs: initialTerminalTabs,
    terminalTabsById: {},
    terminalActiveTabId: '',
    defaultTerminalProfile: 'powershell',
    workspaceDefaultProfiles: {},
    terminalNavigatorWidth: DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    navigatorCollapsedByTool: defaultNavigatorCollapsed(),
    terminalWorkspaceExpanded: {},
    terminalPersisted: false,
    terminalWorkspaceId: '',
    commandHistory: initialCommandHistory,
    shellSelectorProfile: 'powershell',

    terminalCreateTab: (profile: TerminalProfile | undefined, workspaceId = '') =>
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
        const existingCount =
          state.terminalTabs.filter((tab) => tab.profile === finalProfile).length + 1;
        const maxSortOrder =
          state.terminalTabs.length > 0
            ? Math.max(...state.terminalTabs.map((t) => t.sortOrder))
            : 0;
        const tab: TerminalTabState = {
          id: createUiId('terminal'),
          workspaceId,
          title: deriveTerminalTitle(finalProfile, existingCount),
          profile: finalProfile,
          status: 'idle',
          isPinned: false,
          sortOrder: maxSortOrder + 1,
        };
        const nextTabs = sortTabs([...state.terminalTabs, tab]);
        writeTerminalTabs(nextTabs);
        writeTerminalActiveTab(tab.id);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: tab.id,
        };
      }),

    terminalSelectTab: (tabId) => {
      writeTerminalActiveTab(tabId);
      set({ terminalActiveTabId: tabId });
    },

    terminalCloseTab: (tabId) =>
      set((state) => {
        const filtered = state.terminalTabs.filter((tab) => tab.id !== tabId);
        const nextTabs = sortTabs(filtered);
        const nextActive =
          state.terminalActiveTabId === tabId
            ? (nextTabs[nextTabs.length - 1]?.id ?? '')
            : state.terminalActiveTabId;
        writeTerminalTabs(nextTabs);
        writeTerminalActiveTab(nextActive);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: nextActive,
        };
      }),

    terminalUpdateActiveTab: (patch) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) =>
            tab.id === state.terminalActiveTabId ? { ...tab, ...patch } : tab,
          ),
        );
        writeTerminalTabs(nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalUpdateTab: (tabId, patch) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
        );
        writeTerminalTabs(nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalTogglePin: (tabId) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) => {
            if (tab.id === tabId) {
              return {
                ...tab,
                isPinned: !tab.isPinned,
                pinnedAt: !tab.isPinned ? Date.now() : undefined,
              };
            }
            return tab;
          }),
        );
        writeTerminalTabs(nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalReorderTabs: (newOrder) =>
      set((state) => {
        if (state.terminalTabs === newOrder) {
          return state;
        }

        const pinnedTabs = newOrder.filter((t) => t.isPinned);
        const unpinnedTabs = newOrder.filter((t) => !t.isPinned);

        const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
          ...tab,
          sortOrder: index,
        }));

        writeTerminalTabs(reorderedWithSort);
        return {
          terminalTabs: reorderedWithSort,
          terminalTabsById: buildTabsById(reorderedWithSort),
        };
      }),

    terminalCloseAllTabs: (workspaceId?: string) =>
      set((state) => {
        const filtered =
          workspaceId !== undefined
            ? state.terminalTabs.filter((tab) => tab.workspaceId !== workspaceId)
            : [];
        const nextTabs = sortTabs(filtered);
        const nextActive =
          nextTabs.find((tab) => tab.id === state.terminalActiveTabId) !== undefined
            ? state.terminalActiveTabId
            : (nextTabs[nextTabs.length - 1]?.id ?? '');
        writeTerminalTabs(nextTabs);
        writeTerminalActiveTab(nextActive);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: nextActive,
        };
      }),

    addCommandHistory: (command: string) =>
      set((state) => {
        const entry: CommandHistoryEntry = {
          id: createUiId('cmd'),
          command,
          timestamp: Date.now(),
        };
        const nextHistory = [entry, ...state.commandHistory].slice(0, 200);
        writeCommandHistory(nextHistory);
        return { commandHistory: nextHistory };
      }),

    clearCommandHistory: () => {
      writeCommandHistory([]);
      set({ commandHistory: [] });
    },

    setDefaultTerminalProfile: (profile) => {
      try {
        window.localStorage.setItem(TERMINAL_DEFAULT_PROFILE_KEY, JSON.stringify(profile));
      } catch (err) {
        console.warn('terminalSlice: localStorage operation failed:', err);
      }
      writeDefaultProfile(profile);
      set({ defaultTerminalProfile: profile });
    },

    setWorkspaceDefaultTerminalProfile: (workspaceId, profile) => {
      set((state) => {
        const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
        try {
          window.localStorage.setItem(
            TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY,
            JSON.stringify(nextWorkspaceProfiles),
          );
        } catch (err) {
          console.warn('terminalSlice: localStorage operation failed:', err);
        }
        writeWorkspaceDefaultProfiles(nextWorkspaceProfiles);
        return { workspaceDefaultProfiles: nextWorkspaceProfiles };
      });
    },

    setTerminalNavigatorWidth: (width) => {
      const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
      writeNavigatorWidth(next);
      set({ terminalNavigatorWidth: next });
    },

    toggleTerminalNavigator: () =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          terminal: !(state.navigatorCollapsedByTool.terminal ?? false),
        };
        writeNavigatorCollapsed(next);
        return { navigatorCollapsedByTool: next };
      }),

    setTerminalNavigatorCollapsed: (collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, terminal: collapsed };
        writeNavigatorCollapsed(next);
        return { navigatorCollapsedByTool: next };
      }),

    setTerminalWorkspaceExpanded: (expanded) => {
      writeWorkspaceExpanded(expanded);
      set({ terminalWorkspaceExpanded: expanded });
    },

    setTerminalPersisted: (persisted) => set({ terminalPersisted: persisted }),

    setTerminalWorkspaceId: (workspaceId) => set({ terminalWorkspaceId: workspaceId }),

    setShellSelectorProfile: (profile) => set({ shellSelectorProfile: profile }),
  };
};
