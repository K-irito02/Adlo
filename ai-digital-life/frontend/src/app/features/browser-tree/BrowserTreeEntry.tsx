import React, { useState, useCallback, useRef, useMemo } from 'react';
import { TooltipSimple } from '@components/Tooltip';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import { useTCopy } from '@i18n/useTCopy';
import { MultiTreeEntryShell } from '@features/tree/MultiTreeEntryShell';
import { useBrowserTreeEntryMenu } from './BrowserTreeEntryMenu';
import type { BrowserTreeEntryMenuSlots } from './BrowserTreeEntryMenu';
import { BrowserTreeEntryChildren } from './BrowserTreeEntryChildren';
import { getEntryHoverButtons, getEntryMoreMenuItems } from './browserTreeEntryUtils';

function countAllFileChildren(node: BrowserTreeNode): number {
  return node.children.reduce(
    (n, child) => n + (child.kind === 'file' ? 1 : countAllFileChildren(child)),
    0
  );
}

interface BrowserTreeEntryProps {
  node: BrowserTreeNode;
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

export const BrowserTreeEntry = React.memo(function BrowserTreeEntry({
  node,
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
}: BrowserTreeEntryProps) {
  const { t } = useTCopy();
  const isSelected = selectedTreePath === node.path;

  const handleHeaderClick = useCallback(() => {
    onTogglePath(node.path);
    onSelectTreePath(node.path);
  }, [node.path, onSelectTreePath, onTogglePath]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [contextMenuForTab, setContextMenuForTab] = useState<{
    x: number;
    y: number;
    node: BrowserTreeNode;
  } | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
  const isFlatMode = browserViewMode === 'list' || browserViewMode === 'all';
  const showSeparators = browserViewMode === 'list';
  const menuId = `browser-entry-menu-${node.path}`;
  const entryBtnRef = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (node.nodeType === 'tab') {
        onSelectTreePath(node.path);
        setContextMenuForTab({
          x: e.clientX,
          y: e.clientY,
          node: node,
        });
      } else {
        setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
        setMenuOpen(true);
      }
    },
    [node, onSelectTreePath]
  );

  const count = useMemo(() => {
    if (isFlatMode || node.nodeType === 'history') {
      return countAllFileChildren(node);
    }
    return counts.get(node.path) ?? 0;
  }, [node, isFlatMode, counts]);

  const entryBtns = getEntryHoverButtons(node.nodeType, categoryType, t);
  const entryMenuItems = getEntryMoreMenuItems(
    node.nodeType,
    categoryType,
    node.path,
    callbacks,
    t
  );

  const handleEntryBtnClick = useCallback(
    (buttonId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      switch (buttonId) {
        case 'create-tab':
          callbacks.onCreateTab(node.workspaceId, node.folderId);
          break;
        case 'delete-all-tabs':
          callbacks.onDeleteAllChildTabs(categoryType, node.path);
          break;
        case 'more': {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuPosition({ top: rect.top, left: rect.right + 4 });
          setMenuOpen((prev) => !prev);
          break;
        }
      }
    },
    [callbacks, categoryType, node]
  );

  const handleExpandBtnClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePath(node.path);
    },
    [onTogglePath, node.path]
  );

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onSelectTreePath(node.path);
      }
    },
    [onSelectTreePath, node.path]
  );

  const menuSlots: BrowserTreeEntryMenuSlots = useBrowserTreeEntryMenu({
    node,
    callbacks,
    menuOpen,
    setMenuOpen,
    menuPosition,
    contextMenuForTab,
    setContextMenuForTab,
    entryBtnRef,
    menuId,
    entryMenuItems,
    t,
  });

  const actionButtonsSlot = (
    <>
      {entryBtns.map((btn) => (
        <TooltipSimple key={btn.id} content={btn.label} placement="top">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            ref={(el) => {
              entryBtnRef.current[btn.id] = el;
            }}
            onClick={(e) => handleEntryBtnClick(btn.id, e)}
            aria-label={btn.label}
          >
            {btn.icon}
          </button>
        </TooltipSimple>
      ))}
    </>
  );

  return (
    <MultiTreeEntryShell
      label={node.name}
      isExpanded={isExpanded}
      isSelected={isSelected}
      count={count}
      onHeaderClick={handleHeaderClick}
      onHeaderContextMenu={handleHeaderContextMenu}
      onExpandBtnClick={handleExpandBtnClick}
      onNameKeyDown={handleNameKeyDown}
      expandLabel={t.expand}
      collapseLabel={t.collapse}
      emptyText={t.noContent}
      actionButtonsSlot={actionButtonsSlot}
      entryMenuSlot={menuSlots.entryMenuSlot}
      hasChildren={node.children.length > 0}
    >
      <BrowserTreeEntryChildren
        node={node}
        categoryType={categoryType}
        isExpanded={isExpanded}
        isFlatMode={isFlatMode}
        showSeparators={showSeparators}
        filterTabIds={filterTabIds}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onOpenFile={onOpenFile}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
        counts={counts}
        expandedPaths={expandedPaths}
        tabContextMenuSlot={menuSlots.tabContextMenuSlot}
        setContextMenuForTab={setContextMenuForTab}
      />
    </MultiTreeEntryShell>
  );
});
