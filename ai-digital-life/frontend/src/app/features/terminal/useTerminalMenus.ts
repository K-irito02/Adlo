import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useTerminalContextMenu } from './useTerminalContextMenu';
import type { TerminalProfile } from '@stores/types';
import { activePaneOf } from '@stores/slices/terminalSliceTypes';
import { terminalPtyRuntime } from './terminalPtyRuntime';
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

  // 杀死进程的目标：当前标签的活动窗格（仅此一格，其它标签/窗格不受影响）。
  // 直接读 store 派生，不经调用方透传（菜单消费链精简，能力仍走运行时统一出口）。
  // 对象选择器必须经 useShallow 比较字段，否则每次 store 更新都重渲染。
  const killTarget = useAppStore(
    useShallow((state) => {
      const tab = state.terminalTabsById[state.terminalActiveTabId];
      if (!tab) {
        return undefined;
      }
      const pane = activePaneOf(tab);
      if (!pane) {
        return undefined;
      }
      return { tabId: tab.id, paneId: pane.id, sessionId: pane.sessionId };
    }),
  );

  const handleKillActivePane = () => {
    if (!killTarget?.sessionId) {
      return;
    }
    // 用户语义（跟进 22）：结束旧进程后立即为同一窗格起新会话并清空显示，
    // 而不是停在"已终止+留旧输出"。activatePane 内部经 teardown 释放旧池条目，
    // 故旧内容随新会话建立而清空。
    console.log(`[ADL-DEBUG] terminal kill-restart pane=${killTarget.paneId}`);
    terminalPtyRuntime.handleKillPane(killTarget);
    void terminalPtyRuntime.activatePane(killTarget.tabId, killTarget.paneId);
  };

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
    { id: 'sep-kill', separator: true },
    {
      id: 'kill-pane',
      label: t.terminalKillProcess,
      hint: `# ${t.terminalKillProcessHintTitle}\n${t.terminalKillProcessHintBody}`,
      disabled: !killTarget?.sessionId,
      action: handleKillActivePane,
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
