import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { terminalSelectors } from '../../stores/selectors';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { useTerminalPtyLifecycle } from './useTerminalPtyLifecycle';
import { useTerminalDragDrop } from './useTerminalDragDrop';
import { useTerminalMenus } from './useTerminalMenus';
import type { TerminalPanelProps } from '../../regions/right-panel/types';
import type { TerminalProfile } from '../../stores/types';
import type { XtermTerminalHandle } from '../../components/terminal/XtermTerminal';

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
    sessionOutputsRef: React.RefObject<Map<string, string>>;
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
    defaultTerminalProfile: TerminalProfile;
    terminalNavigatorWidth: number;
    navigatorCollapsed: boolean;
    activeTab?: ReturnType<typeof terminalSelectors.useActiveTerminalTab>;
    hasActiveTab: boolean;
    currentProfile: TerminalProfile;
    currentProfileLabel: string;
    navigatorTitle: string;
    navigatorCount: number;
    recentCommands: Array<{ id: string; label: string; title: string }>;
    shellMenuItems: TerminalShellMenuItem[];
    shellTypeItems: Array<TerminalShellMenuItem & { label: string; profile: TerminalProfile }>;
    terminalMenuItems: TerminalMenuItem[];
  };
  terminalActions: {
    handleCreateTab: (profile?: TerminalProfile, workspaceId?: string) => Promise<void>;
    handleSelectTab: (tabId: string) => void;
    handleCloseTab: (tabId: string) => void;
    handleCloseAllTabs: () => void;
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

export function useTerminalPanel(props: TerminalPanelProps): UseTerminalPanelReturn {
  const { t } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>('sessions');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalTabs = terminalSelectors.useTerminalTabs();
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();
  const defaultTerminalProfile = terminalSelectors.useDefaultTerminalProfile();
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();

  const terminalUpdateTab = useAppStore((state) => state.terminalUpdateTab);
  const terminalReorderTabs = useAppStore((state) => state.terminalReorderTabs);
  const setTerminalNavigatorWidth = useAppStore((state) => state.setTerminalNavigatorWidth);
  const toggleTerminalNavigator = useAppStore((state) => state.toggleTerminalNavigator);

  const editInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs]
  );

  const hasActiveTab = activeTab !== null;

  const recentCommands = useMemo(() => {
    if (props.commandHistory.length > 0) {
      return props.commandHistory.map((entry, index) => ({
        id: `history-${index}`,
        label: entry,
        title: entry.split(' ')[0] || t.terminalCommandHistory,
      }));
    }
    return terminalTabs
      .map((tab) => ({
        id: tab.id,
        label: tab.title,
        title: tab.title,
      }))
      .filter((entry) => entry.label);
  }, [props.commandHistory, t.terminalCommandHistory, terminalTabs]);

  const rootPath = props.appInfo?.currentWorkspace?.rootPath;

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const {
    xtermRef,
    sessionOutputsRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  } = useTerminalPtyLifecycle({ activeTab, rootPath });

  const { isDragging, dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useTerminalDragDrop(terminalTabs, terminalReorderTabs);

  const {
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
  } = useTerminalMenus({
    t,
    xtermRef,
    activeTab,
    handleCloseTab,
    handleDoubleClick,
    handleKill,
  });

  const toggleNavigator = useCallback(
    (tool: string) => {
      if (tool === 'terminal') {
        toggleTerminalNavigator();
      }
    },
    [toggleTerminalNavigator]
  );

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setTerminalNavigatorWidth,
    minWidth: 180,
    maxWidth: 300,
  });

  const navigatorTitle =
    navigatorMode === 'sessions' ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === 'sessions' ? terminalTabs.length : recentCommands.length;

  const currentProfile = defaultTerminalProfile;
  const currentProfileLabel =
    currentProfile === 'powershell' ? 'PowerShell' : currentProfile === 'bash' ? 'Bash' : 'CMD';

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      terminalUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, terminalUpdateTab]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleEditSubmit]
  );

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  return {
    terminalState: {
      xtermRef,
      sessionOutputsRef,
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
      defaultTerminalProfile,
      terminalNavigatorWidth,
      navigatorCollapsed,
      activeTab,
      hasActiveTab,
      currentProfile,
      currentProfileLabel,
      navigatorTitle,
      navigatorCount,
      recentCommands,
      shellMenuItems,
      shellTypeItems,
      terminalMenuItems,
    },
    terminalActions: {
      handleCreateTab,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
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
