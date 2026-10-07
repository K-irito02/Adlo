import { useCallback, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { TerminalPane, TerminalTabState } from '@stores/slices/terminalSlice';
import { activePaneOf } from '@stores/slices/terminalSliceTypes';
import { terminalPtyRuntime } from '@features/terminal/terminalPtyRuntime';
import { useTerminalTabActions } from '@features/terminal/useTerminalTabActions';
import { useTerminalShellManagement } from '@features/terminal/useTerminalShellManagement';
import { useTerminalPaneLayout, type FreeDragEdge } from '@features/terminal/useTerminalPaneLayout';
import type { PaneLayoutMode, TerminalPaneLayout } from '@features/terminal/terminalPaneLayout';
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
  /** 自定义布局卡片：按索引移动窗格（复用 `terminalReorderPanes`） */
  handleReorderPanes: (fromIndex: number, toIndex: number) => void;
  /** 自定义布局卡片：交换两个窗格（复用 `terminalSwapPanes`） */
  handleSwapPanes: (a: string, b: string) => void;
  /** 自定义布局卡片：写入窗格标注（限 1 码点，复用 `terminalUpdatePane`） */
  handlePaneLabelChange: (paneId: string, label: string) => void;
  handleXtermData: (paneId: string, data: string) => void;
  handleXtermResize: (paneId: string, cols: number, rows: number) => void;
  layout: TerminalPaneLayout;
  setMode: (mode: PaneLayoutMode) => void;
  resetAuto: () => void;
  handleColDividerPointerDown: (colIndex: number, e: React.PointerEvent) => void;
  handleRowDividerPointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  handleFreeDragPointerDown: (paneId: string, edge: FreeDragEdge, e: React.PointerEvent) => void;
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
export function useTerminalView(
  tab: TerminalTabState | undefined,
  containerRef: RefObject<HTMLDivElement | null>,
): UseTerminalViewReturn {
  const panes = useMemo(() => tab?.panes ?? [], [tab]);
  const activePane = useMemo(() => (tab ? activePaneOf(tab) : undefined), [tab]);
  const paneIds = useMemo(() => panes.map((pane) => pane.id), [panes]);

  const { terminalReorderPanes, terminalSwapPanes, terminalUpdatePane } = useAppStore(
    useShallow((state) => ({
      terminalReorderPanes: state.terminalReorderPanes,
      terminalSwapPanes: state.terminalSwapPanes,
      terminalUpdatePane: state.terminalUpdatePane,
    })),
  );

  const {
    layout,
    setMode,
    resetAuto,
    handleColDividerPointerDown,
    handleRowDividerPointerDown,
    handleFreeDragPointerDown,
  } = useTerminalPaneLayout({
    containerRef,
    activeTabId: tab?.id,
    paneCount: panes.length,
    paneIds,
  });

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

  // 自定义布局卡片动作：以当前标签的 `panes` 顺序为基准，复用 B 阶段 store 动作。
  const handleReorderPanes = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!tab) {
        return;
      }
      const ids = tab.panes.map((pane) => pane.id);
      if (
        fromIndex < 0 ||
        fromIndex >= ids.length ||
        toIndex < 0 ||
        toIndex >= ids.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      terminalReorderPanes(tab.id, ids);
    },
    [tab, terminalReorderPanes],
  );

  const handleSwapPanes = useCallback(
    (a: string, b: string) => {
      if (tab) {
        terminalSwapPanes(tab.id, a, b);
      }
    },
    [tab, terminalSwapPanes],
  );

  const handlePaneLabelChange = useCallback(
    (paneId: string, label: string) => {
      if (tab) {
        terminalUpdatePane(tab.id, paneId, {
          label: Array.from(label).slice(0, 1).join(''),
        });
      }
    },
    [tab, terminalUpdatePane],
  );

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
    handleReorderPanes,
    handleSwapPanes,
    handlePaneLabelChange,
    handleXtermData,
    handleXtermResize,
    layout,
    setMode,
    resetAuto,
    handleColDividerPointerDown,
    handleRowDividerPointerDown,
    handleFreeDragPointerDown,
  };
}
