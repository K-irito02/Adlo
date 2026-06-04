import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/slicedStore';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { useBrowserDragDrop } from './useBrowserDragDrop';
import { useBrowserMenus } from './useBrowserMenus';
import { isTauriShell } from '../../../tauri-bridge';
import type { BrowserPanelProps } from '../../regions/right-panel/types';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { TabFolderState } from '../../stores/slices/browserSlice';

export type BrowserNavigatorMode = 'tabs' | 'bookmarks' | 'history' | 'search';
export type BrowserSearchScope = 'bookmarks' | 'history' | 'all';
export type BrowserTabCategoryType = 'workspace' | 'userFolder' | 'history';

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

export interface UseBrowserPanelReturn {
  browserState: {
    editInputRef: React.RefObject<HTMLInputElement | null>;
    browserMenuRef: React.RefObject<HTMLDivElement | null>;
    navigatorMode: BrowserNavigatorMode;
    browserMenuOpen: boolean;
    addressExpanded: boolean;
    navigatorQuery: string;
    searchScope: BrowserSearchScope;
    contextMenu: ContextMenuState;
    editingTabId: string | null;
    editValue: string;
    isDragging: boolean;
    dragOverTabId: string | null;
    browserTabs: BrowserTabState[];
    browserActiveTabId: string;
    browserNavigatorWidth: number;
    navigatorCollapsed: boolean;
    activeTab?: BrowserTabState;
    hasActiveTab: boolean;
    navigatorTitle: string;
    navigatorCount: number;
    browserMenuItems: BrowserMenuItem[];
    address: string;
    iframeLoadError: boolean;
    iframeHistory: { index: number; entries: string[] };
    webViewActive: boolean;
    isBookmarked: boolean;
    addressSearchRef: React.RefObject<HTMLLabelElement | null>;
    addressInputRef: React.RefObject<HTMLInputElement | null>;
    navigatorSearchRef: React.RefObject<HTMLDivElement | null>;
    navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
    primaryRef: React.RefObject<HTMLDivElement | null>;
    webViewActiveRef: React.MutableRefObject<boolean>;
    creatingRef: React.MutableRefObject<boolean>;
    resizeObserverRef: React.MutableRefObject<ResizeObserver | null>;
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    searchResults: Array<{ title: string; url: string; source: string }>;
    filteredBookmarks: Array<{ title: string; url: string }>;
    filteredHistory: Array<{ title: string; url: string }>;
    browserBookmarks: Array<{ title: string; url: string }>;
    browserTabFolders: TabFolderState[];
    tabTreeExpanded: Record<string, boolean>;
    allTreeExpanded: boolean;
  };
  browserActions: {
    handleCreateTab: (url?: string, title?: string, workspaceId?: string) => void;
    handleSelectTab: (tabId: string) => void;
    handleCloseTab: (tabId: string) => void;
    handleCloseAllTabs: (workspaceId?: string) => void;
    handleTogglePin: () => void;
    handleDoubleClick: (tabId: string, title: string) => void;
    handleEditSubmit: () => void;
    handleEditKeyDown: (e: React.KeyboardEvent) => void;
    handleCopyUrl: () => void;
    handleOpenInNewTab: () => void;
    handleOpenInCurrentTab: () => void;
    toggleNavigator: (tool: string) => void;
    handleNavigatorResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    setNavigatorMode: (mode: BrowserNavigatorMode) => void;
    setBrowserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setEditValue: React.Dispatch<React.SetStateAction<string>>;
    setAddressExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    setNavigatorQuery: React.Dispatch<React.SetStateAction<string>>;
    setSearchScope: React.Dispatch<React.SetStateAction<BrowserSearchScope>>;
    setAddress: React.Dispatch<React.SetStateAction<string>>;
    submitAddress: () => void;
    navigateBrowser: (url: string) => void;
    updateWebViewBounds: () => void;
    handleToggleBookmark: () => void;
    handleToggleBookmarkForTab: (tabId: string, url: string, title: string) => void;
    handleClearHistory: () => void;
    handleIframeLoad: () => void;
    handleIframeError: () => void;
    handleCreateTabInTree: (workspaceId?: string, folderId?: string) => void;
    handleToggleTreePath: (path: string) => void;
    handleDeleteAllChildTabs: (categoryType: string, nodePath: string) => void;
    handleOpenAllInNewTabs: (categoryType: string, nodePath: string) => void;
    handleRemoveFromArea: (workspaceId: string) => void;
    handleDeleteDirectory: (folderId: string) => void;
    handleDeleteHistoryLevel: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
    handleExpandAllTree: () => void;
    handleCollapseAllTree: () => void;
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

function normalizeBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) return '';
  if (/^[a-z]+:\/\/|about:/i.test(input)) {
    return input;
  }
  return `https://${input}`;
}

