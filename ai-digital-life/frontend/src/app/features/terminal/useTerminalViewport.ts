import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { useTCopy } from '@i18n/useTCopy';
import type { TerminalNavigatorMode } from './useTerminalPanel';

interface UseTerminalViewportParams {
  terminalTabs: ReturnType<typeof terminalSelectors.useTerminalTabs>;
  commandHistory: string[];
}

/**
 * 终端导航器视口 Hook：管理导航器模式、宽度、折叠与最近命令列表。
 *
 * 职责：
 * - 导航器模式（sessions / history）切换
 * - 导航器折叠状态与宽度（来自 store selector）
 * - 最近命令列表派生（基于 commandHistory 或 terminalTabs）
 * - 导航器标题与计数派生
 * - 导航器折叠/展开切换与宽度调整（委托 useNavigatorResize）
 */
export function useTerminalViewport({ terminalTabs, commandHistory }: UseTerminalViewportParams) {
  const { t } = useTCopy();
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>('sessions');

  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();

  const { setTerminalNavigatorWidth, toggleTerminalNavigator } = useAppStore(
    useShallow((state) => ({
      setTerminalNavigatorWidth: state.setTerminalNavigatorWidth,
      toggleTerminalNavigator: state.toggleTerminalNavigator,
    })),
  );

  const recentCommands = useMemo(() => {
    if (commandHistory.length > 0) {
      return commandHistory.map((entry, index) => ({
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
  }, [commandHistory, t.terminalCommandHistory, terminalTabs]);

  const navigatorTitle =
    navigatorMode === 'sessions' ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === 'sessions' ? terminalTabs.length : recentCommands.length;

  const toggleNavigator = useCallback(
    (tool: string) => {
      if (tool === 'terminal') {
        toggleTerminalNavigator();
      }
    },
    [toggleTerminalNavigator],
  );

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setTerminalNavigatorWidth,
    minWidth: 180,
    maxWidth: 300,
  });

  return {
    navigatorMode,
    setNavigatorMode,
    navigatorCollapsed,
    terminalNavigatorWidth,
    navigatorTitle,
    navigatorCount,
    recentCommands,
    toggleNavigator,
    handleNavigatorResizeStart,
  };
}
