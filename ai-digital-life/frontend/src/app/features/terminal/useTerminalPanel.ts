import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import { isPanelTab } from '@stores/slices/tabLocation';
import { useTerminalDragDrop } from './useTerminalDragDrop';
import { useTerminalTabActions } from './useTerminalTabActions';
import { useTerminalShellManagement } from './useTerminalShellManagement';
import { useTerminalViewport } from './useTerminalViewport';
import { useTerminalViewPrefs } from './useTerminalViewPrefs';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import type { TerminalHistorySegment } from './terminalHistoryStore';
import type { TerminalViewMode, TerminalViewPrefs } from './terminalViewPrefs';
import { nextRegionCollapse, terminalRegionCollapseStore } from './terminalRegionCollapse';
import type { RegionCollapse, RegionName } from './terminalRegionCollapse';

// 注意：“命令历史（最近命令）”功能已彻底删除，不再提供 TerminalNavigatorMode。
// 左侧导航固定展示终端目录；只读历史区仍在主内容区按标签展示。

export type TerminalMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };

export interface WorkspaceMenuItem {
  id: string;
  label: string;
  workspaceId: string;
}

export type TerminalShellMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; profile?: TerminalProfile; action: () => void }
  | {
      id: string;
      label: string;
      hasSubMenu: true;
      subMenu: WorkspaceMenuItem[];
      action?: () => void;
    };

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseTerminalPanelReturn {
  terminalState: {
    xtermRef: React.RefObject<XtermTerminalHandle | null>;
    /** 承载「历史区 + 分界线 + 实时终端」的容器引用（拖拽分界线需要它换算比例） */
    viewContainerRef: React.RefObject<HTMLDivElement | null>;
    /** 终端视图偏好：单列/双列、历史区位置、历史区占比 */
    viewPrefs: TerminalViewPrefs;
    /** 活动标签的只读历史段（重启前的会话快照），供历史视图回放 */
    historySegments: TerminalHistorySegment[];
    editInputRef: React.RefObject<HTMLInputElement | null>;
    shellMenuRef: React.RefObject<HTMLDivElement | null>;
    terminalMenuRef: React.RefObject<HTMLDivElement | null>;
    shellMenuOpen: boolean;
    terminalMenuOpen: boolean;
    contextMenu: ContextMenuState;
    editingTabId: string | null;
    editValue: string;
    isDragging: boolean;
    dragOverTabId: string | null;
    terminalTabs: ReturnType<typeof terminalSelectors.useTerminalTabs>;
    terminalActiveTabId: string;
    terminalNavigatorWidth: number;
    navigatorCollapsed: boolean;
    activeTab?: ReturnType<typeof terminalSelectors.useActiveTerminalTab>;
    hasActiveTab: boolean;
    /** 当前活动标签的只读/实时区域折叠态（'none' = 两区都展开） */
    regionCollapse: RegionCollapse;
    currentProfile: TerminalProfile;
    currentProfileLabel: string;
    shellMenuItems: TerminalShellMenuItem[];
    shellTypeItems: (TerminalShellMenuItem & { label: string; profile: TerminalProfile })[];
    terminalMenuItems: TerminalMenuItem[];
  };
  terminalActions: {
    handleCreateTab: (profile?: TerminalProfile, workspaceId?: string) => Promise<void>;
    handleSelectTab: (tabId: string) => void;
    handleCloseTab: (tabId: string) => void;
    handleCloseAllTabs: (workspaceId?: string) => void;
    handleTogglePin: () => void;
    handleDoubleClick: (tabId: string, title: string) => void;
    handleEditSubmit: () => void;
    handleEditKeyDown: (e: React.KeyboardEvent) => void;
    handleCopy: () => void;
    handlePaste: () => void;
    handleClear: () => void;
    handleKill: () => void;
    updateProfile: (profile: TerminalProfile) => void;
    toggleNavigator: (tool: string) => void;
    handleNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    handleXtermData: (data: string) => void;
    handleXtermResize: (cols: number, rows: number) => void;
    setShellMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setTerminalMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setEditValue: React.Dispatch<React.SetStateAction<string>>;
    setViewMode: (mode: TerminalViewMode) => void;
    /** 交换「只读历史区」与「实时终端」在主轴上的位置 */
    swapAreas: () => void;
    /** 分界线拖拽起始（单列调高度、双列调宽度） */
    handleDividerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    /** 收起/展开某个只读区域（'history' | 'live'）；再点一次还原 'none' */
    toggleRegionCollapse: (region: RegionName) => void;
    /** 删除当前标签的全部只读历史，并把折叠态复位为 'none'（实时区随之恢复展开） */
    deleteHistory: (tabId: string) => Promise<void>;
    /** 右键菜单「重命名」：进入内联编辑并关闭菜单 */
    handleRenameFromMenu: () => void;
    /** 右键菜单「删除」：走完整关闭清理（杀 PTY/释放池/删历史）并关闭菜单 */
    handleDeleteFromMenu: () => void;
    /** 右键菜单「在中间部分显示」：把目标终端标签移动到中心区并关闭菜单 */
    handleOpenInCenterFromMenu: () => void;
    /** 关闭右键菜单（菜单组件在外部点击 / Esc 时调用） */
    closeContextMenu: () => void;
  };
  dragHandlers: {
    handleDragStart: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
    handleDragEnd: () => void;
    handleDragOver: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
    handleDrop: (e: React.DragEvent, targetTabId: string, targetIsPinned: boolean) => void;
  };
  menuHandlers: {
    handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  };
}

