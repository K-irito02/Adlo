import { createRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserPanelActionsCtx, type BrowserPanelActions } from './BrowserPanelActionsContext';
import { BrowserPanelStateCtx, type BrowserPanelState } from './BrowserPanelStateContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';

vi.mock('./BrowserNavOpenMode', () => ({
  BrowserNavOpenMode: () => <div data-testid="open-mode" />,
}));

vi.mock('./BrowserNavTabsMode', () => ({
  BrowserNavTabsMode: () => <div data-testid="tabs-mode" />,
}));

vi.mock('./BrowserNavListMode', () => ({
  BrowserNavListMode: () => <div data-testid="list-mode" />,
}));

vi.mock('./BrowserNavSearchMode', () => ({
  BrowserNavSearchMode: () => <div data-testid="search-mode" />,
}));

const t = {
  toolBrowser: 'Browser',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  browserOpenTabs: 'Open tabs',
  browserTabDir: 'Tab directory',
  browserViewModeList: 'File list',
  browserSearchTabs: 'Search tabs',
  browserNewBookmark: 'New bookmark',
  browserNewTabAlways: 'Always new tab',
  browserClearAllOpenTabs: 'Close all open tabs',
  browserSelectDirFirst: 'Select a directory first',
  browserNewTabPage: 'New tab page',
  browserCreateDir: 'New directory',
  browserDeleteAllBookmarks: 'Delete all bookmarks',
  browserDeleteAllBookmarksConfirmTitle: 'Confirm delete bookmarks',
  browserDeleteAllBookmarksConfirmMessage: 'This deletes bookmarks but keeps folders.',
  browserDeleteAllBookmarksConfirmAction: 'Delete bookmarks',
  browserCategoryWorkspace: 'Workspace',
  browserCategoryUserFolder: 'Custom',
  browserCategoryHistory: 'History',
  browserSearchBookmarks: 'Bookmarks',
  browserSearchHistory: 'History',
  browserSearchAll: 'All',
  searchPlaceholder: 'Search',
  search: 'Search',
  searchNoResults: 'No results',
  searchBookmarkHistoryHint: 'Search bookmarks and history',
  searchBookmarksHint: 'Search saved tabs',
  searchHistoryHint: 'Search history tabs',
  resizeLabel: 'Resize',
  cancel: 'Cancel',
  confirm: 'Confirm',
} as unknown as CopyDict;

function makeActions(overrides: Partial<BrowserPanelActions> = {}): BrowserPanelActions {
  return {
    handleCloseTab: vi.fn(),
    handleCloseAllTabs: vi.fn(),
    handleClearTabDirectories: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleOpenBookmarkDialog: vi.fn(),
    handleEditTab: vi.fn(),
    handleSetCreateTabDialog: vi.fn(),
    setCreateDirDialog: vi.fn(),
    setRenameFolderState: vi.fn(),
    setNavigatorQuery: vi.fn(),
    setSearchScope: vi.fn(),
    handleToggleTreePath: vi.fn(),
    handleDeleteAllChildTabs: vi.fn(),
    handleDeleteOwnChildTabs: vi.fn(),
    handleOpenAllInNewTabs: vi.fn(),
    handleRemoveFromArea: vi.fn(),
    handleDeleteDirectory: vi.fn(),
    handleDeleteHistoryLevel: vi.fn(),
    handleExpandAllTree: vi.fn(),
    handleCollapseAllTree: vi.fn(),
    handleRefreshTab: vi.fn(),
    handleDeleteTab: vi.fn(),
    handleCopyTabLink: vi.fn(),
    handleOpenTabInNewTab: vi.fn(),
    handleOpenTabInCurrentTab: vi.fn(),
    setBrowserMenuOpen: vi.fn(),
    handleOpenTabFromTree: vi.fn(),
    handleIframeLoad: vi.fn(),
    handleIframeError: vi.fn(),
    handleGoBack: vi.fn(),
    handleGoForward: vi.fn(),
    handleReload: vi.fn(),
    canGoBack: false,
    canGoForward: false,
    setNavigatorMode: vi.fn(),
    handleSelectTreePath: vi.fn(),
    showToast: vi.fn(),
    browserOpenTab: vi.fn(),
    handleToggleNavigateMode: vi.fn(),
    handleAlwaysNewTab: vi.fn(),
    toggleNavigator: vi.fn(),
    ...overrides,
  };
}

