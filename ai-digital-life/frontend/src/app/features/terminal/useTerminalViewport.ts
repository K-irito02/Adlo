import { useCallback, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { useTCopy } from '@i18n/useTCopy';
import type { TerminalNavigatorMode } from './useTerminalPanel';

interface UseTerminalViewportParams {
  terminalTabs: ReturnType<typeof terminalSelectors.useTerminalTabs>;
}

/**
 * 终端导航器视口 Hook：管理导航器模式、宽度、折叠与最近命令列表。
 *
 * 职责：
 * - 导航器模式（sessions / history）切换
 * - 导航器折叠状态与宽度（来自 store selector）
 * - 命令历史列表（来自独立持久化存储）
 * - 导航器标题与计数派生
 * - 导航器折叠/展开切换与宽度调整（委托 useNavigatorResize）
 */
export function useTerminalViewport({ terminalTabs }: UseTerminalViewportParams) {
  const { t } = useTCopy();
  const [navigatorMode, setNavigatorMode] = useState<TerminalNavigatorMode>('sessions');

  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();
  const commandHistory = terminalSelectors.useCommandHistory();

  const { setTerminalNavigatorWidth, toggleTerminalNavigator } = useAppStore(
    useShallow((state) => ({
      setTerminalNavigatorWidth: state.setTerminalNavigatorWidth,
      toggleTerminalNavigator: state.toggleTerminalNavigator,
    })),
  );

  const navigatorTitle =
    navigatorMode === 'sessions' ? t.terminalSessions : t.terminalRecentCommands;
  const navigatorCount = navigatorMode === 'sessions' ? terminalTabs.length : commandHistory.length;

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
    commandHistory,
    toggleNavigator,
    handleNavigatorResizeStart,
  };
}
