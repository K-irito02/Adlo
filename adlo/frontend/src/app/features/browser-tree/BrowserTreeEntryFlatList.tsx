import React, { useCallback } from 'react';
import { IconClose, IconMoreVertical, IconRefreshCw } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTreeNode } from './types';
import type { FlatItem } from './browserTreeEntryUtils';

interface BrowserTreeEntryFlatListProps {
  flatItems: FlatItem[];
  selectedTreePath: string | null;
  onFlatTabClick: (node: BrowserTreeNode) => void;
  onTabContextMenu: (x: number, y: number, node: BrowserTreeNode) => void;
  onRefreshTab: (tabId: string | undefined, url: string) => void;
  onCloseTab?: (tabId: string) => void;
}

export const BrowserTreeEntryFlatList = React.memo(function BrowserTreeEntryFlatList({
  flatItems,
  selectedTreePath,
  onFlatTabClick,
  onTabContextMenu,
  onRefreshTab,
  onCloseTab,
}: BrowserTreeEntryFlatListProps) {
  const { t } = useTCopy();

  const handleRowClick = useCallback(
    (node: BrowserTreeNode) => () => onFlatTabClick(node),
    [onFlatTabClick],
  );

  const handleRowContextMenu = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onTabContextMenu(e.clientX, e.clientY, node);
    },
    [onTabContextMenu],
  );

  const handleMoreClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onTabContextMenu(rect.right + 4, rect.top, node);
    },
    [onTabContextMenu],
  );

  const handleRefreshClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.url) {
        onRefreshTab(node.tabId, node.url);
      }
    },
    [onRefreshTab],
  );

  const handleCloseClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.tabId && onCloseTab) {
        onCloseTab(node.tabId);
      }
    },
    [onCloseTab],
  );

  return (
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
                <span className="adl-browser-entry__flat-sep-line adl-browser-entry__flat-sep-line--left" />
                <span className="adl-browser-entry__flat-sep-text">{item.label}</span>
                <span className="adl-browser-entry__flat-sep-line adl-browser-entry__flat-sep-line--right" />
              </li>
            );
          }
          const isTabSelected = selectedTreePath === item.node.path;
          const tabBtns = [
            ...(onCloseTab
              ? [
                  {
                    id: 'close' as const,
                    label: t.browserClose,
                    icon: <IconClose size={12} decorative />,
                    isClose: true,
                  },
                ]
              : []),
            {
              id: 'refresh' as const,
              label: t.browserRefreshMeta,
              icon: <IconRefreshCw size={12} decorative />,
            },
            {
              id: 'more' as const,
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
                onClick={handleRowClick(item.node)}
                onContextMenu={handleRowContextMenu(item.node)}
              >
                <span
                  className="adl-filetree__indent adl-filetree__indent--flat"
                  aria-hidden="true"
                />
                <BrowserFavicon url={item.node.url ?? ''} />
                {(item.node.isPlayingAudio || item.node.isAudioMuted) && (
                  <BrowserAudioIndicator
                    isPlaying={item.node.isPlayingAudio ?? false}
                    isMuted={item.node.isAudioMuted ?? false}
                    onToggleMute={() => {
                      const tabId = item.node.associatedTabId ?? item.node.tabId;
                      if (tabId) {
                        const store = useAppStore.getState();
                        const nextMuted = !store.browserTabsById[tabId]?.isAudioMuted;
                        store.browserToggleTabMute(tabId);
                        window.digitalLife?.browser?.muteTab?.(tabId, nextMuted);
                      }
                    }}
                  />
                )}
                <button
                  type="button"
                  className="adl-filetree__label"
                  onClick={handleRowClick(item.node)}
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
                          className={`adl-icon-btn adl-icon-btn--xs${btn.isClose ? ' adl-icon-btn--danger-hover' : ''}`}
                          onClick={
                            btn.id === 'close'
                              ? handleCloseClick(item.node)
                              : btn.id === 'more'
                                ? handleMoreClick(item.node)
                                : handleRefreshClick(item.node)
                          }
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
  );
});
