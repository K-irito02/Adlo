import React from 'react';
import { IconFileCode, IconTerminal, IconDelete } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import type { CopyDict } from '@i18n';
import type { TerminalNavigatorMode } from './useTerminalPanel';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { TerminalTabBar } from './TerminalTabBar';

interface TerminalNavigatorProps {
  navigatorMode: TerminalNavigatorMode;
  navigatorTitle: string;
  navigatorCount: number;
  navigatorCollapsed: boolean;
  terminalNavigatorWidth: number;
  terminalTabs: TerminalTabState[];
  terminalActiveTabId: string;
  recentCommands: { id: string; label: string; title: string }[];
  editingTabId: string | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  dragOverTabId: string | null;
  onModeChange: (mode: TerminalNavigatorMode) => void;
  onToggleNavigator: (tool: string) => void;
  onCloseAllTabs: () => void;
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
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  t: CopyDict;
}

export const TerminalNavigator = React.memo(function TerminalNavigator({
  navigatorMode,
  navigatorTitle,
  navigatorCount,
  terminalNavigatorWidth,
  terminalTabs,
  terminalActiveTabId,
  recentCommands,
  editingTabId,
  editValue,
  editInputRef,
  isDragging,
  dragOverTabId,
  onModeChange,
  onCloseAllTabs,
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
  onResizeStart,
  t,
}: TerminalNavigatorProps) {
  return (
    <aside className="adl-tool-navigator" aria-label={t.toolTerminal}>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <span className="adl-tool-navigator__context-title">{navigatorTitle}</span>
        </div>
        <span className="adl-tool-navigator__meta">{navigatorCount}</span>
      </div>
      <div className="adl-tool-navigator__context adl-tool-navigator__context--tabs">
        <TooltipSimple content={t.terminalSessions} placement="top">
          <button
            type="button"
            className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'sessions' ? ' is-active' : ''}`}
            onClick={() => onModeChange('sessions')}
            aria-label={t.terminalSessions}
          >
            <IconTerminal size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.terminalRecentCommands} placement="top">
          <button
            type="button"
            className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'history' ? ' is-active' : ''}`}
            onClick={() => onModeChange('history')}
            aria-label={t.terminalRecentCommands}
          >
            <IconFileCode size={14} decorative />
          </button>
        </TooltipSimple>
        <div className="adl-tool-context__group--spacer" />
        {navigatorMode === 'sessions' && terminalTabs.length > 0 && (
          <TooltipSimple content={t.closeAll} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={onCloseAllTabs}
              aria-label={t.closeAll}
            >
              <IconDelete size={14} decorative />
            </button>
          </TooltipSimple>
        )}
      </div>

      {navigatorMode === 'sessions' ? (
        <TerminalTabBar
          tabs={terminalTabs}
          activeTabId={terminalActiveTabId}
          editingTabId={editingTabId}
          editValue={editValue}
          editInputRef={editInputRef}
          isDragging={isDragging}
          dragOverTabId={dragOverTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onEditChange={onEditChange}
          onEditSubmit={onEditSubmit}
          onEditKeyDown={onEditKeyDown}
          t={t}
        />
      ) : null}

      {navigatorMode === 'history' ? (
        recentCommands.length ? (
          <ul className="adl-tool-list">
            {recentCommands.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="adl-tool-list__item">
                  <span className="adl-tool-list__title">{entry.title}</span>
                  <small>{entry.label}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adl-empty-hint">{t.terminalNoRecentCommands}</p>
        )
      ) : null}

      <NavigatorResizeHandle
        label="Resize terminal navigator"
        minWidth={180}
        maxWidth={300}
        currentWidth={terminalNavigatorWidth}
        onPointerDown={onResizeStart}
      />
    </aside>
  );
});
