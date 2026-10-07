import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useTerminalContextMenu } from './useTerminalContextMenu';
import type { TerminalProfile } from '@stores/types';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';
import { terminalXtermPool } from './terminalXtermPool';
import type {
  TerminalMenuItem,
  TerminalShellMenuItem,
  WorkspaceMenuItem,
} from './useTerminalPanel';
import { useTCopy } from '@i18n/useTCopy';

interface TerminalMenusParams {
  activePane: TerminalPane | undefined;
  handleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  handleKillPane: (paneId: string) => void;
}

export function useTerminalMenus({
  activePane,
  handleCloseTab,
  handleDoubleClick,
  handleKillPane,
}: TerminalMenusParams) {
  const { t } = useTCopy();
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);

  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);

  const terminalTabs = terminalSelectors.useTerminalTabs();
  const { terminalTogglePin, setShellSelectorProfile, recentWorkspaces } = useAppStore(
    useShallow((state) => ({
      terminalTogglePin: state.terminalTogglePin,
      setShellSelectorProfile: state.setShellSelectorProfile,
      recentWorkspaces: state.recentWorkspaces,
    })),
  );

  const {
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
  } = useTerminalContextMenu(terminalTabs, handleDoubleClick, terminalTogglePin, handleCloseTab);

  const handleCopy = useCallback(() => {
    const selection = activePane?.sessionId
      ? terminalXtermPool.get(activePane.sessionId)?.terminal.getSelection()
      : undefined;
    if (selection) {
      navigator.clipboard.writeText(selection).catch((err) => {
        console.warn('terminal copy failed', err);
      });
    }
  }, [activePane]);

  const handlePaste = useCallback(() => {
    const sessionId = activePane?.sessionId;
    if (!sessionId) {
      return;
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        window.digitalLife.pty.input(sessionId, text);
      })
      .catch((err) => {
        console.warn('terminal paste failed', err);
      });
  }, [activePane]);

  const handleClear = useCallback(() => {
    const entry = activePane?.sessionId ? terminalXtermPool.get(activePane.sessionId) : undefined;
    entry?.terminal.clear();
    setTimeout(() => entry?.terminal.scrollToBottom(), 0);
  }, [activePane]);

  const handleKill = useCallback(() => {
    if (activePane) {
      handleKillPane(activePane.id);
    }
  }, [activePane, handleKillPane]);

  const updateProfile = useCallback(
    (profile: TerminalProfile) => {
      setShellSelectorProfile(profile);
    },
    [setShellSelectorProfile],
  );

  useEffect(() => {
    if (!terminalMenuOpen && !shellMenuOpen) {
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
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [shellMenuOpen, terminalMenuOpen]);

  const terminalMenuItems: TerminalMenuItem[] = [
    { id: 'copy', label: t.terminalCopy, action: handleCopy },
    { id: 'paste', label: t.terminalPaste, action: handlePaste },
    { id: 'clear', label: t.terminalClear, action: handleClear },
    { id: 'sep-1', separator: true },
    { id: 'kill', label: t.terminalKillProcess, action: handleKill },
  ];

  const workspaceMenuItems = useMemo(() => {
    const items: WorkspaceMenuItem[] = [
      { id: 'workspace-independent', label: t.terminalIndependent, workspaceId: '' },
    ];
    const validWorkspaces = recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available);
    for (const ws of validWorkspaces) {
      items.push({
        id: `workspace-${ws.id}`,
        label: ws.name,
        workspaceId: ws.id,
      });
    }
    return items;
  }, [recentWorkspaces, t.terminalIndependent]);

  const shellMenuItems: TerminalShellMenuItem[] = useMemo(
    () => [
      {
        id: 'workspace-section',
        label: t.terminalBindWorkspace,
        hasSubMenu: true,
        subMenu: workspaceMenuItems,
      },
      { id: 'sep-1', separator: true },
      {
        id: 'powershell',
        label: 'PowerShell',
        profile: 'powershell',
        action: () => updateProfile('powershell'),
      },
      { id: 'bash', label: 'Bash', profile: 'bash', action: () => updateProfile('bash') },
      { id: 'cmd', label: 'CMD', profile: 'cmd', action: () => updateProfile('cmd') },
    ],
    [t, workspaceMenuItems, updateProfile],
  );

  const shellTypeItems = useMemo(
    () =>
      shellMenuItems.filter((item) => 'profile' in item) as (TerminalShellMenuItem & {
        label: string;
        profile: TerminalProfile;
      })[],
    [shellMenuItems],
  );

  return {
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
    handleCopy,
    handlePaste,
    handleClear,
    updateProfile,
  };
}
