import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { useTerminalTabActions } from '@features/terminal/useTerminalTabActions';
import { useTerminalViewPrefs } from '@features/terminal/useTerminalViewPrefs';
import { useTerminalShellManagement } from '@features/terminal/useTerminalShellManagement';
import {
  nextRegionCollapse,
  terminalRegionCollapseStore,
} from '@features/terminal/terminalRegionCollapse';
import type { RegionCollapse, RegionName } from '@features/terminal/terminalRegionCollapse';
import type { TerminalViewMode, TerminalViewPrefs } from '@features/terminal/terminalViewPrefs';
import type { TerminalMenuItem } from '@features/terminal/useTerminalPanel';
import type { TerminalHistorySegment } from '@features/terminal/terminalHistoryStore';

export interface UseTerminalViewReturn {
  xtermRef: RefObject<XtermTerminalHandle | null>;
  /** 承载「只读历史区 + 分界线 + 实时终端」的容器（分界线拖拽换算需要它） */
  viewContainerRef: RefObject<HTMLDivElement | null>;
  viewPrefs: TerminalViewPrefs;
  historySegments: TerminalHistorySegment[];
  /** 当前标签的只读/实时区域折叠态（'none' = 两区都展开） */
  regionCollapse: RegionCollapse;
  terminalMenuOpen: boolean;
  setTerminalMenuOpen: Dispatch<SetStateAction<boolean>>;
  terminalMenuRef: RefObject<HTMLDivElement | null>;
  terminalMenuItems: TerminalMenuItem[];
  setViewMode: (mode: TerminalViewMode) => void;
  swapAreas: () => void;
  handleDividerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  toggleRegionCollapse: (region: RegionName) => void;
  deleteHistory: (tabId: string) => Promise<void>;
  handleXtermData: (data: string) => void;
  handleXtermResize: (cols: number, rows: number) => void;
  handleClear: () => void;
}

/**
 * 中心终端视图的叶子 Hook（Task 11）。
 *
 * 与右面板 `useTerminalPanel` 的差别：只组合「单个终端标签」所需的叶子 Hook
 * （`useTerminalTabActions` / `useTerminalViewPrefs` / `useTerminalShellManagement`
 * / `terminalRegionCollapse`），**不包含**面板导航、拖拽排序、全局关闭等面板专有逻辑。
 * 这是 brief 的 Ruling-10 式务实选择：忠实抽取 `useTerminalPanel` 会触及面板状态机，
 * 回归面过大；此处让中心侧复用既有叶子 Hook，面板保持原样。
 *
 * PTY 归属：`tab.location` 是排他的（同一时刻只由面板或中心之一渲染），
 * 故不会把同一 session 的 xterm 同时挂到两处；但真实输出订阅目前仍是每个
 * `useTerminalPtyLifecycle` 实例各订阅一次（见 task-11 报告「PTY 双实例安全性」）。
 */
export function useTerminalView(tab: TerminalTabState | undefined): UseTerminalViewReturn {
  const {
    xtermRef,
    historySegments,
    handleXtermData,
    handleXtermResize,
    handleCloseTab,
    handleKill,
    handleDoubleClick,
    deleteHistoryForTab,
  } = useTerminalTabActions({ activeTab: tab });

  const { terminalMenuOpen, setTerminalMenuOpen, terminalMenuRef, terminalMenuItems, handleClear } =
    useTerminalShellManagement({
      xtermRef,
      activeTab: tab,
      handleCloseTab,
      handleDoubleClick,
      handleKill,
    });

  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const { viewPrefs, setViewMode, swapAreas, handleDividerPointerDown } = useTerminalViewPrefs({
    containerRef: viewContainerRef,
    activeTabId: tab?.id,
  });

  // 区域折叠态按标签记录（与面板共用同一持久化存储）。
  // 只维护「本标签」的一个值并在保存时合并回存储中的整表，避免用一份陈旧的
  // 本地整表把面板写入的其它标签折叠态覆盖掉（面板与中心可能同时存在）。
  const tabId = tab?.id;
  const [prevTabId, setPrevTabId] = useState<string | undefined>(tabId);
  const [regionCollapse, setRegionCollapse] = useState<RegionCollapse>(() =>
    tabId ? (terminalRegionCollapseStore.load()[tabId] ?? 'none') : 'none',
  );
  if (tabId !== prevTabId) {
    setPrevTabId(tabId);
    setRegionCollapse(tabId ? (terminalRegionCollapseStore.load()[tabId] ?? 'none') : 'none');
  }
  useEffect(() => {
    if (!tabId) {
      return;
    }
    const current = terminalRegionCollapseStore.load();
    if (current[tabId] === regionCollapse) {
      return;
    }
    terminalRegionCollapseStore.save({ ...current, [tabId]: regionCollapse });
  }, [tabId, regionCollapse]);

  const toggleRegionCollapse = useCallback((region: RegionName) => {
    setRegionCollapse((prev) => nextRegionCollapse(prev, region));
  }, []);

  const deleteHistory = useCallback(
    async (targetTabId: string) => {
      await deleteHistoryForTab(targetTabId);
      setRegionCollapse('none');
    },
    [deleteHistoryForTab],
  );

  return {
    xtermRef,
    viewContainerRef,
    viewPrefs,
    historySegments,
    regionCollapse,
    terminalMenuOpen,
    setTerminalMenuOpen,
    terminalMenuRef,
    terminalMenuItems,
    setViewMode,
    swapAreas,
    handleDividerPointerDown,
    toggleRegionCollapse,
    deleteHistory,
    handleXtermData,
    handleXtermResize,
    handleClear,
  };
}
