import React, { useCallback, useMemo } from 'react';
import { useBrowserTreeData } from './useBrowserTreeData';
import { BrowserCategorySection } from './BrowserCategorySection';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import type { BrowserCategoryType } from './types';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type {
  BrowserTabState,
  TabFolderState,
  BrowserHistoryState,
} from '../../stores/slices/browserSlice';

interface BrowserCategoryLabels {
  workspaceCategory: string;
  userFolderCategory: string;
  historyCategory: string;
}

interface BrowserTabTreeCallbacks {
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  // Tab-level operations
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}

interface BrowserTabTreeProps {
  workspaces: RecentWorkspaceEntry[];
  browserTabs: BrowserTabState[];
  browserTabFolders: TabFolderState[];
  browserHistory: BrowserHistoryState[];
  browserWorkspaceBookmarks: Record<string, string[]>;
  tabTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: BrowserTabTreeCallbacks;
  labels: BrowserCategoryLabels;
  browserViewMode?: 'tree' | 'list' | 'all';
  onlyOpenTabs?: boolean;
}

export function BrowserTabTree({
  workspaces,
  browserTabs,
  browserTabFolders,
  browserHistory,
  browserWorkspaceBookmarks,
  tabTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  labels,
  browserViewMode,
  onlyOpenTabs = false,
}: BrowserTabTreeProps) {
  const categories = useBrowserTreeData(
    workspaces,
    browserTabs,
    browserTabFolders,
    browserHistory,
    browserWorkspaceBookmarks,
    labels
  );

  const openTabIds = useMemo(
    () => (onlyOpenTabs ? new Set(browserTabs.map((t) => t.id)) : undefined),
    [onlyOpenTabs, browserTabs]
  );

  const handleOpenFile = useCallback(
    (nodePath: string) => {
      if (nodePath.startsWith('tab:')) {
        const parts = nodePath.slice('tab:'.length).split(':');
        const tabId = parts[parts.length - 1];
        const tab = browserTabs.find((t) => t.id === tabId);
        if (tab) {
          callbacks.onOpenTab(tab.url, tab.id);
          return;
        }
      }
      if (nodePath.startsWith('history-entry:')) {
        const entryId = nodePath.slice('history-entry:'.length);
        const histEntry = browserHistory.find((h) => h.id === entryId);
        if (histEntry) {
          callbacks.onOpenTab(histEntry.url);
        }
      }
    },
    [browserTabs, browserHistory, callbacks]
  );

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <BrowserCategorySection
        category={categories.workspaceCategory}
        categoryType="workspace"
        expandedPaths={tabTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        onOpenFile={handleOpenFile}
        callbacks={callbacks}
        counts={categories.counts}
        browserViewMode={browserViewMode}
        filterTabIds={openTabIds}
      />
      <BrowserCategorySection
        category={categories.userFolderCategory}
        categoryType="userFolder"
        expandedPaths={tabTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        onOpenFile={handleOpenFile}
        callbacks={callbacks}
        counts={categories.counts}
        browserViewMode={browserViewMode}
        filterTabIds={openTabIds}
      />
      {!onlyOpenTabs && (
        <BrowserCategorySection
          category={categories.historyCategory}
          categoryType="history"
          expandedPaths={tabTreeExpanded}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={onSelectTreePath}
          onTogglePath={onTogglePath}
          onOpenFile={handleOpenFile}
          callbacks={callbacks}
          counts={categories.counts}
          browserViewMode={browserViewMode}
        />
      )}
    </CustomScrollArea>
  );
}
