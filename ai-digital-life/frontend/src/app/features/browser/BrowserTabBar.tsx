import React, { useMemo } from 'react';
import { IconClose } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { CopyDict } from '@i18n';
import { useAppStore } from '@stores/slicedStore';
import { BrowserFavicon } from '@components/BrowserFavicon';

interface BrowserTabBarProps {
  tabs: BrowserTabState[];
  activeTabId: string;
  editingTabId: string | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  dragOverTabId: string | null;
  evictedTabIds: ReadonlySet<string>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onDragStart: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDrop: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  onDoubleClick: (tabId: string, title: string) => void;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  t: CopyDict;
}

export const BrowserTabBar = React.memo(function BrowserTabBar({
  tabs,
  activeTabId,
  editingTabId,
  editValue,
  editInputRef,
  isDragging,
  dragOverTabId,
  onSelectTab,
  onCloseTab,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContextMenu,
  onDoubleClick,
  onEditChange,
  onEditSubmit,
  onEditKeyDown,
  evictedTabIds,
  t: _t,
}: BrowserTabBarProps) {
  const browserBookmarks = useAppStore((state) => state.browserBookmarks);
  const bookmarkedUrls = useMemo(
    () => new Set(browserBookmarks.map((b) => b.url)),
    [browserBookmarks],
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <ul className="adl-tool-list adl-tool-list--terminal">
      {tabs.map((tab) => {
        const isBookmarked = bookmarkedUrls.has(tab.url);

        return (
          <li
            key={tab.id}
            className={`adl-tool-list__item adl-tool-list__item--terminal-tab${isDragging && dragOverTabId === tab.id ? ' is-drag-over' : ''}${tab.isPinned ? ' is-pinned' : ''}${evictedTabIds.has(tab.id) ? ' adl-tool-list__item--evicted' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, tab.id, tab.isPinned)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, tab.id, tab.isPinned)}
            onDrop={(e) => onDrop(e, tab.id, tab.isPinned)}
            onContextMenu={(e) => onContextMenu(e, tab.id, tab.isPinned)}
          >
            {editingTabId === tab.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                onBlur={onEditSubmit}
                onKeyDown={onEditKeyDown}
                className="adl-tool-list__item-editable-input"
                style={{
                  flex: 1,
                  background: 'var(--surface)',
                  border: '1px solid var(--accent)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  className={`adl-tool-list__item-btn${tab.id === activeTabId ? ' is-active' : ''}`}
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => onDoubleClick(tab.id, tab.title)}
                >
                  <div className="adl-tool-list__tab-icon">
                    <BrowserFavicon url={tab.url} />
                  </div>
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
                  <span className="adl-tool-list__title">{tab.title}</span>
                </button>
                <TooltipSimple content={isBookmarked ? _t.unbookmark : _t.close} placement="top">
                  <button
                    type="button"
                    className="adl-tool-list__item-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    aria-label={isBookmarked ? _t.unbookmark : _t.close}
                  >
                    <IconClose size={12} decorative />
                  </button>
                </TooltipSimple>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
});
