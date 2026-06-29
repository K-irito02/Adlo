import React from 'react';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useAppStore } from '@stores/slicedStore';
import { IconClose } from '@icons';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface BrowserOpenTabFlatListProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  evictedTabIds?: ReadonlySet<string>;
}

export function BrowserOpenTabFlatList({
  browserTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  evictedTabIds,
}: BrowserOpenTabFlatListProps) {
  const { t } = useTCopy();

  if (browserTabs.length === 0) {
    return (
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">{t.noContent}</p>
      </div>
    );
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
        <ul className="adl-filetree" role="tree">
          {browserTabs.map((tab) => (
            <li
              key={tab.id}
              className={`adl-filetree__item adl-filetree__node--file${tab.id === activeTabId ? ' is-active' : ''}${evictedTabIds?.has(tab.id) ? ' adl-filetree__item--evicted' : ''}`}
              data-path={`tab:${tab.id}`}
              role="treeitem"
            >
              <div className="adl-filetree__row" onClick={() => onSelectTab(tab.id)}>
                <span
                  className="adl-filetree__indent adl-filetree__indent--flat"
                  aria-hidden="true"
                />
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
                <button
                  type="button"
                  className="adl-filetree__label"
                  onClick={() => onSelectTab(tab.id)}
                >
                  <span className="adl-filetree__label-content">
                    <span className="adl-filetree__label-text">{tab.title}</span>
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
            </li>
          ))}
        </ul>
      </div>
    </CustomScrollArea>
  );
}
