import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { useTCopy } from '../../i18n/useTCopy';
import { useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import { BrowserFavicon } from '../../components/BrowserFavicon';
import { BrowserAudioIndicator } from '../../components/BrowserAudioIndicator';
import { useAppStore } from '../../stores/slicedStore';
import type { BrowserTreeNode } from './types';
import { resolveChildCount } from './useBrowserTreeData';
import {
  type BrowserEntrySubEntriesProps,
  getChildNodeHoverButtons,
  getChildNodeMoreMenuItems,
  getTabContextMenuItems,
  getTabHoverButtons,
} from './browserEntrySubEntriesUtils';

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
                  } else if (btn.id === 'delete-self-tabs') {
                    callbacks.onDeleteOwnChildTabs(categoryType, childNode.path);
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
    const hasAudio = childNode.isPlayingAudio || childNode.isAudioMuted;
    return (
      <span className="adl-browser-tree__icon-wrapper">
        <BrowserFavicon url={childNode.url || ''} />
        {hasAudio && (
          <BrowserAudioIndicator
            isPlaying={childNode.isPlayingAudio ?? false}
            isMuted={childNode.isAudioMuted ?? false}
            onToggleMute={() => {
              const tabId = childNode.associatedTabId ?? childNode.tabId;
              if (tabId) {
                const store = useAppStore.getState();
                const nextMuted = !store.browserTabsById[tabId]?.isAudioMuted;
                store.browserToggleTabMute(tabId);
                window.digitalLife?.browser?.muteTab?.(tabId, nextMuted);
              }
            }}
          />
        )}
      </span>
    );
  }, []);

  const bookmarks = useAppStore((s) => s.browserBookmarks);
  const bookmarkedUrls = useMemo(() => new Set(bookmarks.map((b) => b.url)), [bookmarks]);

  const handleChildContextMenu = useCallback(
    (childNode: BrowserTreeNode) => {
      // Handle tab leaf nodes
      if (
        childNode.kind === 'file' &&
        (childNode.nodeType === 'tab' || childNode.nodeType === 'history')
      ) {
        const isBookmarked = childNode.url ? bookmarkedUrls.has(childNode.url) : false;
        return getTabContextMenuItems(childNode, callbacks, t, isBookmarked);
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
    [categoryType, callbacks, bookmarkedUrls, t]
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
          flipAnimation={categoryType === 'history'}
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
            ? (() => {
                const node = childMenuState.node;
                const isBookmarked = node.url ? bookmarkedUrls.has(node.url) : false;
                return getTabContextMenuItems(node, callbacks, t, isBookmarked);
              })()
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
