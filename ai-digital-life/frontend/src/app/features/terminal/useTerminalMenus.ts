import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useTerminalContextMenu } from './useTerminalContextMenu';
import type { TerminalProfile } from '@stores/types';
import { TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN } from '@stores/slices/terminalSliceTypes';
import type {
  TerminalMenuItem,
  TerminalShellMenuItem,
  WorkspaceMenuItem,
} from './useTerminalPanel';
import { useTCopy } from '@i18n/useTCopy';

interface TerminalMenusParams {
  handleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}

export function useTerminalMenus({ handleCloseTab, handleDoubleClick }: TerminalMenusParams) {
  const { t } = useTCopy();
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);

  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);

  const terminalTabs = terminalSelectors.useTerminalTabs();
  const { terminalTogglePin, recentWorkspaces } = useAppStore(
    useShallow((state) => ({
      terminalTogglePin: state.terminalTogglePin,
      recentWorkspaces: state.recentWorkspaces,
    })),
  );
  // 窗格边界线 / 活动高亮总开关（更多终端操作，仿文件面板行号开关）
  const terminalShowPaneBorders = useAppStore((state) => state.terminalShowPaneBorders);
  const setTerminalShowPaneBorders = useAppStore((state) => state.setTerminalShowPaneBorders);
  const terminalShowActiveHighlight = useAppStore((state) => state.terminalShowActiveHighlight);
  const setTerminalShowActiveHighlight = useAppStore(
    (state) => state.setTerminalShowActiveHighlight,
  );
  const terminalFontSize = useAppStore((state) => state.terminalFontSize);
  const setTerminalFontSize = useAppStore((state) => state.setTerminalFontSize);

  const {
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
  } = useTerminalContextMenu(terminalTabs, handleDoubleClick, terminalTogglePin, handleCloseTab);

  const updateProfile = useAppStore((state) => state.setShellSelectorProfile);

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
    {
      id: 'pane-borders',
      label: t.terminalPaneBorders,
      checked: terminalShowPaneBorders,
      action: () => setTerminalShowPaneBorders(!terminalShowPaneBorders),
    },
    {
      id: 'active-highlight',
      label: t.terminalActiveHighlight,
      checked: terminalShowActiveHighlight,
      action: () => setTerminalShowActiveHighlight(!terminalShowActiveHighlight),
    },
    { id: 'sep-view', separator: true },
    {
      id: 'font-increase',
      label: t.terminalFontIncrease,
      disabled: terminalFontSize >= TERMINAL_FONT_SIZE_MAX,
      action: () => setTerminalFontSize(terminalFontSize + 1),
    },
    {
      id: 'font-decrease',
      label: t.terminalFontDecrease,
      disabled: terminalFontSize <= TERMINAL_FONT_SIZE_MIN,
      action: () => setTerminalFontSize(terminalFontSize - 1),
    },
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
    updateProfile,
  };
}
