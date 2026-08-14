import { createContext, useContext } from 'react';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';

export interface BrowserPanelActions {
  handleCloseTab: (tabId: string) => void;
  handleCloseAllTabs: (workspaceId?: string) => void;
  handleClearTabDirectories: () => void;
  handleDoubleClick: (tabId: string, title: string) => void;
  handleOpenBookmarkDialog: () => void;
  handleEditTab: (tabId: string, name: string, url: string) => void;
  handleSetCreateTabDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; workspaceId?: string; folderId?: string }>
  >;
  setCreateDirDialog: React.Dispatch<
    React.SetStateAction<{ open: boolean; parentPath: string | null }>
  >;
  setRenameFolderState: React.Dispatch<
    React.SetStateAction<{ open: boolean; folderId: string; currentName: string }>
  >;
  setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
  handleToggleTreePath: (path: string) => void;
  handleDeleteAllChildTabs: (_categoryType: string, nodePath: string) => void;
  handleDeleteOwnChildTabs: (_categoryType: string, nodePath: string) => void;
  handleOpenAllInNewTabs: (_categoryType: string, nodePath: string) => void;
  handleRemoveFromArea: (workspaceId: string) => void;
  handleDeleteDirectory: (folderId: string) => void;
  handleDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  handleExpandAllTree: () => void;
  handleCollapseAllTree: () => void;
  handleRefreshTab: (tabId: string, url: string) => Promise<void>;
  handleDeleteTab: (tabId: string, url: string) => void;
  handleCopyTabLink: (url: string) => Promise<void>;
  handleOpenTabInNewTab: (url: string, title?: string) => void;
  handleOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleReload: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  setNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  handleSelectTreePath: (path: string | null) => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
  browserOpenTab: (url?: string, title?: string, folderId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  handleAlwaysNewTab: (title: string) => void;
  toggleNavigator: (tool: string) => void;
}

export const BrowserPanelActionsCtx = createContext<BrowserPanelActions | null>(null);

export function useBrowserPanelActions(): BrowserPanelActions {
  const ctx = useContext(BrowserPanelActionsCtx);
  if (!ctx) {
    throw new Error('useBrowserPanelActions must be used within BrowserPanelActionsCtx.Provider');
  }
  return ctx;
}
