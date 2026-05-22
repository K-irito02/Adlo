import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../stores/slicedStore";
import { terminalSelectors } from "../../stores/selectors";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import type { RightPanelViewProps } from "../../regions/right-panel/types";
import type { TerminalProfile } from "../../ui-store";
import type { XtermTerminalHandle } from "../../components/terminal/XtermTerminal";

export type TerminalNavigatorMode = "sessions" | "history";

export type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };

export type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void };

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseTerminalPanelReturn {
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
  handleCreateTab: (profile?: TerminalProfile) => Promise<void>;
  handleSelectTab: (tabId: string) => void;
  handleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: () => void;
  handleDragStart: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  handleDragEnd: () => void;
  handleDragOver: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  handleDrop: (e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => void;
  handleTogglePin: () => void;
  handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
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
}

export function useTerminalPanel(props: RightPanelViewProps): UseTerminalPanelReturn {
  const { t } = props;
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>("sessions");
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    tabId: null,
    isPinned: false
  });
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalTabs = terminalSelectors.useTerminalTabs();
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();
  const defaultTerminalProfile = terminalSelectors.useDefaultTerminalProfile();
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();

  const terminalCreateTab = useAppStore((state) => state.terminalCreateTab);
  const terminalSelectTab = useAppStore((state) => state.terminalSelectTab);
  const terminalCloseTab = useAppStore((state) => state.terminalCloseTab);
  const terminalUpdateActiveTab = useAppStore((state) => state.terminalUpdateActiveTab);
  const terminalUpdateTab = useAppStore((state) => state.terminalUpdateTab);
  const terminalTogglePin = useAppStore((state) => state.terminalTogglePin);
  const terminalReorderTabs = useAppStore((state) => state.terminalReorderTabs);
  const setDefaultTerminalProfile = useAppStore((state) => state.setDefaultTerminalProfile);
  const setTerminalNavigatorWidth = useAppStore((state) => state.setTerminalNavigatorWidth);
  const toggleTerminalNavigator = useAppStore((state) => state.toggleTerminalNavigator);
  const terminalCloseAllTabs = useAppStore((state) => state.terminalCloseAllTabs);
  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);

  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs]
  );

  const hasActiveTab = activeTab != null;

  const recentCommands = useMemo(
    () => {
      if (props.commandHistory.length > 0) {
        return props.commandHistory.map((entry, index) => ({
          id: `history-${index}`,
          label: entry,
          title: entry.split(" ")[0] || t.terminalCommandHistory
        }));
      }
      return terminalTabs
        .map((tab) => ({
          id: tab.id,
          label: tab.title,
          title: tab.title
        }))
        .filter((entry) => entry.label);
    },
    [props.commandHistory, t.terminalCommandHistory, terminalTabs]
  );

  const handleCreateTab = useCallback(async (profile: TerminalProfile = "powershell") => {
    const shellMap: Record<TerminalProfile, string> = {
      powershell: "powershell",
      bash: "bash",
      cmd: "cmd"
    };
    xtermRef.current?.clear();
    terminalCreateTab(profile);
    const cols = 80;
    const rows = 24;
    const cwd = props.appInfo?.currentWorkspace?.rootPath ?? undefined;
    const result = await window.digitalLife.pty.create({
      shell: shellMap[profile],
      cwd,
      cols,
      rows
    });
    if (result.ok) {
      terminalUpdateActiveTab({ sessionId: result.data.sessionId, status: "running" });
      setTimeout(() => {
        const stored = sessionOutputsRef.current.get(result.data.sessionId) ?? "";
        if (stored) {
          xtermRef.current?.write(stored);
        }
        xtermRef.current?.resize();
        xtermRef.current?.focus();
      }, 50);
    } else {
      terminalUpdateActiveTab({ status: "terminated" });
    }
  }, [terminalCreateTab, terminalUpdateActiveTab, props.appInfo?.currentWorkspace?.rootPath]);

  useEffect(() => {
    if (!terminalMenuOpen && !shellMenuOpen && !contextMenu.open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!terminalMenuRef.current?.contains(target)) {
        setTerminalMenuOpen(false);
      }
      if (!shellMenuRef.current?.contains(target)) {
        setShellMenuOpen(false);
      }
      if (contextMenu.open) {
        setContextMenu(prev => ({ ...prev, open: false }));
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shellMenuOpen, terminalMenuOpen, contextMenu.open]);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const toggleNavigator = useCallback((tool: string) => {
    if (tool === "terminal") {
      toggleTerminalNavigator();
    }
  }, [toggleTerminalNavigator]);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setTerminalNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

  const navigatorTitle = navigatorMode === "sessions" ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === "sessions" ? terminalTabs.length : recentCommands.length;

  const updateProfile = useCallback((profile: TerminalProfile) => {
    setDefaultTerminalProfile(profile);
  }, [setDefaultTerminalProfile]);

  const currentProfile = defaultTerminalProfile;
  const currentProfileLabel = currentProfile === "powershell" ? "PowerShell" : currentProfile === "bash" ? "Bash" : "CMD";

  const handleCopy = useCallback(() => {
    const selection = xtermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {});
    }
  }, []);

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.input(activeTab.sessionId, text);
      }
    }).catch(() => {});
  }, [activeTab?.sessionId]);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const handleKill = useCallback(() => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.kill(activeTab.sessionId);
      terminalUpdateActiveTab({ status: "terminated" });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      window.digitalLife.pty.kill(tab.sessionId);
      sessionOutputsRef.current.delete(tab.sessionId);
    }
    terminalCloseTab(tabId);
  }, [terminalCloseTab]);

  const handleCloseAllTabs = useCallback(() => {
    terminalTabs.forEach((tab) => {
      if (tab.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
      }
    });
    terminalCloseAllTabs();
  }, [terminalTabs, terminalCloseAllTabs]);

  const handleSelectTab = useCallback((tabId: string) => {
    terminalSelectTab(tabId);
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const sessionId = tab.sessionId;
      xtermRef.current?.clear();
      setTimeout(() => {
        const stored = sessionOutputsRef.current.get(sessionId) ?? "";
        if (stored) {
          xtermRef.current?.write(stored);
        }
        xtermRef.current?.resize();
        xtermRef.current?.scrollToBottom();
        xtermRef.current?.focus();
      }, 50);
    }
  }, [terminalSelectTab]);

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      terminalUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue("");
  }, [editingTabId, editValue, terminalUpdateTab]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingTabId(null);
      setEditValue("");
    }
  }, [handleEditSubmit]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
      isPinned
    });
  }, []);

  const handleTogglePin = useCallback(() => {
    if (contextMenu.tabId) {
      terminalTogglePin(contextMenu.tabId);
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTogglePin]);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = terminalTabs.find(t => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTabs, handleDoubleClick]);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
    setContextMenu(prev => ({ ...prev, open: false }));
  }, [contextMenu.tabId, handleCloseTab]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.dataTransfer.setData("text/plain", tabId);
    e.dataTransfer.setData("application/x-terminal-tab-isPinned", String(isPinned));
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverTabId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    const draggedIsPinned = e.dataTransfer.getData("application/x-terminal-tab-isPinned") === "true";
    if (draggedIsPinned === isPinned) {
      setDragOverTabId(tabId);
      e.dataTransfer.dropEffect = "move";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => {
    e.preventDefault();
    const draggedTabId = e.dataTransfer.getData("text/plain");
    const draggedIsPinned = e.dataTransfer.getData("application/x-terminal-tab-isPinned") === "true";
    if (!draggedTabId || draggedIsPinned !== targetIsPinned || draggedTabId === targetTabId) {
      setDragOverTabId(null);
      return;
    }
    const currentTabs = [...terminalTabs];
    const draggedIndex = currentTabs.findIndex(t => t.id === draggedTabId);
    const targetIndex = currentTabs.findIndex(t => t.id === targetTabId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDragOverTabId(null);
      return;
    }
    const [removed] = currentTabs.splice(draggedIndex, 1);
    currentTabs.splice(targetIndex, 0, removed);
    terminalReorderTabs(currentTabs);
    setDragOverTabId(null);
  }, [terminalTabs, terminalReorderTabs]);

  const terminalMenuItems: TerminalMenuItem[] = [
    { id: "copy", label: t.terminalCopy, action: handleCopy },
    { id: "paste", label: t.terminalPaste, action: handlePaste },
    { id: "clear", label: t.terminalClear, action: handleClear },
    { id: "sep-1", separator: true },
    { id: "kill", label: t.terminalKillProcess, action: handleKill }
  ];

  const shellMenuItems: TerminalShellMenuItem[] = [
    { id: "new-terminal", label: t.menuNewTerminal, action: () => handleCreateTab(currentProfile) },
    { id: "sep-1", separator: true },
    { id: "powershell", label: "PowerShell", profile: "powershell", action: () => updateProfile("powershell") },
    { id: "bash", label: "Bash", profile: "bash", action: () => updateProfile("bash") },
    { id: "cmd", label: "CMD", profile: "cmd", action: () => updateProfile("cmd") }
  ];

  const shellTypeItems = useMemo(
    () => shellMenuItems.filter((item) => "profile" in item) as Array<
      TerminalShellMenuItem & { label: string; profile: TerminalProfile }
    >,
    [shellMenuItems]
  );

  const handleXtermData = useCallback((data: string) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.input(activeTab.sessionId, data);
    }
  }, [activeTab?.sessionId]);

  const handleXtermResize = useCallback((cols: number, rows: number) => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.resize(activeTab.sessionId, cols, rows);
    }
  }, [activeTab?.sessionId]);

  useEffect(() => {
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      const outputs = sessionOutputsRef.current;
      const previous = outputs.get(event.sessionId) ?? "";
      outputs.set(event.sessionId, previous + event.data);
      if (event.sessionId === activeTab?.sessionId) {
        xtermRef.current?.write(event.data);
      }
    });
    return () => unsub();
  }, [activeTab?.sessionId]);

  return {
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
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleTogglePin,
    handleContextMenu,
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
  };
}
