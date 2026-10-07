/**
 * 终端切片
 * 管理终端标签页、会话等状态
 */
import type { StoreState } from '../StoreState';
import type { TerminalProfile } from '../types';
import type { TerminalPane, TerminalTabState } from './terminalSliceTypes';
import { persistField } from '../persisted/apply';
import { applyTabPrune } from '../persisted/pruneWiring';
import { persist } from '../persisted/persist';
import {
  buildTabsById,
  createTerminalPane,
  nextPaneColorIndex,
  TERMINAL_NAVIGATOR_WIDTH_MIN,
  TERMINAL_NAVIGATOR_WIDTH_MAX,
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
} from './terminalSliceTypes';

export type { TerminalPane, TerminalTabState };
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

/**
 * 对单个标签做「窗格变更」：updater 返回新标签，或返回 undefined 表示无操作。
 * 成功时统一写盘并重建 `terminalTabsById`（所有窗格动作的唯一副作用出口）。
 */
function applyPaneChange(
  state: StoreState,
  tabId: string,
  update: (tab: TerminalTabState) => TerminalTabState | undefined,
): Partial<StoreState> {
  const tab = state.terminalTabsById[tabId];
  if (!tab) {
    return state;
  }
  const nextTab = update(tab);
  if (!nextTab) {
    return state;
  }
  const nextTabs = sortTabs(state.terminalTabs.map((t) => (t.id === tabId ? nextTab : t)));
  persist('adl:terminal.tabs', nextTabs);
  return { terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) };
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
  terminalWorkspaceId: string;

  terminalCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  terminalSelectTab: (tabId: string) => void;
  terminalCloseTab: (tabId: string) => void;
  // patch 不含 location（与浏览器侧 BrowserTabStateUpdate 对齐）：宿主迁移必须走
  // terminalSetLocation，全仓无经 update 路径改 location 的合法使用。
  // 亦不含 panes：窗格集合只能经 terminalAddPane/Remove/Reorder/Swap 变更。
  terminalUpdateActiveTab: (
    patch: Partial<Omit<TerminalTabState, 'id' | 'location' | 'panes'>>,
  ) => void;
  terminalUpdateTab: (
    tabId: string,
    patch: Partial<Omit<TerminalTabState, 'id' | 'location' | 'panes'>>,
  ) => void;
  terminalTogglePin: (tabId: string) => void;
  terminalReorderTabs: (newOrder: TerminalTabState[]) => void;
  terminalCloseAllTabs: (workspaceId?: string) => void;
  terminalSetLocation: (tabId: string, location: 'panel' | 'center') => void;
  // 窗格动作。terminalAddPane 返回新窗格 id（调用方需立即建会话）。
  terminalAddPane: (tabId: string, profile?: TerminalProfile) => string;
  terminalRemovePane: (tabId: string, paneId: string) => void;
  terminalUpdatePane: (
    tabId: string,
    paneId: string,
    patch: Partial<Omit<TerminalPane, 'id'>>,
  ) => void;
  terminalSetActivePane: (tabId: string, paneId: string) => void;
  terminalReorderPanes: (tabId: string, orderedIds: string[]) => void;
  terminalSwapPanes: (tabId: string, a: string, b: string) => void;
  setDefaultTerminalProfile: (profile: TerminalProfile) => void;
  setWorkspaceDefaultTerminalProfile: (workspaceId: string, profile: TerminalProfile) => void;
  setTerminalNavigatorWidth: (width: number) => void;
  setTerminalWorkspaceExpanded: (expanded: Record<string, boolean>) => void;
  setTerminalWorkspaceId: (workspaceId: string) => void;
  shellSelectorProfile: TerminalProfile;
  setShellSelectorProfile: (profile: TerminalProfile) => void;
}