export function useTerminalPanel(): UseTerminalPanelReturn {
  // 面板只拥有 location !== 'center' 的终端标签：转入中心的终端不得在面板列表/计数中
  // 重复显示，也不得由面板再次挂载同一 session（排他归属，spec 目标 #5）。
  const allTerminalTabs = terminalSelectors.useTerminalTabs();
  const terminalTabs = useMemo(() => allTerminalTabs.filter(isPanelTab), [allTerminalTabs]);
  const terminalActiveTabId = terminalSelectors.useTerminalActiveTabId();

  const { terminalReorderTabs } = useAppStore(
    useShallow((state) => ({
      terminalReorderTabs: state.terminalReorderTabs,
    })),
  );

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === terminalActiveTabId) ?? terminalTabs[0],
    [terminalActiveTabId, terminalTabs],
  );

  const hasActiveTab = activeTab != null;

  const { isDragging, dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useTerminalDragDrop(terminalTabs, terminalReorderTabs);

  const {
    xtermRef,
    historySegments,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
    editingTabId,
    editValue,
    editInputRef,
    setEditValue,
    handleDoubleClick,
    handleEditSubmit,
    handleEditKeyDown,
    deleteHistoryForTab,
  } = useTerminalTabActions({ activeTab });

  const {
    currentProfile,
    currentProfileLabel,
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
    handleCopy,
    handlePaste,
    handleClear,
    updateProfile,
  } = useTerminalShellManagement({
    xtermRef,
    activeTab,
    handleCloseTab,
    handleDoubleClick,
    handleKill,
  });

  const {
    navigatorCollapsed,
    terminalNavigatorWidth,
    toggleNavigator,
    handleNavigatorResizeStart,
  } = useTerminalViewport({ terminalTabs });

  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const { viewPrefs, setViewMode, swapAreas, handleDividerPointerDown } = useTerminalViewPrefs({
    containerRef: viewContainerRef,
    activeTabId: activeTab?.id,
  });

  // 区域折叠态：按标签记录，持久化到磁盘（重启后记住每个标签的折叠选择）。
  const [collapseMap, setCollapseMap] = useState<Record<string, RegionCollapse>>(() =>
    terminalRegionCollapseStore.load(),
  );
  useEffect(() => {
    terminalRegionCollapseStore.save(collapseMap);
  }, [collapseMap]);

  // 标签关闭后剪掉其折叠态记录：标签 id 每次创建都不同，不剪会随使用无限累积。
  useEffect(() => {
    setCollapseMap((prev) => {
      const liveTabIds = new Set(terminalTabs.map((tab) => tab.id));
      const stale = Object.keys(prev).filter((tabId) => !liveTabIds.has(tabId));
      if (stale.length === 0) {
        return prev;
      }
      const next: Record<string, RegionCollapse> = {};
      for (const [tabId, value] of Object.entries(prev)) {
        if (liveTabIds.has(tabId)) {
          next[tabId] = value;
        }
      }
      return next;
    });
  }, [terminalTabs]);

  const collapseTabId = activeTab?.id ?? '';
  const regionCollapse: RegionCollapse = collapseTabId
    ? (collapseMap[collapseTabId] ?? 'none')
    : 'none';

  const toggleRegionCollapse = useCallback(
    (region: RegionName) => {
      if (!collapseTabId) {
        return;
      }
      setCollapseMap((prev) => ({
        ...prev,
        [collapseTabId]: nextRegionCollapse(prev[collapseTabId] ?? 'none', region),
      }));
    },
    [collapseTabId],
  );

  /**
   * 删除历史：清索引 + 清全部块 + 折叠状态复位为 'none'。
   * 实时区若原本收起则随之恢复展开；历史没了 → 收起/展开按钮自然消失。
   */
  const deleteHistory = useCallback(
    async (tabId: string) => {
      await deleteHistoryForTab(tabId);
      setCollapseMap((prev) => ({ ...prev, [tabId]: 'none' }));
    },
    [deleteHistoryForTab],
  );

  return {
    terminalState: {
      xtermRef,
      viewContainerRef,
      viewPrefs,
      historySegments,
      editInputRef,
      shellMenuRef,
      terminalMenuRef,
      shellMenuOpen,
      terminalMenuOpen,
      contextMenu,
      editingTabId,
      editValue,
      isDragging,
      dragOverTabId,
      terminalTabs,
      terminalActiveTabId,
      terminalNavigatorWidth,
      navigatorCollapsed,
      activeTab,
      hasActiveTab,
      regionCollapse,
      currentProfile,
      currentProfileLabel,
      shellMenuItems,
      shellTypeItems,
      terminalMenuItems,
    },
    terminalActions: {
      handleCreateTab,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
      handleTogglePin,
      handleDoubleClick,
      handleEditSubmit,
      handleEditKeyDown,
      handleCopy,
      handlePaste,
      handleClear,
      handleKill,
      updateProfile,
      toggleNavigator,
      handleNavigatorResizeStart,
      handleXtermData,
      handleXtermResize,
      setShellMenuOpen,
      setTerminalMenuOpen,
      setEditValue,
      setViewMode,
      swapAreas,
      handleDividerPointerDown,
      toggleRegionCollapse,
      deleteHistory,
      handleRenameFromMenu,
      handleDeleteFromMenu,
      handleOpenInCenterFromMenu,
      closeContextMenu,
    },
    dragHandlers: {
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDrop,
    },
    menuHandlers: {
      handleContextMenu,
    },
  };
}
