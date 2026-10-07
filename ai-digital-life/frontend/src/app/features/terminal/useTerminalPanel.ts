import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { isPanelTab } from '@stores/slices/tabLocation';
import { activePaneOf, type TerminalPane } from '@stores/slices/terminalSliceTypes';
import { useTerminalDragDrop } from './useTerminalDragDrop';
import { useTerminalTabActions } from './useTerminalTabActions';
import { useTerminalShellManagement } from './useTerminalShellManagement';
import { useTerminalViewport } from './useTerminalViewport';
import type { TerminalProfile } from '@stores/types';

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
    editInputRef: React.RefObject<HTMLInputElement | null>;
    shellMenuRef: React.RefObject<HTMLDivElement | null>;
    terminalMenuRef: React.RefObject<HTMLDivElement | null>;
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
    panes: TerminalPane[];
    activePane?: TerminalPane;
    currentProfile: TerminalProfile;
    currentProfileLabel: string;
    shellMenuItems: TerminalShellMenuItem[];
    shellTypeItems: (TerminalShellMenuItem & { label: string; profile: TerminalProfile })[];
    terminalMenuItems: TerminalMenuItem[];
  };
  terminalActions: {
    handleCreateTab: (profile?: TerminalProfile, workspaceId?: string) => Promise<void>;
    handleSelectTab: (tabId: string) => void;
    handleCloseTab: (tabId: string) => void;
    handleCloseAllTabs: (workspaceId?: string) => void;
    handleAddPane: () => void;
    handleClosePane: (paneId: string) => void;
    handleSelectPane: (paneId: string) => void;
    handleTogglePin: () => void;
    handleDoubleClick: (tabId: string, title: string) => void;
    handleEditSubmit: () => void;
    handleEditKeyDown: (e: React.KeyboardEvent) => void;
    updateProfile: (profile: TerminalProfile) => void;
    toggleNavigator: (tool: string) => void;
    handleNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    handleXtermData: (paneId: string, data: string) => void;
    handleXtermResize: (paneId: string, cols: number, rows: number) => void;
    setShellMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setTerminalMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setEditValue: React.Dispatch<React.SetStateAction<string>>;
    /** 右键菜单「重命名」：进入内联编辑并关闭菜单 */
    handleRenameFromMenu: () => void;
    /** 右键菜单「删除」：走完整关闭清理（杀 PTY/释放池）并关闭菜单 */
    handleDeleteFromMenu: () => void;
    /** 右键菜单「在中间部分显示」：把目标终端标签移动到中心区并关闭菜单 */
    handleOpenInCenterFromMenu: () => void;
    /** 关闭右键菜单（菜单组件在外部点击 / Esc 时调用） */
    closeContextMenu: () => void;
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
  // 面板只拥有 location !== 'center' 的终端标签：转入中心的终端不得在面板列表/计数中
  // 重复显示，也不得由面板再次挂载同一 session（排他归属，spec 目标 #5）。
  const allTerminalTabs = terminalSelectors.useTerminalTabs();
  const terminalTabs = useMemo(() => allTerminalTabs.filter(isPanelTab), [allTerminalTabs]);
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();

  const { terminalReorderTabs, terminalSetActivePane } = useAppStore(
    useShallow((state) => ({
      terminalReorderTabs: state.terminalReorderTabs,
      terminalSetActivePane: state.terminalSetActivePane,
    })),
  );

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs],
  );

  const hasActiveTab = activeTab != null;

  const panes = useMemo(() => activeTab?.panes ?? [], [activeTab]);
  const activePane = useMemo(() => (activeTab ? activePaneOf(activeTab) : undefined), [activeTab]);

  const { isDragging, dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useTerminalDragDrop(terminalTabs, terminalReorderTabs);

  const {
    handleXtermData,
    handleXtermResize,
    handleKillPane,
    handleCreatePane,
    handleClosePane: closePane,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    editingTabId,
    editValue,
    editInputRef,
    setEditValue,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
  } = useTerminalTabActions({ activeTab });

  const handleAddPane = useCallback(() => {
    if (activeTab) {
      void handleCreatePane(activeTab.id);
    }
  }, [activeTab, handleCreatePane]);

  const handleClosePane = useCallback(
    (paneId: string) => {
      if (activeTab) {
        closePane(activeTab.id, paneId);
      }
    },
    [activeTab, closePane],
  );

  const handleSelectPane = useCallback(
    (paneId: string) => {
      if (activeTab) {
        terminalSetActivePane(activeTab.id, paneId);
      }
    },
    [activeTab, terminalSetActivePane],
  );

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
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
    updateProfile,
  } = useTerminalShellManagement({
    activePane,
    handleCloseTab,
    handleDoubleClick,
    handleKillPane,
  });

  const {
    navigatorCollapsed,
    terminalNavigatorWidth,
    toggleNavigator,
    handleNavigatorResizeStart,
  } = useTerminalViewport({ terminalTabs });

  return {
    terminalState: {
      editInputRef,
      shellMenuRef,
      terminalMenuRef,
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
      panes,
      activePane,
      currentProfile,
      currentProfileLabel,
      shellMenuItems,
      shellTypeItems,
      terminalMenuItems,
    },
    terminalActions: {
      handleCreateTab,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
      handleAddPane,
      handleClosePane,
      handleSelectPane,
      handleTogglePin,
      handleDoubleClick,
      handleEditSubmit,
      handleEditKeyDown,
      updateProfile,
      toggleNavigator,
      handleNavigatorResizeStart,
      handleXtermData,
      handleXtermResize,
      setShellMenuOpen,
      setTerminalMenuOpen,
      setEditValue,
      handleRenameFromMenu,
      handleDeleteFromMenu,
      handleOpenInCenterFromMenu,
      closeContextMenu,
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
