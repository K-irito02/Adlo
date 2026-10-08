import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  // 兜底与面板同源：活动 id 失配（标签删除瞬间）时取首标签（面板 activeTab ?? tabs[0]）。
  const killTarget = useAppStore(
    useShallow((state) => {
      const tab = state.terminalTabsById[state.terminalActiveTabId] ?? state.terminalTabs[0];
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

  const handleKillActivePane = useCallback(() => {
    if (!killTarget?.sessionId) {
      return;
    }
    // 用户语义（跟进 22）：结束旧进程后立即为同一窗格起新会话并清空显示。
    // 机理：kill 只清 PTY 与运行时账本、刻意不释放 xterm 池（Ruling C-7，
    // 保留旧输出直到新会话就绪）；随后 activatePane 建新会话并更新 store 的
    // sessionId，XtermTerminal 因 sessionId 变化重建，旧内容随之清空。
    terminalPtyRuntime.handleKillPane(killTarget);
    void terminalPtyRuntime.activatePane(killTarget.tabId, killTarget.paneId);
  }, [killTarget]);

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

  // 数组每次渲染新建会击穿下拉菜单的 React.memo：按依赖 memo 化。
  const terminalMenuItems: TerminalMenuItem[] = useMemo(
    () => [
      {
        id: 'pane-borders',
        label: t.terminalPaneBorders,
        checked: terminalShowPaneBorders,
        keepOpen: true,
        action: () => setTerminalShowPaneBorders(!terminalShowPaneBorders),
      },
      {
        id: 'active-highlight',
        label: t.terminalActiveHighlight,
        checked: terminalShowActiveHighlight,
        keepOpen: true,
        action: () => setTerminalShowActiveHighlight(!terminalShowActiveHighlight),
      },
      { id: 'sep-view', separator: true },
      {
        id: 'font-increase',
        label: t.terminalFontIncrease,
        disabled: terminalFontSize >= TERMINAL_FONT_SIZE_MAX,
        keepOpen: true,
        action: () => setTerminalFontSize(terminalFontSize + 1),
      },
      {
        id: 'font-decrease',
        label: t.terminalFontDecrease,
        disabled: terminalFontSize <= TERMINAL_FONT_SIZE_MIN,
        keepOpen: true,
        action: () => setTerminalFontSize(terminalFontSize - 1),
      },
      { id: 'sep-kill', separator: true },
      {
        id: 'kill-pane',
        label: t.terminalKillProcess,
        hint: `# ${t.terminalKillProcessHintTitle}\n${t.terminalKillProcessHintBody}`,
        hintLabel: t.terminalKillProcessHintTitle,
        disabled: !killTarget?.sessionId,
        action: handleKillActivePane,
      },
    ],
    [
      t,
      terminalShowPaneBorders,
      setTerminalShowPaneBorders,
      terminalShowActiveHighlight,
      setTerminalShowActiveHighlight,
      terminalFontSize,
      setTerminalFontSize,
      // killTarget 与派生自它的 handleKillActivePane 同源同频：同时列出有冗余，
      // 但去掉任一都会触发 exhaustive-deps；lint 正确性优先于去重，保留现状。
      killTarget,
      handleKillActivePane,
    ],
  );

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
