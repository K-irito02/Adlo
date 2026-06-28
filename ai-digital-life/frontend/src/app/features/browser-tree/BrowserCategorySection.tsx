import React, { useCallback } from 'react';
import { BrowserTreeEntry } from './BrowserTreeEntry';
import type { BrowserCategoryState, BrowserCategoryType } from './types';

export interface SectionCallbacks {
  onCreateTab: (workspaceId?: string, folderId?: string) => void;
  onDeleteAllChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onDeleteOwnChildTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onOpenAllInNewTabs: (categoryType: BrowserCategoryType, nodePath: string) => void;
  onRemoveFromArea: (workspaceId: string) => void;
  onDeleteDirectory: (folderId: string) => void;
  onRenameDirectory: (folderId: string) => void;
  onDeleteHistory: (level: 'label' | 'year' | 'month' | 'day', nodePath: string) => void;
  onOpenTab: (url: string, tabId?: string) => void;
  // Tab-level operations (for tab leaf nodes in workspace/userFolder trees)
  onRefreshTab: (tabId: string, url: string) => void;
  onEditTab: (tabId: string, name: string, url: string) => void;
  onDeleteTab: (tabId: string, url: string) => void;
  onCopyTabLink: (url: string) => void;
  onOpenTabInNewTab: (url: string, title: string) => void;
  onOpenTabInCurrentTab: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onBookmarkTab?: (url: string, title: string) => void;
}

interface BrowserCategorySectionProps {
  category: BrowserCategoryState;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  browserViewMode?: 'tree' | 'list' | 'all';
  filterTabIds?: Set<string>;
}

export function BrowserCategorySection({
  category,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onOpenFile,
  callbacks,
  counts,
  browserViewMode,
  filterTabIds,
}: BrowserCategorySectionProps) {
  const handleOpenFile = useCallback((path: string) => onOpenFile(path), [onOpenFile]);

  const topLevelCount = category.nodes.length;

  return (
    <div className="adl-browser-category">
      <div className="adl-browser-category__label">
        <span className="adl-browser-category__label-text">{category.label}</span>
        <span className="adl-browser-category__label-count">{topLevelCount}</span>
      </div>
      {(categoryType === 'workspace' || categoryType === 'history') && (
        <div className="adl-browser-category__spacer" />
      )}
      <div className="adl-browser-category__entries">
        {category.nodes.map((node) => (
          <BrowserTreeEntry
            key={node.path}
            node={node}
            categoryType={categoryType}
            expandedPaths={expandedPaths}
            selectedTreePath={selectedTreePath}
            onSelectTreePath={onSelectTreePath}
            onTogglePath={onTogglePath}
            onOpenFile={handleOpenFile}
            callbacks={callbacks}
            counts={counts}
            browserViewMode={browserViewMode}
            filterTabIds={filterTabIds}
          />
        ))}
      </div>
    </div>
  );
}
