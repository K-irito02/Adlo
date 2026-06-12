import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconTrash, IconMoreVertical, IconFolder, IconFolderOpen } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import type { CopyDict } from '../../i18n';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import { resolveChildCount } from './useBrowserTreeData';
import type { SectionCallbacks } from './BrowserCategorySection';
import { useTCopy } from '../../i18n/useTCopy';

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
}

function getEntryHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict
): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === 'history') {
    return [{ id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> }];
  }
  return [
    { id: 'create-tab', label: t.browserContextCreateTab, icon: <IconPlus size={12} decorative /> },
    { id: 'delete-all-tabs', label: t.browserContextDeleteAllTabs, icon: <IconTrash size={12} decorative /> },
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

function getChildNodeHoverButtons(
  nodeType: string,
  categoryType: BrowserCategoryType,
  t: CopyDict
): Array<{ id: string; label: string; icon: React.ReactNode }> {
  if (categoryType === 'history') {
    if (nodeType === 'day') {
      return [
        {
          id: 'delete-all-tabs',
          label: t.browserContextDeleteAllTabs,
          icon: <IconTrash size={12} decorative />,
        },
        { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
      ];
    }
    return [];
  }

  if (nodeType === 'folder') {
    return [
      { id: 'create-tab', label: t.browserContextCreateTab, icon: <IconPlus size={12} decorative /> },
      { id: 'delete-all-tabs', label: t.browserContextDeleteAllTabs, icon: <IconTrash size={12} decorative /> },
      { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
    ];
  }

  return [];
}

function getChildNodeMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (categoryType === 'history' && nodeType === 'day') {
    return [
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      {
        id: 'delete-all-tabs',
        label: t.browserContextDeleteAllTabs,
        action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        action: () => callbacks.onDeleteDirectory(nodePath),
      },
    ];
  }

  if (nodeType === 'folder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    return [
      {
        id: 'open-all-tabs',
        label: t.browserContextOpenAllNewTabs,
        action: () => callbacks.onOpenAllInNewTabs(categoryType, nodePath),
      },
      { id: 'rename', label: t.browserContextRename, action: () => callbacks.onRenameDirectory(folderId) },
      {
        id: 'delete-all-tabs',
        label: t.browserContextDeleteAllTabs,
        action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        action: () => callbacks.onDeleteDirectory(folderId),
      },
    ];
  }

  return [];
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
}: BrowserTreeEntryProps) {
  const { t } = useTCopy();
  const isSelected = selectedTreePath === node.path;

  const handleHeaderClick = useCallback(() => {
    // 点击顶级目录同时触发展开/折叠
    onTogglePath(node.path);
    onSelectTreePath(node.path);
  }, [node.path, onSelectTreePath, onTogglePath]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
  } | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
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

  useEffect(() => {
    if (!childMenuState) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="browser-child-menu"]`);
      if (menuEl?.contains(target)) {
        return;
      }
      setChildMenuState(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [childMenuState]);

  const count = counts.get(node.path) ?? 0;

  const entryBtns = getEntryHoverButtons(node.nodeType, categoryType, t);
  const entryMenuItems = getEntryMoreMenuItems(node.nodeType, categoryType, node.path, callbacks, t);

  const renderChildCount = useCallback(
    (childNode: BrowserTreeNode) => resolveChildCount(counts, childNode),
    [counts]
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

  const renderChildMeta = useCallback(
    (childNode: BrowserTreeNode) => {
      const btns = getChildNodeHoverButtons(childNode.nodeType, categoryType, t);
      if (btns.length === 0) {
        return null;
      }
      return (
        <span className="adl-browser-node__actions">
          {btns.map((btn) => (
            <TooltipSimple key={btn.id} content={btn.label} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={(e) => {
                  e.stopPropagation();
                  if (btn.id === 'more') {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setChildMenuState({
                      x: rect.right + 4,
                      y: rect.top,
                      nodePath: childNode.path,
                      nodeType: childNode.nodeType,
                    });
                  } else if (btn.id === 'create-tab') {
                    callbacks.onCreateTab(childNode.workspaceId, childNode.folderId);
                  } else if (btn.id === 'delete-all-tabs') {
                    callbacks.onDeleteAllChildTabs(categoryType, childNode.path);
                  }
                }}
                aria-label={btn.label}
              >
                {btn.icon}
              </button>
            </TooltipSimple>
          ))}
        </span>
      );
    },
    [categoryType, callbacks]
  );

  const handleChildClick = useCallback(
    (path: string) => {
      // 点击子目录时更新选中状态，并且触发展开/折叠
      onSelectTreePath(path);
      onTogglePath(path);
    },
    [onSelectTreePath, onTogglePath]
  );

  const handleChildOpenFile = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      onOpenFile(path);
    },
    [onSelectTreePath, onOpenFile]
  );

  const handleChildContextMenu = useCallback(
    (childNode: BrowserTreeNode) => {
      const items = getChildNodeMoreMenuItems(
        childNode.nodeType,
        categoryType,
        childNode.path,
        callbacks,
        t
      );
      return items.map((item) => ({
        id: item.id,
        label: item.label,
        danger: item.danger,
        action: () => item.action(),
      }));
    },
    [categoryType, callbacks]
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

  const handleMenuItemClick = useCallback(
    (action: () => void) => () => {
      action();
      setMenuOpen(false);
    },
    []
  );

  const handleChildMenuClick = useCallback(
    (action: () => void) => () => {
      action();
      setChildMenuState(null);
    },
    []
  );

  return (
    <div className="adl-browser-entry">
      <div
        className={`adl-browser-entry__header${isSelected ? ' is-selected' : ''}`}
        onClick={handleHeaderClick}
        onContextMenu={handleHeaderContextMenu}
      >
        <div className="adl-browser-entry__expand">
          <button
            type="button"
            className={`adl-browser-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
            onClick={handleExpandBtnClick}
            aria-label={isExpanded ? t.collapse : t.expand}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
          </button>
        </div>
        <div
          className="adl-browser-entry__namezone"
          onKeyDown={handleNameKeyDown}
          role="button"
          tabIndex={0}
        >
          <span className="adl-browser-entry__name" title={node.name}>
            {node.name}
          </span>
          <div className="adl-browser-entry__trailing">
            <span className="adl-browser-entry__count">{count}</span>
            <div className="adl-browser-entry__actions">
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
            </div>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition
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
        : null}

      {isExpanded && node.children.length > 0 ? (
        <div className="adl-browser-entry__tree">
          <FileTree<BrowserTreeNode>
            nodes={node.children}
            selectedFilePath={selectedTreePath ?? undefined}
            expandedPaths={expandedPaths}
            onToggle={handleChildClick}
            onOpenFile={handleChildOpenFile}
            renderMeta={renderChildMeta}
            renderCount={renderChildCount}
            getContextMenuItems={handleChildContextMenu}
            expandLabel={t.expand}
            collapseLabel={t.collapse}
          />
        </div>
      ) : null}

      {isExpanded && node.children.length === 0 ? (
        <div className="adl-browser-entry__empty">
          <span className="adl-empty-hint">{t.noContent}</span>
        </div>
      ) : null}

      {childMenuState
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id="browser-child-menu"
              style={{ top: childMenuState.y, left: childMenuState.x }}
            >
              {getChildNodeMoreMenuItems(
                childMenuState.nodeType,
                categoryType,
                childMenuState.nodePath,
                callbacks,
                t
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={handleChildMenuClick(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
});
