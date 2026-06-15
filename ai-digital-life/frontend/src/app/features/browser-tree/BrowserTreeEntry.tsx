import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconTrash, IconMoreVertical } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { CopyDict } from '../../i18n';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import { useTCopy } from '../../i18n/useTCopy';
import { MultiTreeEntryShell } from '../tree/MultiTreeEntryShell';
import { BrowserEntrySubEntries } from './BrowserEntrySubEntries';

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
}

type FlatItem = { type: 'tab'; node: BrowserTreeNode } | { type: 'separator'; label: string };

function buildFlatTabItems(node: BrowserTreeNode, showSeparators: boolean): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of node.children) {
    if (child.kind === 'file') {
      items.push({ type: 'tab', node: child });
    }
  }

  for (const dir of node.children) {
    if (dir.kind !== 'directory') {
      continue;
    }
    const subItems = collectSubDirItems(dir, dir.name, showSeparators);
    if (subItems.length > 0) {
      if (showSeparators) {
        items.push({ type: 'separator', label: dir.name });
      }
      items.push(...subItems);
    }
  }

  return items;
}

function collectSubDirItems(
  dir: BrowserTreeNode,
  pathSoFar: string,
  showSeparators: boolean
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const child of dir.children) {
    if (child.kind === 'file') {
      items.push({ type: 'tab', node: child });
    }
  }

  for (const subDir of dir.children) {
    if (subDir.kind !== 'directory') {
      continue;
    }
    const childPath = `${pathSoFar}/${subDir.name}`;
    const deeper = collectSubDirItems(subDir, childPath, showSeparators);
    if (deeper.length > 0) {
      if (showSeparators) {
        items.push({ type: 'separator', label: childPath });
      }
      items.push(...deeper);
    }
  }

  return items;
}

function getEntryHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict
): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === 'history') {
    return [
      { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
    ];
  }
  return [
    { id: 'create-tab', label: t.browserContextCreateTab, icon: <IconPlus size={12} decorative /> },
    {
      id: 'delete-all-tabs',
      label: t.browserContextDeleteAllTabs,
      icon: <IconTrash size={12} decorative />,
    },
    { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
  ];
}

function getEntryMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (categoryType === 'history') {
    return [
      {
        id: 'delete-history-label',
        label: t.browserContextDeleteAllHistory,
        action: () => callbacks.onDeleteHistory('label', nodePath),
      },
      {
        id: 'delete-history-year',
        label: t.browserDeleteHistoryYearLabel,
        danger: true,
        action: () => callbacks.onDeleteHistory('year', nodePath),
      },
      {
        id: 'delete-history-month',
        label: t.browserDeleteHistoryMonthLabel,
        danger: true,
        action: () => callbacks.onDeleteHistory('month', nodePath),
      },
      {
        id: 'delete-history-day',
        label: t.browserDeleteHistoryDayLabel,
        danger: true,
        action: () => callbacks.onDeleteHistory('day', nodePath),
      },
    ];
  }

  const items: Array<{ id: string; label: string; danger?: boolean; action: () => void }> = [];
  items.push({
    id: 'open-all-tabs',
    label: t.browserContextOpenAllNewTabs,
    action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
  });

  if (nodeType === 'workspace') {
    const wsId = nodePath.startsWith('workspace:') ? nodePath.slice('workspace:'.length) : '';
    items.push({
      id: 'remove-from-area',
      label: t.browserContextRemoveFromView,
      action: () => callbacks.onRemoveFromArea(wsId),
    });
  }

  if (nodeType === 'folder' && categoryType === 'userFolder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    items.push({
      id: 'rename',
      label: t.browserContextRename,
      action: () => callbacks.onRenameDirectory(folderId),
    });
  }

  items.push({
    id: 'delete-all-tabs',
    label: t.browserContextDeleteAllTabs,
    action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
  });

  if (nodeType === 'folder' && categoryType === 'userFolder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    items.push({
      id: 'delete-this-dir',
      label: t.browserContextDeleteDir,
      danger: true,
      action: () => callbacks.onDeleteDirectory(folderId),
    });
  }

  return items;
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
}: BrowserTreeEntryProps) {
  const { t } = useTCopy();
  const isSelected = selectedTreePath === node.path;

  const handleHeaderClick = useCallback(() => {
    onTogglePath(node.path);
    onSelectTreePath(node.path);
  }, [node.path, onSelectTreePath, onTogglePath]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
  const isFlatMode = browserViewMode === 'list' || browserViewMode === 'all';
  const showSeparators = browserViewMode === 'list';
  const menuId = `browser-entry-menu-${node.path}`;
  const entryBtnRef = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
      setMenuOpen(true);
    },
    [setMenuPosition, setMenuOpen]
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const btn = entryBtnRef.current['more'];
      if (btn?.contains(target)) {
        return;
      }
      if (menuEl?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [menuOpen, menuId]);

  const count = counts.get(node.path) ?? 0;

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

  const flatItems = useMemo(
    () => (isFlatMode && isExpanded ? buildFlatTabItems(node, showSeparators) : []),
    [node, isFlatMode, isExpanded, showSeparators]
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
    [onSelectTreePath, onOpenFile, onTogglePath]
  );

  const handleMenuItemClick = useCallback(
    (action: () => void) => () => {
      action();
      setMenuOpen(false);
    },
    []
  );

  const flatChildren =
    isFlatMode && isExpanded && flatItems.length > 0 ? (
      <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
        <ul className="adl-filetree" role="tree">
          {flatItems.map((item) => {
            if (item.type === 'separator') {
              return (
                <li
                  key={`sep-${item.label}`}
                  className="adl-browser-entry__flat-separator"
                  role="separator"
                >
                  <span className="adl-browser-entry__flat-sep-line" />
                  <span className="adl-browser-entry__flat-sep-text">{item.label}</span>
                  <span className="adl-browser-entry__flat-sep-line" />
                </li>
              );
            }
            const isTabSelected = selectedTreePath === item.node.path;
            return (
              <li
                key={item.node.path}
                className={`adl-filetree__item adl-filetree__node--file${isTabSelected ? ' is-selected' : ''}`}
                data-path={item.node.path}
                role="treeitem"
              >
                <div
                  className="adl-filetree__row"
                  onClick={() => handleFlatTabClick(item.node)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelectTreePath(item.node.path);
                  }}
                >
                  <span
                    className="adl-filetree__indent adl-filetree__indent--flat"
                    aria-hidden="true"
                  />
                  <span className="adl-filetree__file-icon adl-filetree__file-icon--default">
                    <span className="adl-filetree__file-badge" aria-hidden="true">
                      TAB
                    </span>
                  </span>
                  <button
                    type="button"
                    className="adl-filetree__label"
                    onClick={() => handleFlatTabClick(item.node)}
                  >
                    <span className="adl-filetree__label-content">
                      <span className="adl-filetree__label-text">{item.node.name}</span>
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

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

  const entryMenuSlot =
    menuOpen && menuPosition
      ? createPortal(
          <div
            className="adl-multitree-entry__menu"
            role="menu"
            data-menu-id={menuId}
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {entryMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                role="menuitem"
                onClick={handleMenuItemClick(item.action)}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

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
      entryMenuSlot={entryMenuSlot}
      hasChildren={node.children.length > 0}
    >
      {isFlatMode ? (
        flatChildren
      ) : (
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
        />
      )}
    </MultiTreeEntryShell>
  );
});
