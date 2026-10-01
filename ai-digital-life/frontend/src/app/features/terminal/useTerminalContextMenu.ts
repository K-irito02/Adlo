import { useCallback, useState, type SetStateAction, type Dispatch } from 'react';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { useAppStore } from '@stores/slicedStore';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseTerminalContextMenuReturn {
  contextMenu: ContextMenuState;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState>>;
  handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  handleTogglePin: () => void;
  handleRenameFromMenu: () => void;
  handleDeleteFromMenu: () => void;
  /** 右键菜单「在中间部分显示」：把目标终端标签移动到中心区并关闭菜单 */
  handleOpenInCenterFromMenu: () => void;
  /** 关闭菜单（外部点击 / Esc 由菜单组件调用） */
  closeContextMenu: () => void;
}

export function useTerminalContextMenu(
  terminalTabs: TerminalTabState[],
  handleDoubleClick: (tabId: string, title: string) => void,
  terminalTogglePin: (tabId: string) => void,
  handleCloseTab: (tabId: string) => void,
): UseTerminalContextMenuReturn {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    tabId: null,
    isPinned: false,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
      isPinned,
    });
  }, []);

  const handleTogglePin = useCallback(() => {
    if (contextMenu.tabId) {
      terminalTogglePin(contextMenu.tabId);
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTogglePin]);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = terminalTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, terminalTabs, handleDoubleClick]);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, handleCloseTab]);

  const handleOpenInCenterFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      useAppStore.getState().centerShowTerminalTab(contextMenu.tabId);
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, []);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleOpenInCenterFromMenu,
    closeContextMenu,
  };
}
