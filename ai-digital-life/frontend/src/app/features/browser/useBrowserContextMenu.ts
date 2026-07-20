import { useCallback, useState, type SetStateAction, type Dispatch } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseBrowserContextMenuReturn {
  contextMenu: ContextMenuState;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState>>;
  handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  handleTogglePin: () => void;
  handleRenameFromMenu: () => void;
  handleDeleteFromMenu: () => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: () => void;
  handleOpenInCurrentTab: () => void;
}

export function useBrowserContextMenu(
  browserTabs: BrowserTabState[],
  handleDoubleClick: (tabId: string, title: string) => void,
  browserTogglePin: (tabId: string) => void,
  handleCloseTab: (tabId: string) => void,
  browserOpenTab: (url?: string, title?: string, workspaceId?: string) => void,
  browserSelectTab: (tabId: string) => void,
  _browserNavigateActiveTab: (url: string, title?: string) => void,
): UseBrowserContextMenuReturn {
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
      browserTogglePin(contextMenu.tabId);
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, browserTogglePin]);

  const handleRenameFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, browserTabs, handleDoubleClick]);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, handleCloseTab]);

  const handleCopyUrlFromMenu = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        navigator.clipboard?.writeText(tab.url).catch(() => {});
      }
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, browserTabs]);

  const handleOpenInNewTab = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        browserOpenTab(tab.url, tab.title, tab.workspaceId);
      }
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, browserTabs, browserOpenTab]);

  const handleOpenInCurrentTab = useCallback(() => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        browserSelectTab(tab.id);
      }
    }
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, [contextMenu.tabId, browserTabs, browserSelectTab]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  };
}
