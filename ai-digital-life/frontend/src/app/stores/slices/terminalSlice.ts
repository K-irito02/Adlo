/**
 * 终端切片
 * 管理终端标签页、会话等状态
 */
import type { StoreState } from '../StoreState';
import type { TerminalProfile } from '../types';
import type { TerminalTabState } from './terminalSliceTypes';
import { persistField } from '../persisted/apply';
import { applyTabPrune } from '../persisted/pruneWiring';
import { persist } from '../persisted/persist';
import {
  buildTabsById,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
} from './terminalSliceTypes';

export type { TerminalTabState };
export {
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
};

// Helper functions
import { clamp, createUiId } from '../shared';

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

const initialTerminalTabs: TerminalTabState[] = [];

// Type and slice definition
export interface TerminalSlice {
  terminalTabs: TerminalTabState[];
  terminalTabsById: Record<string, TerminalTabState>;
  terminalActiveTabId: string;
  defaultTerminalProfile: TerminalProfile;
  workspaceDefaultProfiles: Record<string, TerminalProfile>;
  terminalNavigatorWidth: number;
  terminalWorkspaceExpanded: Record<string, boolean>;
  terminalPersisted: boolean;
  terminalWorkspaceId: string;

  terminalCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  terminalUpdateActiveTab: (patch: Partial<Omit<TerminalTabState, 'id'>>) => void;
  terminalUpdateTab: (tabId: string, patch: Partial<Omit<TerminalTabState, 'id'>>) => void;
  terminalTogglePin: (tabId: string) => void;
  terminalReorderTabs: (newOrder: TerminalTabState[]) => void;
  terminalCloseAllTabs: (workspaceId?: string) => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setWorkspaceDefaultTerminalProfile: (workspaceId: string, profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  setTerminalWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setTerminalPersisted: (persisted: boolean) => void;
  setTerminalWorkspaceId: (workspaceId: string) => void;
  shellSelectorProfile: TerminalProfile;
  setShellSelectorProfile: (profile: TerminalProfile) => void;
}

export const createTerminalSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): TerminalSlice => {
  return {
    terminalTabs: initialTerminalTabs,
    terminalTabsById: {},
    terminalActiveTabId: '',
    defaultTerminalProfile: 'powershell',
    workspaceDefaultProfiles: {},
    terminalNavigatorWidth: DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    terminalWorkspaceExpanded: {},
    terminalPersisted: false,
    terminalWorkspaceId: '',
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
        persist('adl:terminal.tabs', nextTabs);
        persist('adl:terminal.activeTabId', tab.id);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: tab.id,
        };
      }),

    terminalSelectTab: (tabId) => {
      persist('adl:terminal.activeTabId', tabId);
      set({ terminalActiveTabId: tabId });
    },

    terminalCloseTab: (tabId) => {
      set((state) => {
        const filtered = state.terminalTabs.filter((tab) => tab.id !== tabId);
        const nextTabs = sortTabs(filtered);
        const nextActive =
          state.terminalActiveTabId === tabId
            ? (nextTabs[nextTabs.length - 1]?.id ?? '')
            : state.terminalActiveTabId;
        persist('adl:terminal.tabs', nextTabs);
        persist('adl:terminal.activeTabId', nextActive);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: nextActive,
        };
      });
      // 标签集合变化：剪掉已不存在标签的孤儿条目（甲类 browserTabTreeExpanded
      // 的 tab 部分 + 乙类三个外部微型存储，规格 §3.5.1）。
      applyTabPrune();
    },

    terminalUpdateActiveTab: (patch) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) =>
            tab.id === state.terminalActiveTabId ? { ...tab, ...patch } : tab,
          ),
        );
        persist('adl:terminal.tabs', nextTabs);
        return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
      }),

    terminalUpdateTab: (tabId, patch) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
        );
        persist('adl:terminal.tabs', nextTabs);
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
        persist('adl:terminal.tabs', nextTabs);
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

        persist('adl:terminal.tabs', reorderedWithSort);
        return {
          terminalTabs: reorderedWithSort,
          terminalTabsById: buildTabsById(reorderedWithSort),
        };
      }),

    terminalCloseAllTabs: (workspaceId?: string) => {
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
        persist('adl:terminal.tabs', nextTabs);
        persist('adl:terminal.activeTabId', nextActive);
        return {
          terminalTabs: nextTabs,
          terminalTabsById: buildTabsById(nextTabs),
          terminalActiveTabId: nextActive,
        };
      });
      // 同 terminalCloseTab：批量关闭同样产生孤儿标签条目。
      applyTabPrune();
    },

    setDefaultTerminalProfile: (profile) => {
      persist('adl:terminal.defaultProfile', profile);
      set({ defaultTerminalProfile: profile });
    },

    setWorkspaceDefaultTerminalProfile: (workspaceId, profile) =>
      set((state) => {
        const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
        return persistField('adl:terminal.workspaceDefaultProfiles', nextWorkspaceProfiles);
      }),

    setTerminalNavigatorWidth: (width) => {
      const next = clamp(width, TERMINAL_NAVIGATOR_WIDTH_MIN, TERMINAL_NAVIGATOR_WIDTH_MAX);
      persist('adl:terminal.navigatorWidth', next);
      set({ terminalNavigatorWidth: next });
    },

    setTerminalWorkspaceExpanded: (expanded) => {
      persist('adl:terminal.workspaceExpanded', expanded);
      set({ terminalWorkspaceExpanded: expanded });
    },

    setTerminalPersisted: (persisted) => set({ terminalPersisted: persisted }),

    setTerminalWorkspaceId: (workspaceId) => {
      persist('adl:terminal.workspaceId', workspaceId);
      set({ terminalWorkspaceId: workspaceId });
    },

    setShellSelectorProfile: (profile) => {
      persist('adl:terminal.shellSelectorProfile', profile);
      set({ shellSelectorProfile: profile });
    },
  };
};
