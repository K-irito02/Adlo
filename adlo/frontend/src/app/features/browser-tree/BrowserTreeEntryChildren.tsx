import React, { useCallback, useMemo } from 'react';
import { BrowserTreeEntryFlatList } from './BrowserTreeEntryFlatList';
import { BrowserEntrySubEntries } from './BrowserEntrySubEntries';
import { buildFlatTabItems } from './browserTreeEntryUtils';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';

interface BrowserTreeEntryChildrenProps {
  node: BrowserTreeNode;
  categoryType: BrowserCategoryType;
  isExpanded: boolean;
  isFlatMode: boolean;
  showSeparators: boolean;
  filterTabIds?: Set<string>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onOpenFile: (path: string) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  expandedPaths: Record<string, boolean>;
  tabContextMenuSlot: React.ReactNode;
  setContextMenuForTab: (ctx: { x: number; y: number; node: BrowserTreeNode } | null) => void;
}

export const BrowserTreeEntryChildren = React.memo(function BrowserTreeEntryChildren({
  node,
  categoryType,
  isExpanded,
  isFlatMode,
  showSeparators,
  filterTabIds,
  selectedTreePath,
  onSelectTreePath,
  onOpenFile,
  onTogglePath,
  callbacks,
  counts,
  expandedPaths,
  tabContextMenuSlot,
  setContextMenuForTab,
}: BrowserTreeEntryChildrenProps) {
  const flatItems = useMemo(
    () => (isFlatMode && isExpanded ? buildFlatTabItems(node, showSeparators, filterTabIds) : []),
    [node, isFlatMode, isExpanded, showSeparators, filterTabIds],
  );

  const handleFlatTabClick = useCallback(
    (tabNode: BrowserTreeNode) => {
      onSelectTreePath(tabNode.path);
      if (tabNode.kind === 'file') {
        onOpenFile(tabNode.path);
      } else {
        onTogglePath(tabNode.path);
      }
    },
    [onSelectTreePath, onOpenFile, onTogglePath],
  );

  if (isFlatMode) {
    const flatChildren =
      isExpanded && flatItems.length > 0 ? (
        <BrowserTreeEntryFlatList
          flatItems={flatItems}
          selectedTreePath={selectedTreePath}
          onFlatTabClick={handleFlatTabClick}
          onTabContextMenu={(x, y, tabNode) => {
            onSelectTreePath(tabNode.path);
            setContextMenuForTab({ x, y, node: tabNode });
          }}
          onRefreshTab={callbacks.onRefreshTab}
          onCloseTab={callbacks.onCloseTab}
        />
      ) : null;

    return (
      <>
        {flatChildren}
        {tabContextMenuSlot}
      </>
    );
  }

  return (
    <BrowserEntrySubEntries
      node={node}
      categoryType={categoryType}
      expandedPaths={expandedPaths}
      selectedTreePath={selectedTreePath}
      onSelectTreePath={onSelectTreePath}
      onTogglePath={onTogglePath}
      onOpenFile={onOpenFile}
      callbacks={callbacks}
      counts={counts}
      filterTabIds={filterTabIds}
    />
  );
});
