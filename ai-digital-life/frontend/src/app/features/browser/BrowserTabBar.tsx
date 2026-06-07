import React from 'react';
import { IconClose, IconGlobe } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { BrowserTabState } from '../../stores/slices/browserslice';
import type { CopyDict } from '../../i18n';
import { useAppStore } from '../../stores/slicedStore';
import { getFaviconUrl } from '../../utils/favicon';

interface BrowserTabBarProps {
  tabs: BrowserTabState[];
  activeTabId: string;
  editingTabId: string | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  dragOverTabId: string | null;
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
  t: _t,
}: BrowserTabBarProps) {
  const browserBookmarks = useAppStore((state) => state.browserBookmarks);

  if (tabs.length === 0) return null;

  return (
    <ul className="adl-tool-list adl-tool-list--terminal">
      {tabs.map((tab) => {
        // 检查当前标签是否已收藏
        const isBookmarked = browserBookmarks.some((bookmark) => bookmark.url === tab.url);

        return (
          <li
            key={tab.id}
            className={`adl-tool-list__item adl-tool-list__item--terminal-tab${isDragging && dragOverTabId === tab.id ? ' is-drag-over' : ''}${tab.isPinned ? ' is-pinned' : ''}`}
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
                  fontSize: '13px',
                  padding: '2px 6px',
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
                    {getFaviconUrl(tab.url) ? (
                      <img
                        src={getFaviconUrl(tab.url)}
                        alt=""
                        className="adl-tool-list__favicon"
                        onError={(e) => {
                          // 如果favicon加载失败，显示默认图标
                          (e.target as HTMLImageElement).style.display = 'none';
                          const parent = (e.target as HTMLElement).parentElement;
                          if (parent) {
                            const defaultIcon = document.createElement('span');
                            defaultIcon.className =
                              'adl-tool-list__default-icon adl-tool-list__default-icon--globe';
                            parent.appendChild(defaultIcon);
                          }
                        }}
                      />
                    ) : (
                      <span className="adl-tool-list__default-icon adl-tool-list__default-icon--globe">
                        <IconGlobe size={12} decorative />
                      </span>
                    )}
                  </div>
                  <span className="adl-tool-list__title">{tab.title}</span>
                </button>
                <TooltipSimple content={isBookmarked ? '取消收藏' : '关闭'} placement="top">
                  <button
                    type="button"
                    className="adl-tool-list__item-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    aria-label={isBookmarked ? '取消收藏' : '关闭'}
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