function looksLikeUrl(value: string): boolean {
  return /^(about:|[a-z]+:\/\/)/i.test(value) || /[./:]/.test(value);
}

function filterBrowserItems<T extends { title: string; url: string }>(
  items: T[],
  query: string
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  return items.filter((item) => {
    const title = item.title.toLowerCase();
    const url = item.url.toLowerCase();
    return title.includes(normalizedQuery) || url.includes(normalizedQuery);
  });
}

const log = (msg: string) => console.log(`[Browser] ${msg}`);

export function computeNavigatorCount(
  navigatorMode: BrowserNavigatorMode,
  query: string,
  browserTabs: BrowserTabState[],
  browserBookmarks: Array<{ title: string; url: string }>,
  browserHistory: Array<{ title: string; url: string; visitedAt: number }>,
  searchResults: Array<{ title: string; url: string; source: string }>,
  filteredBookmarks: Array<{ title: string; url: string }>,
  filteredHistory: Array<{ title: string; url: string }>
): number {
  if (navigatorMode === 'tabs') {
    return browserTabs.length;
  }
  if (navigatorMode === 'search') {
    return searchResults.length;
  }
  if (query.trim()) {
    return navigatorMode === 'bookmarks' ? filteredBookmarks.length : filteredHistory.length;
  }
  if (navigatorMode === 'bookmarks') {
    return browserBookmarks.length;
  }
  if (navigatorMode === 'history') {
    return browserHistory.length;
  }
  return 0;
}

function findFolderByIdLocal(
  folders: Array<{ id: string; children?: unknown[] }>,
  folderId: string
): { id: string; tabs?: string[] } | null {
  for (const folder of folders) {
    if (folder.id === folderId) return folder as { id: string; tabs?: string[] };
    if (Array.isArray(folder.children)) {
      const found = findFolderByIdLocal(
        folder.children as Array<{ id: string; children?: unknown[] }>,
        folderId
      );
      if (found) return found;
    }
  }
  return null;
}

