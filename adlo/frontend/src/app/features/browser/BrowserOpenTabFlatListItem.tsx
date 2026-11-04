import React, { useState } from 'react';
import { TooltipSimple } from '@components/Tooltip';
import { ContextMenu } from '@components/ContextMenu';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useTCopy } from '@i18n/useTCopy';
import { ShimmeringText } from '@/components/shimmering-text';
import { useAppStore } from '@stores/slicedStore';
import { IconClose, IconCopy, IconMoveToCenter, IconRefreshCw } from '@icons';
import { useOpenInCenterAction } from './useOpenInCenterAction';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface BrowserOpenTabFlatListItemProps {
  tab: BrowserTabState;
  isActive: boolean;
  isEvicted: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRefreshTab?: (tabId: string, url: string) => void;
  onCopyTabLink?: (url: string) => void;
}

export const BrowserOpenTabFlatListItem = React.memo(function BrowserOpenTabFlatListItem({
  tab,
  isActive,
  isEvicted,
  onSelectTab,
  onCloseTab,
  onRefreshTab,
  onCopyTabLink,
}: BrowserOpenTabFlatListItemProps) {
  const { t } = useTCopy();
  const { moveTabToCenter } = useOpenInCenterAction();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <li
      className={`adl-filetree__item adl-filetree__node--file${isActive ? ' is-active' : ''}${isEvicted ? ' adl-filetree__item--evicted' : ''}`}
      data-path={`tab:${tab.id}`}
      role="treeitem"
    >
      <div
        className="adl-filetree__row"
        onClick={() => onSelectTab(tab.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <span className="adl-filetree__indent adl-filetree__indent--flat" aria-hidden="true" />
        <BrowserFavicon url={tab.url} />
        <BrowserAudioIndicator
          isPlaying={tab.isPlayingAudio}
          isMuted={tab.isAudioMuted}
          onToggleMute={() => {
            const store = useAppStore.getState();
            const nextMuted = !store.browserTabsById[tab.id]?.isAudioMuted;
            store.browserToggleTabMute(tab.id);
            window.digitalLife?.browser?.muteTab?.(tab.id, nextMuted);
          }}
        />
        <button type="button" className="adl-filetree__label" onClick={() => onSelectTab(tab.id)}>
          <span className="adl-filetree__label-content">
            <span className="adl-filetree__label-text">
              {tab.titleResolved ? tab.title : <ShimmeringText text={t.newTabPage} />}
            </span>
          </span>
        </button>
        <span className="adl-filetree__meta adl-tree-node__meta--inline">
          <span className="adl-browser-node__actions">
            <TooltipSimple content={t.browserClose} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                aria-label={t.browserClose}
              >
                <IconClose size={12} decorative />
              </button>
            </TooltipSimple>
          </span>
        </span>
      </div>
      {contextMenu && (
        <ContextMenu
          items={[
            {
              id: 'refresh',
              // 语义如实：复用的是元数据刷新（图标与标题），不重载页面（R1）。
              label: t.browserRefreshMeta,
              hint: t.browserRefreshMetaHint,
              icon: <IconRefreshCw size={14} decorative />,
              disabled: !tab.url || !onRefreshTab,
              action: () => {
                try {
                  const result = onRefreshTab?.(tab.id, tab.url) as unknown;
                  if (result instanceof Promise) {
                    result.catch((err) => {
                      console.warn('browser open-tab refresh failed', err);
                    });
                  }
                } catch (err) {
                  console.warn('browser open-tab refresh failed', err);
                }
                setContextMenu(null);
              },
            },
            {
              id: 'copy-link',
              label: t.browserContextCopyLink,
              icon: <IconCopy size={14} decorative />,
              disabled: !tab.url || !onCopyTabLink,
              action: () => {
                onCopyTabLink?.(tab.url);
                setContextMenu(null);
              },
            },
            {
              id: 'show-in-center',
              label: t.centerTabShowInCenter,
              icon: <IconMoveToCenter size={14} decorative />,
              action: () => {
                moveTabToCenter(tab.id);
                setContextMenu(null);
              },
            },
            { id: 'sep-close', separator: true },
            {
              id: 'close',
              label: t.browserClose,
              icon: <IconClose size={14} decorative />,
              action: () => {
                onCloseTab(tab.id);
                setContextMenu(null);
              },
            },
          ]}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </li>
  );
});
