import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconMoreVertical, IconRefreshCw } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { BrowserFavicon } from '../../components/BrowserFavicon';
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
    { id: 'more', label: t.browserContextMore, icon: <IconMoreVertical size={12} decorative /> },
  ];
}

function getEntryMoreMenuItems(
  nodeType: string,
  categoryType: BrowserCategoryType,
  nodePath: string,
  callbacks: SectionCallbacks,
  t: CopyDict
): Array<{ id: string; label: string; danger?: boolean; hint?: string; action: () => void }> {
  if (categoryType === 'history') {
    return [
      {
        id: 'delete-history-label',
        label: t.browserContextDeleteAllHistory,
        danger: true,
        hint: t.browserDeleteHistoryLabelHint,
        action: () => callbacks.onDeleteHistory('label', nodePath),
      },
      {
        id: 'delete-history-year',
        label: t.browserDeleteHistoryYearLabel,
        danger: true,
        hint: t.browserDeleteHistoryYearHint,
        action: () => callbacks.onDeleteHistory('year', nodePath),
      },
      {
        id: 'delete-history-month',
        label: t.browserDeleteHistoryMonthLabel,
        danger: true,
        hint: t.browserDeleteHistoryMonthHint,
        action: () => callbacks.onDeleteHistory('month', nodePath),
      },
      {
        id: 'delete-history-day',
        label: t.browserDeleteHistoryDayLabel,
        danger: true,
        hint: t.browserDeleteHistoryDayHint,
        action: () => callbacks.onDeleteHistory('day', nodePath),
      },
    ];
  }

  const items: Array<{
    id: string;
    label: string;
    danger?: boolean;
    hint?: string;
    action: () => void;
  }> = [];
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
    danger: true,
    hint: t.browserDeleteAllTabsHint,
    action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
  });

  items.push({
    id: 'delete-self-tabs',
    label: t.browserContextDeleteSelfTabs,
    danger: true,
    hint: t.browserDeleteSelfTabsHint,
    action: () => callbacks.onDeleteOwnChildTabs(categoryType, nodePath),
  });

  if (nodeType === 'folder' && categoryType === 'userFolder') {
    const folderId = nodePath.startsWith('folder:') ? nodePath.slice('folder:'.length) : '';
    items.push({
      id: 'delete-this-dir',
      label: t.browserContextDeleteDir,
      danger: true,
      hint: t.browserDeleteDirHint,
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
  const hintElementsRef = useRef<HTMLElement[]>([]);

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
    [node, onSelectTreePath, setMenuPosition, setMenuOpen, setContextMenuForTab]
  );

  const hideHint = useCallback(() => {
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
  }, []);

  const showHint = useCallback(
    (e: React.MouseEvent, hintText: string) => {
      const buttonEl = (e.target as HTMLElement).closest('button');
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const originalTitle = buttonEl?.getAttribute('title');
      if (originalTitle) {
        buttonEl?.setAttribute('data-original-title', originalTitle);
        buttonEl?.removeAttribute('title');
      }
      const btnRect = buttonEl?.getBoundingClientRect();
      const menuRect = menuEl?.getBoundingClientRect();
      if (btnRect && menuRect) {
        const centerY = btnRect.top + btnRect.height / 2;
        const card = document.createElement('div');
        card.className = 'adl-sub-hint-card';
        card.textContent = hintText;
        card.style.left = `${menuRect.right + 1}px`;
        card.style.top = `${centerY}px`;
        card.style.transform = 'translateY(-50%)';
        const arrow = document.createElement('div');
        arrow.className = 'adl-sub-hint-card__arrow';
        arrow.style.left = `${menuRect.right - 4}px`;
        arrow.style.top = `${centerY - 4}px`;
        const arrowBorder = document.createElement('div');
        arrowBorder.className = 'adl-sub-hint-card__arrow-border';
        arrowBorder.style.left = `${menuRect.right - 5}px`;
        arrowBorder.style.top = `${centerY - 5}px`;
        document.body.appendChild(card);
        document.body.appendChild(arrow);
        document.body.appendChild(arrowBorder);
        hintElementsRef.current.forEach((el) => el.remove());
        hintElementsRef.current = [card, arrow, arrowBorder];
      }
    },
    [menuId]
  );

  const showTabHint = useCallback((e: React.MouseEvent, hintText: string) => {
    const buttonEl = (e.target as HTMLElement).closest('button');
    const menuEl = document.querySelector('[data-menu-id="browser-tab-context-menu"]');
    const originalTitle = buttonEl?.getAttribute('title');
    if (originalTitle) {
      buttonEl?.setAttribute('data-original-title', originalTitle);
      buttonEl?.removeAttribute('title');
    }
    const btnRect = buttonEl?.getBoundingClientRect();
    const menuRect = menuEl?.getBoundingClientRect();
    if (btnRect && menuRect) {
      const centerY = btnRect.top + btnRect.height / 2;
      const card = document.createElement('div');
      card.className = 'adl-sub-hint-card';
      card.textContent = hintText;
      card.style.left = `${menuRect.right + 1}px`;
      card.style.top = `${centerY}px`;
      card.style.transform = 'translateY(-50%)';
      const arrow = document.createElement('div');
      arrow.className = 'adl-sub-hint-card__arrow';
      arrow.style.left = `${menuRect.right - 4}px`;
      arrow.style.top = `${centerY - 4}px`;
      const arrowBorder = document.createElement('div');
      arrowBorder.className = 'adl-sub-hint-card__arrow-border';
      arrowBorder.style.left = `${menuRect.right - 5}px`;
      arrowBorder.style.top = `${centerY - 5}px`;
      document.body.appendChild(card);
      document.body.appendChild(arrow);
      document.body.appendChild(arrowBorder);
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [card, arrow, arrowBorder];
    }
  }, []);

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
      hideHint();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        hideHint();
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, [menuOpen, menuId, hideHint]);

  useEffect(() => {
    if (!contextMenuForTab) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const menuEl = document.querySelector('[data-menu-id="browser-tab-context-menu"]');
      if (menuEl?.contains(target)) {
        return;
      }
      setContextMenuForTab(null);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuForTab(null);
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [contextMenuForTab]);

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
      hideHint();
    },
    [hideHint]
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
            const tabBtns = [
              {
                id: 'refresh',
                label: t.browserRefreshMeta,
                icon: <IconRefreshCw size={12} decorative />,
              },
              {
                id: 'more',
                label: t.browserContextMore,
                icon: <IconMoreVertical size={12} decorative />,
              },
            ];
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
                    e.stopPropagation();
                    onSelectTreePath(item.node.path);
                    setContextMenuForTab({
                      x: e.clientX,
                      y: e.clientY,
                      node: item.node,
                    });
                  }}
                >
                  <span
                    className="adl-filetree__indent adl-filetree__indent--flat"
                    aria-hidden="true"
                  />
                  <BrowserFavicon url={item.node.url ?? ''} />
                  <button
                    type="button"
                    className="adl-filetree__label"
                    onClick={() => handleFlatTabClick(item.node)}
                  >
                    <span className="adl-filetree__label-content">
                      <span className="adl-filetree__label-text">{item.node.name}</span>
                    </span>
                  </button>
                  <span className="adl-filetree__meta adl-tree-node__meta--inline">
                    <span className="adl-browser-node__actions">
                      {tabBtns.map((btn) => (
                        <TooltipSimple key={btn.id} content={btn.label} placement="top">
                          <button
                            type="button"
                            className="adl-icon-btn adl-icon-btn--xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (btn.id === 'more') {
                                const rect = (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                setContextMenuForTab({
                                  x: rect.right + 4,
                                  y: rect.top,
                                  node: item.node,
                                });
                              } else if (btn.id === 'refresh') {
                                if (item.node.tabId && item.node.url) {
                                  callbacks.onRefreshTab(item.node.tabId, item.node.url);
                                }
                              }
                            }}
                            aria-label={btn.label}
                          >
                            {btn.icon}
                          </button>
                        </TooltipSimple>
                      ))}
                    </span>
                  </span>
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
                <span>{item.label}</span>
                {item.hint ? (
                  <span
                    className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                    onMouseEnter={(e) => showHint(e, item.hint!)}
                    onMouseLeave={hideHint}
                  >
                    !
                  </span>
                ) : null}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  const tabContextMenuSlot = contextMenuForTab
    ? createPortal(
        <div
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="browser-tab-context-menu"
          style={{ top: contextMenuForTab.y, left: contextMenuForTab.x }}
        >
          {[
            {
              id: 'open-current',
              label: t.browserContextOpenCurrent,
              action: () => {
                if (contextMenuForTab.node.tabId) {
                  callbacks.onOpenTabInCurrentTab(contextMenuForTab.node.tabId);
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'open-new',
              label: t.browserContextOpenNewTab,
              action: () => {
                if (contextMenuForTab.node.url) {
                  callbacks.onOpenTabInNewTab(
                    contextMenuForTab.node.url,
                    contextMenuForTab.node.name
                  );
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'refresh',
              label: t.browserRefreshMeta,
              hint: t.browserRefreshMetaHint,
              action: () => {
                if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                  callbacks.onRefreshTab(contextMenuForTab.node.tabId, contextMenuForTab.node.url);
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'edit',
              label: t.browserContextEdit,
              action: () => {
                if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                  callbacks.onEditTab(
                    contextMenuForTab.node.tabId,
                    contextMenuForTab.node.name,
                    contextMenuForTab.node.url
                  );
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'copy-link',
              label: t.browserContextCopyLink,
              action: () => {
                if (contextMenuForTab.node.url) {
                  callbacks.onCopyTabLink(contextMenuForTab.node.url);
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'delete',
              label: t.browserContextDelete,
              danger: true,
              action: () => {
                if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                  callbacks.onDeleteTab(contextMenuForTab.node.tabId, contextMenuForTab.node.url);
                }
                setContextMenuForTab(null);
              },
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
              role="menuitem"
              onClick={item.action}
            >
              <span>{item.label}</span>
              {item.hint ? (
                <span
                  className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                  onMouseEnter={(e) => showTabHint(e, item.hint!)}
                  onMouseLeave={hideHint}
                >
                  !
                </span>
              ) : null}
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
        <>
          {flatChildren}
          {tabContextMenuSlot}
        </>
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
