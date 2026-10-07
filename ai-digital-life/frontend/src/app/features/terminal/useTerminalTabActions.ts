import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTabTitleRename } from '../../hooks/useTabTitleRename';
import { useTerminalPtyLifecycle } from './useTerminalPtyLifecycle';

interface UseTerminalTabActionsParams {
  activeTab: { id: string; title: string; sessionId?: string } | undefined;
}

/**
 * 终端标签页动作 Hook：组合 PTY 生命周期与标签重命名编辑逻辑。
 *
 * 职责：
 * - 终端会话的创建/切换/关闭/杀进程（委托 useTerminalPtyLifecycle）
 * - xterm 实例引用与数据/尺寸回调（委托 useTerminalPtyLifecycle）
 * - 标签双击重命名的内联编辑状态与回调（委托共享 useTabTitleRename）
 */
export function useTerminalTabActions({ activeTab }: UseTerminalTabActionsParams) {
  const { terminalUpdateTab } = useAppStore(
    useShallow((state) => ({
      terminalUpdateTab: state.terminalUpdateTab,
    })),
  );

  const {
    xtermRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  } = useTerminalPtyLifecycle({ activeTab });

  const rename = useTabTitleRename(
    useCallback(
      (tabId: string, title: string) => terminalUpdateTab(tabId, { title }),
      [terminalUpdateTab],
    ),
  );

  return {
    xtermRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
    ...rename,
  };
}