export function useBrowserPanel(
  props: BrowserPanelProps,
  options?: { webViewDisabled?: boolean }
): UseBrowserPanelReturn {
  const { t } = props;
  const webViewDisabled = options?.webViewDisabled ?? false;
  const [navigatorMode, setNavigatorMode] = useState<BrowserNavigatorMode>('tabs');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [navigatorQuery, setNavigatorQuery] = useState('');
  const [searchScope, setSearchScope] = useState<BrowserSearchScope>('all');
  const [address, setAddress] = useState('');
  const [iframeLoadError, setIframeLoadError] = useState(false);
  const [iframeHistory, setIframeHistory] = useState<{ index: number; entries: string[] }>({
    index: -1,
    entries: [],
  });
  const [webViewActive, setWebViewActive] = useState(false);

  const webViewActiveRef = useRef(false);
  const creatingRef = useRef(false);
  const webViewVisibleRef = useRef(true);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    webViewVisibleRef.current = !webViewDisabled;
  }, [webViewDisabled]);

  const browserTabs = useAppStore((state) => state.browserTabs);
  const browserActiveTabId = useAppStore((state) => state.browserActiveTabId);
  const browserNavigatorWidth = useAppStore((state) => state.browserNavigatorWidth);
  const navigatorCollapsedByTool = useAppStore((state) => state.navigatorCollapsedByTool);
  const browserBookmarks = useAppStore((state) => state.browserBookmarks);
  const browserHistory = useAppStore((state) => state.browserHistory);
  const recentWorkspaces = useAppStore((state) => state.recentWorkspaces);
  const browserOpenTab = useAppStore((state) => state.browserOpenTab);
  const browserSelectTab = useAppStore((state) => state.browserSelectTab);
  const browserCloseTab = useAppStore((state) => state.browserCloseTab);
  const browserUpdateTab = useAppStore((state) => state.browserUpdateTab);
  const browserTogglePin = useAppStore((state) => state.browserTogglePin);
  const browserReorderTabs = useAppStore((state) => state.browserReorderTabs);
  const browserCloseAllTabs = useAppStore((state) => state.browserCloseAllTabs);
  const setBrowserNavigatorWidth = useAppStore((state) => state.setBrowserNavigatorWidth);
  const toggleBrowserNavigator = useAppStore((state) => state.toggleBrowserNavigator);
  const browserNavigateActiveTab = useAppStore((state) => state.browserNavigateActiveTab);
  const browserToggleBookmark = useAppStore((state) => state.browserToggleBookmark);
  const browserClearHistory = useAppStore((state) => state.browserClearHistory);
  const browserTabFolders = useAppStore((state) => state.browserTabFolders);
  const browserTabTreeExpanded = useAppStore((state) => state.browserTabTreeExpanded);
  const browserToggleTabTreePath = useAppStore((state) => state.browserToggleTabTreePath);
  const browserExpandAllTreePaths = useAppStore((state) => state.browserExpandAllTreePaths);
  const browserCollapseAllTreePaths = useAppStore((state) => state.browserCollapseAllTreePaths);
  const browserDeleteAllTabsInNode = useAppStore((state) => state.browserDeleteAllTabsInNode);
  const browserDeleteTabFolder = useAppStore((state) => state.browserDeleteTabFolder);
  const browserDeleteHistoryByLevel = useAppStore((state) => state.browserDeleteHistoryByLevel);

  const editInputRef = useRef<HTMLInputElement | null>(null);
  const browserMenuRef = useRef<HTMLDivElement | null>(null);
  const addressSearchRef = useRef<HTMLLabelElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const navigatorSearchRef = useRef<HTMLDivElement | null>(null);
  const navigatorSearchInputRef = useRef<HTMLInputElement | null>(null);
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const activeTab = useMemo(
    () => browserTabs.find((tab) => tab.id === browserActiveTabId) ?? browserTabs[0],
    [browserActiveTabId, browserTabs]
  );

  const hasActiveTab = activeTab != null;
  const isBookmarked = browserBookmarks.some((bookmark) => bookmark.url === activeTab?.url);

  const quickLinks = useMemo(
    () => [
      { title: t.browserLocalPreview, url: 'http://localhost:5173/' },
      { title: t.browserBlankTab, url: 'about:blank' },
    ],
    [t.browserBlankTab, t.browserLocalPreview]
  );

  const browserLookupIndex = useMemo(() => {
    const seen = new Set<string>();
    return [...quickLinks, ...browserBookmarks, ...browserHistory, ...browserTabs].filter(
      (item) => {
        const key = `${item.title}::${item.url}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      }
    );
  }, [browserBookmarks, browserHistory, browserTabs, quickLinks]);

  const filteredBookmarks = useMemo(
    () => filterBrowserItems(browserBookmarks, navigatorQuery),
    [browserBookmarks, navigatorQuery]
  );
  const filteredHistory = useMemo(
    () => filterBrowserItems(browserHistory, navigatorQuery),
    [browserHistory, navigatorQuery]
  );
  const searchResults = useMemo(() => {
    if (searchScope === 'bookmarks') {
      return filteredBookmarks.map((item) => ({ ...item, source: t.browserSavedTabs }));
    }
    if (searchScope === 'history') {
      return filteredHistory.map((item) => ({ ...item, source: t.browserHistoryTabs }));
    }
    const merged = new Map<string, { title: string; url: string; source: string }>();
    for (const item of filteredBookmarks) {
      merged.set(`bookmark:${item.url}`, { ...item, source: t.browserSavedTabs });
    }
    for (const item of filteredHistory) {
      const key = `history:${item.url}:${item.title}`;
      merged.set(key, { ...item, source: t.browserHistoryTabs });
    }
    return [...merged.values()];
  }, [filteredBookmarks, filteredHistory, searchScope, t.browserHistoryTabs, t.browserSavedTabs]);

  const navigatorItemsCount =
    navigatorMode === 'bookmarks'
      ? browserBookmarks.length
      : navigatorMode === 'history'
        ? browserHistory.length
        : 0;
  const navigatorCount = computeNavigatorCount(
    navigatorMode,
    navigatorQuery,
    browserTabs,
    browserBookmarks,
    browserHistory,
    searchResults,
    filteredBookmarks,
    filteredHistory
  );

  const navigatorTitle =
    navigatorMode === 'tabs'
      ? t.browserOpenTabs
      : navigatorMode === 'bookmarks'
        ? t.browserSavedTabs
        : navigatorMode === 'history'
          ? t.browserHistoryTabs
          : t.browserSearchTabs;

  const allTreeExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );
    const wsPaths = visible.map((w) => `workspace:${w.id}`);
    const folderPaths = browserTabFolders.filter((f) => !f.parentId).map((f) => `folder:${f.id}`);
    const allEntryPaths = [...wsPaths, ...folderPaths];
    if (browserHistory.length > 0) {
      allEntryPaths.push('history:root');
    }
    if (allEntryPaths.length === 0) return false;
    return allEntryPaths.every((p) => browserTabTreeExpanded[p] ?? false);
  }, [recentWorkspaces, browserTabFolders, browserHistory, browserTabTreeExpanded]);

  const browserMenuItems = useMemo(
    () => [
      {
        id: 'hard-reload',
        label: t.browserHardReload,
        action: () => browserNavigateActiveTab(activeTab?.url ?? 'about:blank', activeTab?.title),
      },
      {
        id: 'copy-url',
        label: t.browserCopyCurrentUrl,
        action: () => void navigator.clipboard?.writeText(activeTab?.url ?? 'about:blank'),
      },
      { id: 'sep-1', separator: true as const },
      { id: 'clear-history', label: t.browserClearHistory, action: browserClearHistory },
      { id: 'clear-cookies', label: t.browserClearCookies, disabled: true },
      { id: 'clear-cache', label: t.browserClearCache, disabled: true },
      { id: 'devtools', label: t.browserDeveloperTools, disabled: true },
      { id: 'sep-2', separator: true as const },
      { id: 'zoom-in', label: t.menuZoomIn, disabled: true },
      { id: 'zoom-out', label: t.menuZoomOut, disabled: true },
      { id: 'zoom-reset', label: t.menuResetZoom, disabled: true },
    ],
    [activeTab, browserClearHistory, t]
  );

  const handleDoubleClick = useCallback((tabId: string, title: string) => {
    setEditValue(title);
    setEditingTabId(tabId);
  }, []);

  const handleCreateTab = useCallback(
    (url?: string, title?: string, workspaceId?: string) => {
      browserOpenTab(url, title, workspaceId);
    },
    [browserOpenTab]
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      browserSelectTab(tabId);
    },
    [browserSelectTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      browserCloseTab(tabId);
    },
    [browserCloseTab]
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      browserCloseAllTabs(workspaceId);
    },
    [browserCloseAllTabs]
  );

  const navigateBrowser = useCallback((url: string) => {
    if (isTauriShell()) {
      return;
    }
    if (iframeRef.current) {
      setIframeHistory((prev) => {
        const newEntries = prev.entries.slice(0, prev.index + 1);
        newEntries.push(url);
        if (newEntries.length > 50) newEntries.shift();
        return { index: newEntries.length - 1, entries: newEntries };
      });
      iframeRef.current.src = url;
    }
  }, []);

  const updateWebViewBounds = useCallback(() => {
    if (!primaryRef.current || !webViewActiveRef.current || !isTauriShell()) return;
    if (!webViewVisibleRef.current) return;

    const rect = primaryRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    invoke('browser_set_bounds', { bounds }).catch((err) => {
      log(`set_bounds 失败: ${err}`);
    });
  }, []);

  const submitAddress = useCallback(() => {
    const input = address.trim();
    if (!input) {
      return;
    }
    const normalizedInput = input.toLowerCase();
    const matchedItem =
      browserLookupIndex.find(
        (item) =>
          item.title.toLowerCase() === normalizedInput || item.url.toLowerCase() === normalizedInput
      ) ??
      (!looksLikeUrl(input)
        ? browserLookupIndex.find(
            (item) =>
              item.title.toLowerCase().includes(normalizedInput) ||
              item.url.toLowerCase().includes(normalizedInput)
          )
        : undefined);
    if (matchedItem) {
      browserNavigateActiveTab(matchedItem.url, matchedItem.title);
      setAddress(matchedItem.url);
      navigateBrowser(matchedItem.url);
      return;
    }
    const finalUrl = normalizeBrowserUrl(input);
    browserNavigateActiveTab(finalUrl);
    navigateBrowser(finalUrl);
  }, [address, browserLookupIndex, browserNavigateActiveTab, navigateBrowser]);

  const handleToggleBookmark = useCallback(() => {
    browserToggleBookmark();
  }, [browserToggleBookmark]);

  const handleToggleBookmarkForTab = useCallback(
    (tabId: string, url: string, title: string) => {
      // 切换特定标签页的收藏状态
      browserToggleBookmark({ url, title });
    },
    [browserToggleBookmark]
  );

  const handleIframeLoad = useCallback(() => {
    setIframeLoadError(false);
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow) {
        const href = iframeWindow.location.href;
        if (href && href !== 'about:blank' && activeTab && href !== activeTab.url) {
          setAddress(href);
          browserNavigateActiveTab(href);
        } else if (href && href !== 'about:blank' && activeTab) {
          try {
            const iframeTitle = iframeWindow.document?.title;
            if (iframeTitle && iframeTitle !== activeTab.title) {
              browserUpdateTab(activeTab.id, { title: iframeTitle });
            }
          } catch {
            /* cross-origin, can't read title */
          }
        }
      }
    } catch {
      /* cross-origin navigation, can't read URL */
    }
  }, [activeTab, browserNavigateActiveTab, browserUpdateTab]);

  const handleIframeLoadRef = useRef(handleIframeLoad);

  useEffect(() => {
    handleIframeLoadRef.current = handleIframeLoad;
  }, [handleIframeLoad]);

  useEffect(() => {
    const node = iframeRef.current;
    if (!node) return;
    const handler = () => handleIframeLoadRef.current();
    node.addEventListener('load', handler);
    return () => node.removeEventListener('load', handler);
  }, [activeTab?.url]);

  const handleIframeError = useCallback(() => {
    setIframeLoadError(true);
  }, []);

  const handleClearHistory = useCallback(() => {
    browserClearHistory();
  }, [browserClearHistory]);

  const handleCreateTabInTree = useCallback(
    (workspaceId?: string, folderId?: string) => {
      browserOpenTab(undefined, undefined, workspaceId);
    },
    [browserOpenTab]
  );

  const handleToggleTreePath = useCallback(
    (path: string) => {
      browserToggleTabTreePath(path);
    },
    [browserToggleTabTreePath]
  );

  const handleDeleteAllChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      browserDeleteAllTabsInNode(nodePath);
    },
    [browserDeleteAllTabsInNode]
  );

  const handleOpenAllInNewTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        tabs.forEach((tab) => browserOpenTab(tab.url, tab.title, tab.workspaceId));
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserTabFolders as Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
          folderId
        );
        if (folder?.tabs) {
          folder.tabs.forEach((tabId) => {
            const tab = state.browserTabs.find((t) => t.id === tabId);
            if (tab) browserOpenTab(tab.url, tab.title, tab.workspaceId);
          });
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        state.browserHistory
          .filter((h) => {
            const d = new Date(h.visitedAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` === dayDate;
          })
          .forEach((h) => browserOpenTab(h.url, h.title));
      }
    },
    [browserOpenTab]
  );

  const handleRemoveFromArea = useCallback((workspaceId: string) => {
    useAppStore.getState().hideWorkspaceFromRightPanels(workspaceId);
  }, []);

  const handleDeleteDirectory = useCallback(
    (folderId: string) => {
      if (folderId.startsWith('history:')) {
        browserDeleteAllTabsInNode(folderId);
      } else {
        const actualId = folderId.startsWith('folder:')
          ? folderId.slice('folder:'.length)
          : folderId;
        browserDeleteTabFolder(actualId);
      }
    },
    [browserDeleteTabFolder, browserDeleteAllTabsInNode]
  );

  const handleDeleteHistoryLevel = useCallback(
    (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => {
      browserDeleteHistoryByLevel(level, nodePath);
    },
    [browserDeleteHistoryByLevel]
  );

  const handleExpandAllTree = useCallback(() => {
    const state = useAppStore.getState();
    const paths: string[] = [];
    const workspaces = state.recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );
    for (const ws of workspaces) {
      paths.push(`workspace:${ws.id}`);
    }
    for (const folder of state.browserTabFolders) {
      paths.push(`folder:${folder.id}`);
    }
    if (state.browserHistory.length > 0) {
      paths.push('history:root');
    }
    browserExpandAllTreePaths(paths);
  }, [browserExpandAllTreePaths]);

  const handleCollapseAllTree = useCallback(() => {
    browserCollapseAllTreePaths();
  }, [browserCollapseAllTreePaths]);

  const { isDragging, dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useBrowserDragDrop(browserTabs, browserReorderTabs);

  const {
    contextMenu,
    handleContextMenu,
    handleTogglePin,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  } = useBrowserMenus({
    t,
    activeTab,
    handleCloseTab,
    handleDoubleClick,
  });

  const toggleNavigator = useCallback(
    (tool: string) => {
      if (tool === 'browser') {
        toggleBrowserNavigator();
      }
    },
    [toggleBrowserNavigator]
  );

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setBrowserNavigatorWidth,
    minWidth: 180,
    maxWidth: 300,
  });

  const handleEditSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      browserUpdateTab(editingTabId, { title: editValue.trim() });
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, browserUpdateTab]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleEditSubmit]
  );

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  useEffect(() => {
    const url = activeTab?.url ?? '';
    requestAnimationFrame(() => {
      setAddress(url);
      setIframeLoadError(false);
    });

    // 在浏览器模式下更新 iframe 历史
    if (!isTauriShell() && url && url !== '') {
      requestAnimationFrame(() => {
        setIframeHistory((prev) => {
          // 避免重复添加相同的 URL
          if (prev.entries[prev.index] === url) {
            return prev;
          }
          const newEntries = prev.entries.slice(0, prev.index + 1);
          newEntries.push(url);
          if (newEntries.length > 50) newEntries.shift();
          return { index: newEntries.length - 1, entries: newEntries };
        });
      });
    }
  }, [activeTab?.url]);

  useEffect(() => {
    if (!isTauriShell()) return;
    if (!webViewActiveRef.current) return;
    if (webViewDisabled) {
      invoke('browser_set_bounds', {
        bounds: { x: -10000, y: -10000, width: 1, height: 1 },
      }).catch(console.error);
    } else {
      updateWebViewBounds();
    }
  }, [webViewDisabled, updateWebViewBounds]);

  const isBrowserVisible = props.isVisible;
  const isBrowserVisibleRef = useRef(isBrowserVisible);

  useEffect(() => {
    isBrowserVisibleRef.current = isBrowserVisible;
  }, [isBrowserVisible]);

  useEffect(() => {
    if (!isTauriShell()) return;
    if (!webViewActiveRef.current) return;

    if (isBrowserVisible) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateWebViewBounds();
        });
      });
    } else {
      invoke('browser_set_bounds', {
        bounds: { x: 32767, y: 32767, width: 1, height: 1 },
      }).catch(console.error);
    }
  }, [isBrowserVisible, updateWebViewBounds, webViewActive]);

  useEffect(() => {
    if (!isTauriShell()) return;

    if (webViewDisabled) return;

    const url = activeTab?.url ?? 'about:blank';
    if (url === 'about:blank' || url.trim() === '') return;

    if (webViewActiveRef.current) {
      invoke('browser_navigate', { url }).catch((err) => {
        log(`navigate 失败: ${err}`);
      });
      return;
    }

    if (creatingRef.current) return;
    creatingRef.current = true;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('browser_create 超时(10s)')), 10000)
    );

    Promise.race([invoke('browser_create', { url }), timeout])
      .then(() => {
        webViewActiveRef.current = true;
        creatingRef.current = false;
        setWebViewActive(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateWebViewBounds();
          });
        });
      })
      .catch((err) => {
        creatingRef.current = false;
        log(`browser_create 失败: ${err}`);
        console.error('Failed to create browser WebView:', err);
      });
  }, [activeTab?.id, activeTab?.url, updateWebViewBounds]);

  useEffect(() => {
    return () => {
      if (isTauriShell() && webViewActiveRef.current) {
        invoke('browser_destroy').catch(console.error);
        webViewActiveRef.current = false;
      }
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      if (webViewActiveRef.current && isBrowserVisibleRef.current) {
        updateWebViewBounds();
      }
    });

    resizeObserverRef.current.observe(primaryRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [updateWebViewBounds]);

  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded && navigatorMode !== 'search') {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!browserMenuRef.current?.contains(target)) {
        setBrowserMenuOpen(false);
      }
      if (!addressSearchRef.current?.contains(target)) {
        setAddressExpanded(false);
      }
      if (navigatorMode === 'search' && !navigatorSearchRef.current?.contains(target)) {
        setNavigatorMode('bookmarks');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [addressExpanded, browserMenuOpen, navigatorMode]);

  useEffect(() => {
    if (addressExpanded) {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [addressExpanded]);

  useEffect(() => {
    if (navigatorMode === 'search') {
      navigatorSearchInputRef.current?.focus();
      navigatorSearchInputRef.current?.select();
    }
  }, [navigatorMode]);

  // Listen to URL changes and update address bar and tab info
  useEffect(() => {
    if (!isTauriShell()) return;

    const browser = window.digitalLife?.browser;
    if (!browser) return;

    const unsubscribe = browser.onUrlChanged((url) => {
      setAddress(url);
      browserNavigateActiveTab(url);
    });

    return unsubscribe;
  }, [browserNavigateActiveTab, setAddress]);

  return {
    browserState: {
      editInputRef,
      browserMenuRef,
      navigatorMode,
      browserMenuOpen,
      addressExpanded,
      navigatorQuery,
      searchScope,
      contextMenu,
      editingTabId,
      editValue,
      isDragging,
      dragOverTabId,
      browserTabs,
      browserActiveTabId,
      browserNavigatorWidth,
      navigatorCollapsed: navigatorCollapsedByTool.browser ?? false,
      activeTab,
      hasActiveTab,
      navigatorTitle,
      navigatorCount,
      browserMenuItems,
      address,
      iframeLoadError,
      iframeHistory,
      webViewActive,
      isBookmarked,
      addressSearchRef,
      addressInputRef,
      navigatorSearchRef,
      navigatorSearchInputRef,
      primaryRef,
      webViewActiveRef,
      creatingRef,
      resizeObserverRef,
      iframeRef,
      searchResults,
      filteredBookmarks,
      filteredHistory,
      browserBookmarks,
      browserTabFolders,
      tabTreeExpanded: browserTabTreeExpanded,
      allTreeExpanded,
    },
    browserActions: {
      handleCreateTab,
      handleSelectTab,
      handleCloseTab,
      handleCloseAllTabs,
      handleTogglePin,
      handleDoubleClick,
      handleEditSubmit,
      handleEditKeyDown,
      handleCopyUrl: handleCopyUrlFromMenu,
      handleOpenInNewTab,
      handleOpenInCurrentTab,
      toggleNavigator,
      handleNavigatorResizeStart,
      setNavigatorMode,
      setBrowserMenuOpen,
      setEditValue,
      setAddressExpanded,
      setNavigatorQuery,
      setSearchScope,
      setAddress,
      submitAddress,
      navigateBrowser,
      updateWebViewBounds,
      handleToggleBookmark,
      handleToggleBookmarkForTab,
      handleIframeLoad,
      handleIframeError,
      handleClearHistory,
      handleCreateTabInTree,
      handleToggleTreePath,
      handleDeleteAllChildTabs,
      handleOpenAllInNewTabs,
      handleRemoveFromArea,
      handleDeleteDirectory,
      handleDeleteHistoryLevel,
      handleExpandAllTree,
      handleCollapseAllTree,
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
