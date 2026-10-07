import { useCallback, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { TerminalPane, TerminalTabState } from '@stores/slices/terminalSlice';
import { activePaneOf } from '@stores/slices/terminalSliceTypes';
import { terminalPtyRuntime } from '@features/terminal/terminalPtyRuntime';
import { useTerminalTabActions } from '@features/terminal/useTerminalTabActions';
import { useTerminalShellManagement } from '@features/terminal/useTerminalShellManagement';
import type { TerminalMenuItem } from '@features/terminal/useTerminalPanel';

export interface UseTerminalViewReturn {
  terminalMenuOpen: boolean;
  setTerminalMenuOpen: Dispatch<SetStateAction<boolean>>;
  terminalMenuRef: RefObject<HTMLDivElement | null>;
  terminalMenuItems: TerminalMenuItem[];
  panes: TerminalPane[];
  activePane?: TerminalPane;
  handleAddPane: () => void;
  handleClosePane: (paneId: string) => void;
  handleSelectPane: (paneId: string) => void;
  handleXtermData: (paneId: string, data: string) => void;
  handleXtermResize: (paneId: string, cols: number, rows: number) => void;
}

/**
 * 中心终端视图的叶子 Hook（Task 11）。
 *
 * 与右面板 `useTerminalPanel` 的差别：只组合「单个终端标签」所需的叶子 Hook
 * （`useTerminalTabActions` / `useTerminalShellManagement`），**不包含**面板导航、
 * 拖拽排序、全局关闭等面板专有逻辑。这是 brief 的 Ruling-10 式务实选择：忠实抽取
 * `useTerminalPanel` 会触及面板状态机，回归面过大；此处让中心侧复用既有叶子 Hook，
 * 面板保持原样。
 *
 * PTY 归属：`tab.location` 是排他的（同一时刻只由面板或中心之一渲染），
 * 故不会把同一 session 的 xterm 同时挂到两处；但真实输出订阅目前仍是每个
 * `useTerminalPtyLifecycle` 实例各订阅一次（见 task-11 报告「PTY 双实例安全性」）。
 */
export function useTerminalView(tab: TerminalTabState | undefined): UseTerminalViewReturn {
  const panes = useMemo(() => tab?.panes ?? [], [tab]);
  const activePane = useMemo(() => (tab ? activePaneOf(tab) : undefined), [tab]);

  const {
    handleXtermData,
    handleXtermResize,
    handleKillPane,
    handleCreatePane,
    handleClosePane: closePane,
    handleCloseTab,
    handleDoubleClick,
  } = useTerminalTabActions({ activeTab: tab });

  const handleAddPane = useCallback(() => {
    if (tab) {
      void handleCreatePane(tab.id);
    }
  }, [tab, handleCreatePane]);

  const handleClosePane = useCallback(
    (paneId: string) => {
      if (tab) {
        closePane(tab.id, paneId);
      }
    },
    [tab, closePane],
  );

  const handleSelectPane = useCallback(
    (paneId: string) => {
      if (tab) {
        // 经运行时统一处理：切换活动窗格，并在该窗格无存活会话时重建 shell。
        terminalPtyRuntime.handleSelectPane(tab.id, paneId);
      }
    },
    [tab],
  );

  const { terminalMenuOpen, setTerminalMenuOpen, terminalMenuRef, terminalMenuItems } =
    useTerminalShellManagement({
      activePane,
      handleCloseTab,
      handleDoubleClick,
      handleKillPane,
    });

  return {
    terminalMenuOpen,
    setTerminalMenuOpen,
    terminalMenuRef,
    terminalMenuItems,
    panes,
    activePane,
    handleAddPane,
    handleClosePane,
    handleSelectPane,
    handleXtermData,
    handleXtermResize,
  };
}
