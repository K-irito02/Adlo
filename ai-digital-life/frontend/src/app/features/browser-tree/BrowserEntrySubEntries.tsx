import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconPlus, IconTrash, IconMoreVertical, IconRefreshCw } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { useTCopy } from '../../i18n/useTCopy';
import { useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import { BrowserFavicon } from '../../components/BrowserFavicon';
import type { CopyDict } from '../../i18n';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import { resolveChildCount } from './useBrowserTreeData';
import type { SectionCallbacks } from './BrowserCategorySection';

interface BrowserEntrySubEntriesProps {
  node: BrowserTreeNode;
  categoryType: BrowserCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  onOpenFile: (path: string) => void;
  callbacks: SectionCallbacks;
  counts: Map<string, number>;
  filterTabIds?: Set<string>;
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
        {
          id: 'more',
          label: t.browserContextMore,
          icon: <IconMoreVertical size={12} decorative />,
        },
      ];
    }
    return [];
  }

  if (nodeType === 'folder') {
    return [
      {
        id: 'create-tab',
        label: t.browserContextCreateTab,
        icon: <IconPlus size={12} decorative />,
      },
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
): Array<{
  id: string;
  label: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}> {
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
        danger: true,
        hint: t.browserDeleteAllTabsHint,
        action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        hint: t.browserDeleteDirHint,
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
      {
        id: 'rename',
        label: t.browserContextRename,
        action: () => callbacks.onRenameDirectory(folderId),
      },
      {
        id: 'delete-all-tabs',
        label: t.browserContextDeleteAllTabs,
        danger: true,
        hint: t.browserDeleteAllTabsHint,
        action: () => callbacks.onDeleteAllChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-self-tabs',
        label: t.browserContextDeleteSelfTabs,
        danger: true,
        hint: t.browserDeleteSelfTabsHint,
        action: () => callbacks.onDeleteOwnChildTabs(categoryType, nodePath),
      },
      {
        id: 'delete-this-dir',
        label: t.browserContextDeleteDir,
        danger: true,
        hint: t.browserDeleteDirHint,
        action: () => callbacks.onDeleteDirectory(folderId),
      },
    ];
  }

  return [];
}

function getTabContextMenuItems(
  node: BrowserTreeNode,
  callbacks: SectionCallbacks,
  t: CopyDict
): Array<{
  id: string;
  label: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}> {
  return [
    {
      id: 'open-current',
      label: t.browserContextOpenCurrent,
      action: () => {
        if (node.tabId) {
          callbacks.onOpenTabInCurrentTab(node.tabId);
        }
      },
    },
    {
      id: 'open-new',
      label: t.browserContextOpenNewTab,
      action: () => {
        if (node.url) {
          callbacks.onOpenTabInNewTab(node.url, node.name);
        }
      },
    },
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      hint: t.browserRefreshMetaHint,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onRefreshTab(node.tabId, node.url);
        }
      },
    },
    {
      id: 'edit',
      label: t.browserContextEdit,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onEditTab(node.tabId, node.name, node.url);
        }
      },
    },
    {
      id: 'copy-link',
      label: t.browserContextCopyLink,
      action: () => {
        if (node.url) {
          callbacks.onCopyTabLink(node.url);
        }
      },
    },
    {
      id: 'delete',
      label: t.browserContextDelete,
      danger: true,
      action: () => {
        if (node.tabId && node.url) {
          callbacks.onDeleteTab(node.tabId, node.url);
        }
      },
    },
  ];
}

function getTabHoverButtons(
  t: CopyDict,
  showClose: boolean
): Array<{ id: string; label: string; icon: React.ReactNode; isClose?: boolean }> {
  const btns: Array<{ id: string; label: string; icon: React.ReactNode; isClose?: boolean }> = [];
  if (showClose) {
    btns.push({
      id: 'close',
      label: t.browserClose,
      icon: <IconClose size={12} decorative />,
      isClose: true,
    });
  }
  btns.push(
    {
      id: 'refresh',
      label: t.browserRefreshMeta,
      icon: <IconRefreshCw size={12} decorative />,
    },
    {
      id: 'more',
      label: t.browserContextMore,
      icon: <IconMoreVertical size={12} decorative />,
    }
  );
  return btns;
}

