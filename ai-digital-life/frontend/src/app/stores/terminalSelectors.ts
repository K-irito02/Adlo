/**
 * 终端相关的选择器
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

export const terminalSelectors = {
  getTerminalTabs: (state: StoreState) => state.terminalTabs,
  useTerminalTabs: () => useAppStore(useShallow((s) => s.terminalTabs)),

  getTerminalActiveTabId: (state: StoreState) => state.terminalActiveTabId,
  useTerminalActiveTabId: () => useAppStore((s) => s.terminalActiveTabId),

  getDefaultTerminalProfile: (state: StoreState) => state.defaultTerminalProfile,
  useDefaultTerminalProfile: () => useAppStore((s) => s.defaultTerminalProfile),

  getWorkspaceDefaultProfiles: (state: StoreState) => state.workspaceDefaultProfiles,
  useWorkspaceDefaultProfiles: () => useAppStore(useShallow((s) => s.workspaceDefaultProfiles)),

  getTerminalNavigatorWidth: (state: StoreState) => state.terminalNavigatorWidth,
  useTerminalNavigatorWidth: () => useAppStore((s) => s.terminalNavigatorWidth),

  getNavigatorCollapsedByTool: (state: StoreState) => state.navigatorCollapsedByTool,
  useNavigatorCollapsedByTool: () => useAppStore(useShallow((s) => s.navigatorCollapsedByTool)),

  getActiveTerminalTab: (state: StoreState) =>
    state.terminalActiveTabId ? state.terminalTabsById[state.terminalActiveTabId] : undefined,
  useActiveTerminalTab: () =>
    useAppStore(
      useShallow((s) =>
        s.terminalActiveTabId ? s.terminalTabsById[s.terminalActiveTabId] : undefined,
      ),
    ),

  hasTerminalTabs: (state: StoreState) => state.terminalTabs.length > 0,
  useHasTerminalTabs: () => useAppStore((s) => s.terminalTabs.length > 0),

  getCommandHistory: (state: StoreState) => state.commandHistory,
  useCommandHistory: () => useAppStore(useShallow((s) => s.commandHistory)),

  getShellSelectorProfile: (state: StoreState) => state.shellSelectorProfile,
  useShellSelectorProfile: () => useAppStore((s) => s.shellSelectorProfile),
};
