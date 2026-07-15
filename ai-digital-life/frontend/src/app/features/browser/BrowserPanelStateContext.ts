import { createContext, useContext } from 'react';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TabFolderState } from '@stores/slices/browserFoldersSlice';
import type { BrowserNavigatorMode } from './useBrowserTabs';
import type { BrowserSearchScope } from './useBrowserSearch';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { CopyDict } from '@i18n/types';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export interface BrowserPanelState {
  t: CopyDict;
  isBrowserVisible: boolean;
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  isBookmarked: boolean;
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  tabTreeExpanded: Record<string, boolean>;
  allTreeExpanded: boolean;
  navigatorQuery: string;
  searchScope: BrowserSearchScope;
  searchResults: { title: string; url: string; source: string }[];
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  loadingTabId: string | null;
  evictedTabIds: ReadonlySet<string>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  navigatorMode: BrowserNavigatorMode;
  navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
  navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
  selectedTreePath: string | null;
  selectedTreePathRef: React.MutableRefObject<string | null>;
  activatedTabIdsRef: React.MutableRefObject<Set<string>>;
  urlState: {
    address: string;
    addressExpanded: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    handleAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleAddressKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleAddressBlur: () => void;
    handleSearchClick: () => void;
    handlePlusClick: () => void;
  };
  navigatorCollapsed: boolean;
  browserNavigatorWidth: number;
  visibleWorkspaces: RecentWorkspaceEntry[];
  handlePointerDown: (e: React.PointerEvent) => void;
  openTabCount: number;
  navigatorTitle: string;
}

export const BrowserPanelStateCtx = createContext<BrowserPanelState | null>(null);

export function useBrowserPanelState(): BrowserPanelState {
  const ctx = useContext(BrowserPanelStateCtx);
  if (!ctx) {
    throw new Error('useBrowserPanelState must be used within BrowserPanelStateCtx.Provider');
  }
  return ctx;
}
