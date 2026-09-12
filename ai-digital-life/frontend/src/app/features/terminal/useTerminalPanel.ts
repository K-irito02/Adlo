import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useTerminalDragDrop } from './useTerminalDragDrop';
import { useTerminalTabActions } from './useTerminalTabActions';
import { useTerminalShellManagement } from './useTerminalShellManagement';
import { useTerminalViewport } from './useTerminalViewport';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';

export type TerminalNavigatorMode = 'sessions' | 'history';

export type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };

export interface WorkspaceMenuItem {
  id: string;
  label: string;
  workspaceId: string;
}

export type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void }
  | {
      id: string;
      label: string;
      hasSubMenu: true;
      subMenu: WorkspaceMenuItem[];
      action?: () => void;
    };

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseTerminalPanelReturn {
  terminalState: {
    xtermRef: React.RefObject<XtermTerminalHandle | null>;
    editInputRef: React.RefObject<HTMLInputElement | null>;
    shellMenuRef: React.RefObject<HTMLDivElement | null>;
    terminalMenuRef: React.RefObject<HTMLDivElement | null>;
    navigatorMode: TerminalNavigatorMode;
    shellMenuOpen: boolean;
    terminalMenuOpen: boolean;
    contextMenu: ContextMenuState;
    editingTabId: string | null;
    editValue: string;
    isDragging: boolean;
    dragOverTabId: string | null;
    terminalTabs: ReturnType<typeof terminalSelectors.useTerminalTabs>;
    terminalActiveTabId: string;
    terminalNavigatorWidth: number;
    navigatorCollapsed: boolean;
    activeTab?: ReturnType<typeof terminalSelectors.useActiveTerminalTab>;
    hasActiveTab: boolean;
    currentProfile: TerminalProfile;
    currentProfileLabel: string;
    navigatorTitle: string;
    navigatorCount: number;
    commandHistory: { id: string; command: string; timestamp: number }[];
    shellMenuItems: TerminalShellMenuItem[];
    shellTypeItems: (TerminalShellMenuItem & { label: string; profile: TerminalProfile })[];
    terminalMenuItems: TerminalMenuItem[];
  };
  terminalActions: {
    handleCreateTab: (profile?: TerminalProfile, workspaceId?: string) => Promise<void>;
    handleSelectTab: (tabId: string) => void;
    handleCloseTab: (tabId: string) => void;
    handleCloseAllTabs: (workspaceId?: string) => void;
    handleClearCommandHistory: () => void;
    handleTogglePin: () => void;
    handleDoubleClick: (tabId: string, title: string) => void;
    handleEditSubmit: () => void;
    handleEditKeyDown: (e: React.KeyboardEvent) => void;
    handleCopy: () => void;
    handlePaste: () => void;
    handleClear: () => void;
    handleKill: () => void;
    updateProfile: (profile: TerminalProfile) => void;
    toggleNavigator: (tool: string) => void;
    handleNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    handleXtermData: (data: string) => void;
    handleXtermResize: (cols: number, rows: number) => void;
    setNavigatorMode: (mode: TerminalNavigatorMode) => void;
    setShellMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setTerminalMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setEditValue: React.Dispatch<React.SetStateAction<string>>;
  };
  dragHandlers: {
    handleDragStart: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
    handleDragEnd: () => void;
    handleDragOver: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
    handleDrop: (e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => void;
  };
  menuHandlers: {
    handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  };
}

export function useTerminalPanel(): UseTerminalPanelReturn {
  const terminalTabs = terminalSelectors.useTerminalTabs();
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();

  const { terminalReorderTabs } = useAppStore(
    useShallow((state) => ({
      terminalReorderTabs: state.terminalReorderTabs,
    })),
  );

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs],
  );

  const hasActiveTab = activeTab != null;

  const { isDragging, dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useTerminalDragDrop(terminalTabs, terminalReorderTabs);

  const {
    xtermRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
    editingTabId,
    editValue,
    editInputRef,
    setEditValue,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
  } = useTerminalTabActions({ activeTab });

  const {
    currentProfile,
    currentProfileLabel,
    terminalMenuOpen,
    setTerminalMenuOpen,
    shellMenuOpen,
    setShellMenuOpen,
    terminalMenuRef,
    shellMenuRef,
    terminalMenuItems,
    shellMenuItems,
    shellTypeItems,
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleCopy,
    handlePaste,
    handleClear,
    updateProfile,
  } = useTerminalShellManagement({
    xtermRef,
    activeTab,
    handleCloseTab,
    handleDoubleClick,
    handleKill,
  });

  const {
    navigatorMode,
    setNavigatorMode,
    navigatorCollapsed,
    terminalNavigatorWidth,
    navigatorTitle,
    navigatorCount,
    commandHistory,
    toggleNavigator,
    handleNavigatorResizeStart,
  } = useTerminalViewport({ terminalTabs });

  const { clearCommandHistory } = useAppStore(
    useShallow((state) => ({
      clearCommandHistory: state.clearCommandHistory,
    })),
  );

  const handleClearCommandHistory = useCallback(() => {
    clearCommandHistory();
  }, [clearCommandHistory]);

  return {
    terminalState: {
      xtermRef,
      editInputRef,
      shellMenuRef,
      terminalMenuRef,
      navigatorMode,
      shellMenuOpen,
      terminalMenuOpen,
      contextMenu,
      editingTabId,
      editValue,
      isDragging,
      dragOverTabId,
      terminalTabs,
      terminalActiveTabId,
      terminalNavigatorWidth,
      navigatorCollapsed,
      activeTab,
      hasActiveTab,
      currentProfile,
      currentProfileLabel,
      navigatorTitle,
      navigatorCount,
      commandHistory,
      shellMenuItems,
      shellTypeItems,
      terminalMenuItems,
    },
    terminalActions: {
      handleCreateTab,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
      handleClearCommandHistory,
      handleTogglePin,
      handleDoubleClick,
      handleEditSubmit,
      handleEditKeyDown,
      handleCopy,
      handlePaste,
      handleClear,
      handleKill,
      updateProfile,
      toggleNavigator,
      handleNavigatorResizeStart,
      handleXtermData,
      handleXtermResize,
      setNavigatorMode,
      setShellMenuOpen,
      setTerminalMenuOpen,
      setEditValue,
    },
    dragHandlers: {
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDrop,
    },
    menuHandlers: {
      handleContextMenu,
    },
  };
}