export const createTerminalSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): TerminalSlice => {
  return {
    terminalTabs: initialTerminalTabs,
    terminalTabsById: {},
    terminalActiveTabId: '',
    defaultTerminalProfile: 'powershell',
    workspaceDefaultProfiles: {},
    terminalNavigatorWidth: DEFAULT_TERMINAL_NAVIGATOR_WIDTH,
    terminalWorkspaceExpanded: {},
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
        const pane = createTerminalPane(finalProfile, 0);
        const tab: TerminalTabState = {
          id: createUiId('terminal'),
          workspaceId,
          title: deriveTerminalTitle(finalProfile, existingCount),
          profile: finalProfile,
          panes: [pane],
          activePaneId: pane.id,
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

    terminalAddPane: (tabId, profile) => {
      const state = get();
      const tab = state.terminalTabsById[tabId];
      if (!tab) {
        return '';
      }
      const finalProfile = profile ?? tab.profile;
      const pane = createTerminalPane(finalProfile, nextPaneColorIndex(tab.panes));
      const nextTab: TerminalTabState = {
        ...tab,
        panes: [...tab.panes, pane],
        activePaneId: pane.id,
      };
      const nextTabs = sortTabs(state.terminalTabs.map((t) => (t.id === tabId ? nextTab : t)));
      persist('adl:terminal.tabs', nextTabs);
      set({ terminalTabs: nextTabs, terminalTabsById: buildTabsById(nextTabs) });
      return pane.id;
    },

    terminalRemovePane: (tabId, paneId) =>
      set((state) =>
        applyPaneChange(state, tabId, (tab) => {
          // 最后一个窗格不在此删除：UI 改走「关闭标签」。
          if (tab.panes.length <= 1) {
            return undefined;
          }
          const index = tab.panes.findIndex((pane) => pane.id === paneId);
          if (index === -1) {
            return undefined;
          }
          const panes = tab.panes.filter((pane) => pane.id !== paneId);
          const activePaneId =
            tab.activePaneId === paneId
              ? panes[Math.min(index, panes.length - 1)]?.id
              : tab.activePaneId;
          return { ...tab, panes, activePaneId };
        }),
      ),

    terminalUpdatePane: (tabId, paneId, patch) =>
      set((state) =>
        applyPaneChange(state, tabId, (tab) => {
          if (!tab.panes.some((pane) => pane.id === paneId)) {
            return undefined;
          }
          return {
            ...tab,
            panes: tab.panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)),
          };
        }),
      ),

    terminalSetActivePane: (tabId, paneId) =>
      set((state) =>
        applyPaneChange(state, tabId, (tab) => {
          if (tab.activePaneId === paneId || !tab.panes.some((pane) => pane.id === paneId)) {
            return undefined;
          }
          return { ...tab, activePaneId: paneId };
        }),
      ),

    terminalReorderPanes: (tabId, orderedIds) =>
      set((state) =>
        applyPaneChange(state, tabId, (tab) => {
          const byId = new Map(tab.panes.map((pane) => [pane.id, pane]));
          const reordered: TerminalPane[] = [];
          for (const id of orderedIds) {
            const pane = byId.get(id);
            if (pane !== undefined) {
              reordered.push(pane);
              byId.delete(id);
            }
          }
          // 未出现在 orderedIds 的窗格按原顺序补回，保证不丢窗格。
          for (const pane of tab.panes) {
            if (byId.has(pane.id)) {
              reordered.push(pane);
            }
          }
          return { ...tab, panes: reordered };
        }),
      ),

    terminalSwapPanes: (tabId, a, b) =>
      set((state) =>
        applyPaneChange(state, tabId, (tab) => {
          const indexA = tab.panes.findIndex((pane) => pane.id === a);
          const indexB = tab.panes.findIndex((pane) => pane.id === b);
          if (a === b || indexA === -1 || indexB === -1) {
            return undefined;
          }
          const panes = [...tab.panes];
          const swap = panes[indexA];
          panes[indexA] = panes[indexB];
          panes[indexB] = swap;
          return { ...tab, panes };
        }),
      ),

    terminalSetLocation: (tabId, location) =>
      set((state) => {
        const nextTabs = sortTabs(
          state.terminalTabs.map((tab) => (tab.id === tabId ? { ...tab, location } : tab)),
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
        const filtered = state.terminalTabs.filter((tab) => {
          if (tab.location === 'center') {
            return true; // 中心标签不受面板清空影响
          }
          if (workspaceId !== undefined) {
            return tab.workspaceId !== workspaceId;
          }
          return false; // 全局清空：移除所有面板标签
        });
        const nextTabs = sortTabs(filtered);
        // 与 browserCloseAllTabs 同语义：回退取最后一个**面板**标签；仅剩中心标签
        // 时清空为 ''，不得指向中心标签。
        const panelKept = nextTabs.filter((tab) => tab.location !== 'center');
        const nextActive =
          panelKept.find((tab) => tab.id === state.terminalActiveTabId) !== undefined
            ? state.terminalActiveTabId
            : (panelKept[panelKept.length - 1]?.id ?? '');
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