function makeState(
  navigatorMode: BrowserPanelState['navigatorMode'],
  searchScope: BrowserPanelState['searchScope'] = 'all',
): BrowserPanelState {
  return {
    t,
    isBrowserVisible: true,
    activeTab: undefined,
    hasActiveTab: false,
    isBookmarked: false,
    browserTabs: [],
    browserBookmarkFolders: [],
    tabTreeExpanded: {},
    allTreeExpanded: false,
    navigatorQuery: '',
    searchScope,
    searchResults: [],
    browserMenuOpen: false,
    browserMenuRef: createRef<HTMLDivElement>(),
    browserMenuItems: [],
    loadingTabId: null,
    evictedTabIds: new Set<string>(),
    iframeRef: createRef<HTMLIFrameElement>(),
    primaryRef: createRef<HTMLDivElement>(),
    iframeBlockedDetected: false,
    iframeLoadError: false,
    isEmbedPending: false,
    validatedUrlsRef: { current: new Set<string>() },
    navigatorMode,
    navigatorSearchRef: createRef<HTMLDivElement>(),
    navigatorSearchInputRef: createRef<HTMLInputElement>(),
    selectedTreePath: null,
    selectedTreePathRef: { current: null },
    activatedTabIdsRef: { current: new Set<string>() },
    urlState: {
      address: '',
      addressExpanded: false,
      addressSearchRef: createRef<HTMLLabelElement>(),
      addressInputRef: createRef<HTMLInputElement>(),
      searchQueryDisplay: '',
      handleAddressChange: vi.fn(),
      handleAddressKeyDown: vi.fn(),
      handleAddressBlur: vi.fn(),
      handleSearchClick: vi.fn(),
      handlePlusClick: vi.fn(),
    },
    navigatorCollapsed: false,
    browserNavigatorWidth: 240,
    visibleWorkspaces: [],
    handlePointerDown: vi.fn(),
    openTabCount: 0,
    navigatorTitle: 'Browser',
  };
}

function renderNavigator(
  navigatorMode: BrowserPanelState['navigatorMode'],
  actions = makeActions(),
  searchScope: BrowserPanelState['searchScope'] = 'all',
) {
  useAppStore.setState({
    browserBookmarks: [],
    browserHistory: [],
    browserWorkspaceBookmarks: {},
    setBrowserNavigatorWidth: vi.fn(),
    browserSelectTab: vi.fn(),
  });

  render(
    <TCopyProvider t={t} locale="en-US">
      <BrowserPanelStateCtx.Provider value={makeState(navigatorMode, searchScope)}>
        <BrowserPanelActionsCtx.Provider value={actions}>
          <BrowserNavigator />
        </BrowserPanelActionsCtx.Provider>
      </BrowserPanelStateCtx.Provider>
    </TCopyProvider>,
  );

  return actions;
}

describe('BrowserNavigator new-directory affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the new-directory button reachable in list mode', () => {
    renderNavigator('list');
    expect(screen.getByRole('button', { name: 'New directory' })).toBeTruthy();
  });
});

describe('BrowserNavigator bookmark delete confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a confirmation dialog before deleting all bookmarks in tabs mode', () => {
    const actions = renderNavigator('tabs');

    fireEvent.click(screen.getByRole('button', { name: 'Delete all bookmarks' }));

    expect(screen.getByRole('dialog', { name: 'Confirm delete bookmarks' })).toBeInTheDocument();
    expect(actions.handleClearTabDirectories).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete bookmarks' }));

    expect(actions.handleClearTabDirectories).toHaveBeenCalledTimes(1);
  });

  it('cancels bookmark deletion from list mode without clearing bookmarks', () => {
    const actions = renderNavigator('list');

    fireEvent.click(screen.getByRole('button', { name: 'Delete all bookmarks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(actions.handleClearTabDirectories).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Confirm delete bookmarks' })).toBeNull();
  });

  it('keeps close-all-open-tabs immediate in open mode', () => {
    const actions = renderNavigator('open');

    fireEvent.click(screen.getByRole('button', { name: 'Close all open tabs' }));

    expect(actions.handleCloseAllTabs).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Confirm delete bookmarks' })).toBeNull();
  });

  it.each([
    ['bookmarks', 'Search saved tabs'],
    ['history', 'Search history tabs'],
    ['all', 'Search bookmarks and history'],
  ] as const)('shows scope hint "%s" for empty search query', (scope, hint) => {
    renderNavigator('search', makeActions(), scope);

    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('toggles active bookmarks scope back to all on repeat click', () => {
    const actions = renderNavigator('search', makeActions(), 'bookmarks');

    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));

    expect(actions.setSearchScope).toHaveBeenCalledWith('all');
  });
});