export const BrowserEntrySubEntries = React.memo(function BrowserEntrySubEntries({
  node,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  onOpenFile,
  callbacks,
  counts,
  filterTabIds,
}: BrowserEntrySubEntriesProps) {
  const { t } = useTCopy();
  const isExpanded = expandedPaths[node.path] ?? false;

  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
    node?: BrowserTreeNode;
  } | null>(null);

  useMenuCloseOnOutsideClick(!!childMenuState, 'browser-child-menu', () => {
    setChildMenuState(null);
    hideChildHint();
  });

  const childHintElementsRef = useRef<HTMLElement[]>([]);

  const hideChildHint = useCallback(() => {
    childHintElementsRef.current.forEach((el) => el.remove());
    childHintElementsRef.current = [];
  }, []);

  const showChildHint = useCallback((e: React.MouseEvent, hintText: string) => {
    const buttonEl = (e.target as HTMLElement).closest('button');
    const menuEl = document.querySelector('[data-menu-id="browser-child-menu"]');
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
      childHintElementsRef.current.forEach((el) => el.remove());
      childHintElementsRef.current = [card, arrow, arrowBorder];
    }
  }, []);

  useEffect(() => {
    if (!childMenuState) {
      return;
    }
    return () => {
      childHintElementsRef.current.forEach((el) => el.remove());
      childHintElementsRef.current = [];
    };
  }, [childMenuState]);

  const renderChildCount = useCallback(
    (childNode: BrowserTreeNode) => resolveChildCount(counts, childNode),
    [counts]
  );

  const renderChildMeta = useCallback(
    (childNode: BrowserTreeNode) => {
      // Handle tab leaf nodes
      if (
        childNode.kind === 'file' &&
        (childNode.nodeType === 'tab' || childNode.nodeType === 'history')
      ) {
        const btns = getTabHoverButtons(t, !!callbacks.onCloseTab);
        return (
          <span className="adl-browser-node__actions">
            {btns.map((btn) => (
              <TooltipSimple key={btn.id} content={btn.label} placement="top">
                <button
                  type="button"
                  className={`adl-icon-btn adl-icon-btn--xs${btn.isClose ? ' adl-icon-btn--danger-hover' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (btn.id === 'close') {
                      if (childNode.tabId) {
                        callbacks.onCloseTab?.(childNode.tabId);
                      }
                    } else if (btn.id === 'more') {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setChildMenuState({
                        x: rect.right + 4,
                        y: rect.top,
                        nodePath: childNode.path,
                        nodeType: childNode.nodeType,
                        node: childNode,
                      });
                    } else if (btn.id === 'refresh') {
                      if (childNode.tabId && childNode.url) {
                        callbacks.onRefreshTab(childNode.tabId, childNode.url);
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
        );
      }

      // Handle directory nodes
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
                      node: childNode,
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
    [categoryType, callbacks, t]
  );

  const handleChildClick = useCallback(
    (path: string) => {
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

  const renderBrowserIcon = useCallback((childNode: BrowserTreeNode) => {
    if (childNode.kind === 'directory') {
      return null;
    }
    return <BrowserFavicon url={childNode.url || ''} />;
  }, []);

  const handleChildContextMenu = useCallback(
    (childNode: BrowserTreeNode) => {
      // Handle tab leaf nodes
      if (
        childNode.kind === 'file' &&
        (childNode.nodeType === 'tab' || childNode.nodeType === 'history')
      ) {
        return getTabContextMenuItems(childNode, callbacks, t);
      }
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
        hint: item.hint,
        action: () => item.action(),
      }));
    },
    [categoryType, callbacks, t]
  );

  const handleChildMenuClick = useCallback(
    (action: () => void) => {
      action();
      setChildMenuState(null);
      hideChildHint();
    },
    [hideChildHint]
  );

  const filteredNodes = useMemo(
    () =>
      filterTabIds
        ? node.children.filter(
            (child) => child.kind === 'directory' || (child.tabId && filterTabIds.has(child.tabId))
          )
        : node.children,
    [node.children, filterTabIds]
  );

  const fileTreeChildren =
    isExpanded && filteredNodes.length > 0 ? (
      <div className="adl-browser-entry__tree">
        <FileTree<BrowserTreeNode>
          nodes={filteredNodes}
          selectedFilePath={selectedTreePath ?? undefined}
          expandedPaths={expandedPaths}
          onToggle={handleChildClick}
          onOpenFile={handleChildOpenFile}
          renderMeta={renderChildMeta}
          renderCount={renderChildCount}
          renderIconBefore={renderBrowserIcon}
          getContextMenuItems={handleChildContextMenu}
          expandLabel={t.expand}
          collapseLabel={t.collapse}
        />
      </div>
    ) : null;

  const childMenuSlot = childMenuState
    ? createPortal(
        <div
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="browser-child-menu"
          style={{ top: childMenuState.y, left: childMenuState.x }}
        >
          {(childMenuState.node &&
          (childMenuState.nodeType === 'tab' || childMenuState.nodeType === 'history')
            ? getTabContextMenuItems(childMenuState.node, callbacks, t)
            : getChildNodeMoreMenuItems(
                childMenuState.nodeType,
                categoryType,
                childMenuState.nodePath,
                callbacks,
                t
              )
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
              role="menuitem"
              onClick={() => handleChildMenuClick(item.action)}
            >
              <span>{item.label}</span>
              {item.hint ? (
                <span
                  className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                  onMouseEnter={(e) => showChildHint(e, item.hint!)}
                  onMouseLeave={hideChildHint}
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
    <>
      {childMenuSlot}
      {fileTreeChildren}
    </>
  );
});
