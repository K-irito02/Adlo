import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserIframeStack } from './BrowserIframeStack';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TabFolderState } from '@stores/slices/browserFoldersSlice';
import type { CopyDict } from '@i18n/types';

interface BrowserPanelContentProps {
  t: CopyDict;
  isBrowserVisible: boolean;
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  isBookmarked: boolean;
  browserTabs: BrowserTabState[];
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
    React.SetStateAction<{
      open: boolean;
      folderId: string;
      currentName: string;
    }>
  >;
  navigatorQuery: string;
  searchScope: BrowserSearchScope;
  searchResults: { title: string; url: string; source: string }[];
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
  browserTabFolders: TabFolderState[];
  tabTreeExpanded: Record<string, boolean>;
  allTreeExpanded: boolean;
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
  handleOpenTabInNewTab: (url: string, title: string) => void;
  handleOpenTabInCurrentTab: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
  onRemoveBookmarkTab?: (tabId: string, url: string) => void;
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  loadingTabId: string | null;
  evictedTabIds: ReadonlySet<string>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleReload: () => void;
  urlState: {
    address: string;
    addressExpanded: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    handleAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleAddressKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleAddressBlur: () => void;
    handleSearchClick: () => void;
  };
  navigatorMode: BrowserNavigatorMode;
  setNavigatorMode: React.Dispatch<React.SetStateAction<BrowserNavigatorMode>>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;
  handleSelectTreePath: (path: string | null) => void;
  activatedTabIdsRef: React.MutableRefObject<Set<string>>;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function BrowserPanelContent({ primaryRef }: BrowserPanelContentProps) {
  const { browserNavigatorWidth, navigatorCollapsedByTool } = useAppStore(
    useShallow((state) => ({
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
    }))
  );

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  return (
    <>
      <BrowserToolbar />

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={
          {
            '--adl-files-nav-width': `${browserNavigatorWidth}px`,
          } as React.CSSProperties
        }
      >
        <BrowserNavigator />

        <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
          <BrowserIframeStack />
        </div>
      </div>
    </>
  );
}
