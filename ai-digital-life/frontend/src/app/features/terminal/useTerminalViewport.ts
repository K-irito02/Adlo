import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { useNavigatorResize } from '@hooks/useNavigatorResize';

interface UseTerminalViewportParams {
  terminalTabs: ReturnType<typeof terminalSelectors.useTerminalTabs>;
}

/**
 * 终端导航器视口 Hook：管理导航器折叠、宽度与尺寸调整。
 *
 * 说明：“命令历史（最近命令）”模式已彻底删除，此处不再维护
 * sessions/history 模式切换、命令历史列表与标题/计数派生。
 * 只读历史区仍在主内容区（TerminalHistoryList）按标签展示，不受影响。
 */
export function useTerminalViewport({ terminalTabs }: UseTerminalViewportParams) {
  void terminalTabs;
  const navigatorCollapsed = terminalSelectors.useNavigatorCollapsedByTool().terminal;
  const terminalNavigatorWidth = terminalSelectors.useTerminalNavigatorWidth();

  const { setTerminalNavigatorWidth, toggleTerminalNavigator } = useAppStore(
    useShallow((state) => ({
      setTerminalNavigatorWidth: state.setTerminalNavigatorWidth,
      toggleTerminalNavigator: state.toggleTerminalNavigator,
    })),
  );

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
    navigatorCollapsed,
    terminalNavigatorWidth,
    toggleNavigator,
    handleNavigatorResizeStart,
  };
}
