import React, { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileTree } from '@features/file-tree';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import { useClampedMenuPosition, useMenuCloseOnOutsideClick } from '@features/tree/treeEntryMenus';
import { useHintCard, HintCard } from '../../components/HintCard';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useAppStore } from '@stores/slicedStore';
import { isUrlBookmarked } from '@utils/browserDisplayUtils';
import type { BrowserTreeNode } from './types';
import { buildBrowserNodeTitleMap } from './browserTreeTitle';
import { faviconPropsForNode } from './browserTreeFavicon';
import { buildFolderPathLabel } from '@stores/slices/browserFoldersUtils';
import { resolveChildCount } from './useBrowserTreeData';
import {
  type BrowserEntrySubEntriesProps,
  getChildNodeHoverButtons,
  getChildNodeMoreMenuItems,
  getTabContextMenuItems,
  getTabHoverButtons,
  isLeafBrowserNodeType,
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
}: BrowserEntrySubEntriesProps) {
  const { t } = useTCopy();
  const browserBookmarkFolders = useAppStore((s) => s.browserBookmarkFolders);
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);
  const isExpanded = expandedPaths[node.path] ?? false;

  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
    node?: BrowserTreeNode;
  } | null>(null);

  const {
    hintState,
    showHint: showHintCard,
    hideHint,
    scheduleHide,
    hintCardProps,
  } = useHintCard();

  useMenuCloseOnOutsideClick(!!childMenuState, 'browser-child-menu', () => {
    setChildMenuState(null);
    hideHint();
  });

  // 子菜单视口钳制（事项 16）：悬停"更多操作"按钮打开的 portal 菜单此前用原始
  // 按钮坐标，底部行会被应用下边缘裁剪。与 EntryMenu 两槽同口径。
  const childMenuPosition = useMemo(
    () => (childMenuState ? { top: childMenuState.y, left: childMenuState.x } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅坐标参与钳制
    [childMenuState?.x, childMenuState?.y],
  );
  const childMenuClamp = useClampedMenuPosition(childMenuPosition);

  const handleShowChildHint = useCallback(
    (e: React.MouseEvent, hintText: string) => {
      const buttonEl = (e.target as HTMLElement).closest('button');
      const originalTitle = buttonEl?.getAttribute('title');
      if (originalTitle) {
        buttonEl?.setAttribute('data-original-title', originalTitle);
        buttonEl?.removeAttribute('title');
      }
      const btnRect = buttonEl?.getBoundingClientRect();
      if (btnRect) {
        showHintCard(hintText, btnRect);
      }
    },
    [showHintCard],
  );

  const renderChildCount = useCallback(
    (childNode: BrowserTreeNode) => resolveChildCount(counts, childNode),
    [counts],
  );

  const nodeTitleMap = useMemo(() => {
    if (!isExpanded) {
      return new Map<string, string>();
    }
    const baseParentPath =
      node.nodeType === 'folder' && node.folderId
        ? buildFolderPathLabel(node.folderId, browserBookmarkFolders, recentWorkspaces)
        : '';
    return buildBrowserNodeTitleMap(
      node.children,
      browserBookmarkFolders,
      recentWorkspaces,
      baseParentPath,
    );
  }, [
    isExpanded,
    node.children,
    node.nodeType,
    node.folderId,
    browserBookmarkFolders,
    recentWorkspaces,
  ]);

  const getChildNodeTitle = useCallback(
    (childNode: BrowserTreeNode) => nodeTitleMap.get(childNode.path),
    [nodeTitleMap],
  );

  const renderChildMeta = useCallback(
    (childNode: BrowserTreeNode) => {
      // Handle file leaf nodes（活标签 / 历史条目 / 纯书签共用一套行级动作）
      if (childNode.kind === 'file' && isLeafBrowserNodeType(childNode.nodeType)) {
        // 关闭按钮只对真实标签行有意义（历史行也带 tabId，但那是历史条目 id）。
        const btns = getTabHoverButtons(
          t,
          !!callbacks.onCloseTab && childNode.nodeType === 'tab' && !!childNode.tabId,
        );
        return (
          <span className="adl-browser-node__actions">
            {btns.map((btn) => {
              const tabButton = (
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
                      // 纯书签行没有 tabId，但仍可按 URL 刷新站点元数据（与右键菜单同口径）。
                      if (childNode.url) {
                        callbacks.onRefreshTab(childNode.tabId, childNode.url);
                      }
                    }
                  }}
                  aria-label={btn.label}
                >
                  {btn.icon}
                </button>
              );
              return (
                <TooltipSimple key={btn.id} content={btn.label} placement="top">
                  {tabButton}
                </TooltipSimple>
              );
            })}
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
          {btns.map((btn) => {
            const dirButton = (
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
                  } else if (btn.id === 'create-bookmark') {
                    callbacks.onCreateTab(childNode.workspaceId, childNode.folderId);
                  } else if (btn.id === 'delete-history-dir') {
                    if (
                      childNode.nodeType === 'year' ||
                      childNode.nodeType === 'month' ||
                      childNode.nodeType === 'day'
                    ) {
                      callbacks.onDeleteHistory(childNode.nodeType, childNode.path);
                    }
                  }
                }}
                aria-label={btn.label}
              >
                {btn.icon}
              </button>
            );
            return (
              <TooltipSimple key={btn.id} content={btn.label} placement="top">
                {dirButton}
              </TooltipSimple>
            );
          })}
        </span>
      );
    },
    [categoryType, callbacks, t],
  );

  const handleChildClick = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      onTogglePath(path);
    },
    [onSelectTreePath, onTogglePath],
  );

  const handleChildOpenFile = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      onOpenFile(path);
    },
    [onSelectTreePath, onOpenFile],
  );

  const renderBrowserIcon = useCallback((childNode: BrowserTreeNode) => {
    if (childNode.kind === 'directory') {
      return null;
    }
    const hasAudio = childNode.isPlayingAudio || childNode.isAudioMuted;
    return (
      <span className="adl-browser-tree__icon-wrapper">
        <BrowserFavicon {...faviconPropsForNode(childNode)} />
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

  const handleChildContextMenu = useCallback(
    (childNode: BrowserTreeNode) => {
      // Handle file leaf nodes（活标签 / 历史条目 / 纯书签）
      if (childNode.kind === 'file' && isLeafBrowserNodeType(childNode.nodeType)) {
        return getTabContextMenuItems(
          childNode,
          callbacks,
          t,
          isUrlBookmarked(bookmarks, childNode.url),
        );
      }
      const items = getChildNodeMoreMenuItems(
        childNode.nodeType,
        categoryType,
        childNode.path,
        callbacks,
        t,
        childNode.workspaceId,
      );
      return items.map((item) => ({
        id: item.id,
        label: item.label,
        badge: item.badge,
        danger: item.danger,
        hint: item.hint,
        action: () => item.action(),
      }));
    },
    [categoryType, callbacks, bookmarks, t],
  );

  const handleChildMenuClick = useCallback(
    (action: () => void) => {
      action();
      setChildMenuState(null);
      hideHint();
    },
    [hideHint],
  );

  const fileTreeChildren =
    isExpanded && node.children.length > 0 ? (
      <div className="adl-browser-entry__tree">
        <FileTree<BrowserTreeNode>
          nodes={node.children}
          selectedFilePath={selectedTreePath ?? undefined}
          expandedPaths={expandedPaths}
          onToggle={handleChildClick}
          onOpenFile={handleChildOpenFile}
          renderMeta={renderChildMeta}
          renderCount={renderChildCount}
          renderIconBefore={renderBrowserIcon}
          getContextMenuItems={handleChildContextMenu}
          getNodeTitle={getChildNodeTitle}
          expandLabel={t.expand}
          collapseLabel={t.collapse}
          flipAnimation={false}
        />
      </div>
    ) : null;

  const childMenuSlot = childMenuState
    ? createPortal(
        <div
          ref={childMenuClamp.menuRef}
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="browser-child-menu"
          style={
            childMenuClamp.adjusted
              ? { top: childMenuClamp.adjusted.top, left: childMenuClamp.adjusted.left }
              : { top: childMenuState.y, left: childMenuState.x }
          }
        >
          {(childMenuState.node && isLeafBrowserNodeType(childMenuState.nodeType)
            ? (() => {
                const node = childMenuState.node;
                return getTabContextMenuItems(
                  node,
                  callbacks,
                  t,
                  isUrlBookmarked(bookmarks, node.url),
                );
              })()
            : getChildNodeMoreMenuItems(
                childMenuState.nodeType,
                categoryType,
                childMenuState.nodePath,
                callbacks,
                t,
                childMenuState.node?.workspaceId,
              )
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
              role="menuitem"
              onClick={() => handleChildMenuClick(item.action)}
            >
              {item.icon ? <span className="adl-sidebar-menu__icon">{item.icon}</span> : null}
              <span>{item.label}</span>
              {item.badge ? <span className="adl-menu-item__badge">{item.badge}</span> : null}
              {item.hint ? (
                <span
                  className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                  onMouseEnter={(e) => handleShowChildHint(e, item.hint!)}
                  onMouseLeave={scheduleHide}
                >
                  !
                </span>
              ) : null}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {childMenuSlot}
      {fileTreeChildren}
      <HintCard {...hintCardProps} placement="right">
        {hintState?.content}
      </HintCard>
    </>
  );
});
