import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserContextMenu } from './useBrowserContextMenu';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useTCopy } from '@i18n/useTCopy';

export type BrowserNavigatorMode = 'tabs' | 'bookmarks' | 'history';

export type BrowserMenuItem =
  | { id: string; separator: true }
  | { id: string; label: string; disabled?: boolean; action?: () => void };

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  tabId: string | null;
  isPinned: boolean;
}

export interface UseBrowserMenusReturn {
  browserMenuOpen: boolean;
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  contextMenu: ContextMenuState;
  handleContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  handleTogglePin: () => void;
  handleRenameFromMenu: () => void;
  handleDeleteFromMenu: () => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: () => void;
  handleOpenInCurrentTab: () => void;
}

export function useBrowserMenus({
  activeTab: _activeTab,
  handleCloseTab,
  handleDoubleClick,
}: {
  activeTab?: BrowserTabState;
  handleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}): UseBrowserMenusReturn {
  const { t } = useTCopy();
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);

  const browserMenuRef = useRef<HTMLDivElement | null>(null);

  const browserTabs = useAppStore((state) => state.browserTabs);
  const browserTogglePin = useAppStore((state) => state.browserTogglePin);
  const browserOpenTab = useAppStore((state) => state.browserOpenTab);
  const browserSelectTab = useAppStore((state) => state.browserSelectTab);
  const browserNavigateActiveTab = useAppStore((state) => state.browserNavigateActiveTab);

  const {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  } = useBrowserContextMenu(
    browserTabs,
    handleDoubleClick,
    browserTogglePin,
    handleCloseTab,
    browserOpenTab,
    browserSelectTab,
    browserNavigateActiveTab
  );

  useEffect(() => {
    if (!browserMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!browserMenuRef.current?.contains(target)) {
        setBrowserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [browserMenuOpen]);

  useEffect(() => {
    if (!contextMenu.open) {
      return;
    }
    const handlePointerDown = (_event: MouseEvent) => {
      setContextMenu((prev) => ({ ...prev, open: false }));
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [contextMenu.open, setContextMenu]);

  const browserMenuItems: BrowserMenuItem[] = [
    { id: 'new-tab-folder', label: '新建标签文件夹', disabled: true },
    { id: 'sep-0', separator: true },
    { id: 'new-tab', label: t.browserNewTab, action: () => browserOpenTab() },
    { id: 'sep-1', separator: true },
    { id: 'clear-history', label: t.browserClearHistory },
    { id: 'clear-cookies', label: t.browserClearCookies, disabled: true },
    { id: 'clear-cache', label: t.browserClearCache, disabled: true },
    { id: 'devtools', label: t.browserDeveloperTools, disabled: true },
    { id: 'sep-2', separator: true },
    { id: 'zoom-in', label: t.menuZoomIn, disabled: true },
    { id: 'zoom-out', label: t.menuZoomOut, disabled: true },
    { id: 'zoom-reset', label: t.menuResetZoom, disabled: true },
  ];

  return {
    browserMenuOpen,
    setBrowserMenuOpen,
    browserMenuRef,
    browserMenuItems,
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleRenameFromMenu,
    handleDeleteFromMenu,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  };
}
