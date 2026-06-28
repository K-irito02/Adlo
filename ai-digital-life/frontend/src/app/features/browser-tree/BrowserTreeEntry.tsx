import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TooltipSimple } from '../../components/Tooltip';
import type { BrowserTreeNode, BrowserCategoryType } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import { useTCopy } from '../../i18n/useTCopy';
import { useAppStore } from '../../stores/slicedStore';
import { MultiTreeEntryShell } from '../tree/MultiTreeEntryShell';
import { BrowserEntrySubEntries } from './BrowserEntrySubEntries';
import {
  buildFlatTabItems,
  getEntryHoverButtons,
  getEntryMoreMenuItems,
} from './browserTreeEntryUtils';
import { BrowserTreeEntryFlatList } from './BrowserTreeEntryFlatList';

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
    () => (isFlatMode && isExpanded ? buildFlatTabItems(node, showSeparators, filterTabIds) : []),
    [node, isFlatMode, isExpanded, showSeparators, filterTabIds]
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
              id: 'bookmark-toggle',
              label: contextMenuForTab.node.url &&
                useAppStore.getState().browserBookmarks.some((b) => b.url === contextMenuForTab.node.url)
                ? t.browserUnbookmark
                : t.browserBookmark,
              action: () => {
                const url = contextMenuForTab.node.url;
                const isBookmarked = url
                  ? useAppStore.getState().browserBookmarks.some((b) => b.url === url)
                  : false;
                if (url) {
                  if (isBookmarked) {
                    useAppStore
                      .getState()
                      .browserToggleBookmark({ url, title: contextMenuForTab.node.name });
                  } else {
                    useAppStore.getState().browserSetPendingBookmark({
                      url,
                      title: contextMenuForTab.node.name,
                      tabId: contextMenuForTab.node.tabId || undefined,
                    });
                  }
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
          filterTabIds={filterTabIds}
        />
      )}
    </MultiTreeEntryShell>
  );
});
