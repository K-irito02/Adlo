import React from 'react';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useTCopy } from '@i18n/useTCopy';
import { ShimmeringText } from '@/components/shimmering-text';
import { useAppStore } from '@stores/slicedStore';
import { IconClose } from '@icons';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface BrowserOpenTabFlatListItemProps {
  tab: BrowserTabState;
  isActive: boolean;
  isEvicted: boolean;
  isLoading?: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export const BrowserOpenTabFlatListItem = React.memo(function BrowserOpenTabFlatListItem({
  tab,
  isActive,
  isEvicted,
  isLoading = false,
  onSelectTab,
  onCloseTab,
}: BrowserOpenTabFlatListItemProps) {
  const { t } = useTCopy();

  return (
    <li
      className={`adl-filetree__item adl-filetree__node--file${isActive ? ' is-active' : ''}${isEvicted ? ' adl-filetree__item--evicted' : ''}`}
      data-path={`tab:${tab.id}`}
      role="treeitem"
    >
      <div className="adl-filetree__row" onClick={() => onSelectTab(tab.id)}>
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
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              aria-label={t.browserClose}
              title={t.browserClose}
            >
              <IconClose size={12} decorative />
            </button>
          </span>
        </span>
      </div>
    </li>
  );
});
