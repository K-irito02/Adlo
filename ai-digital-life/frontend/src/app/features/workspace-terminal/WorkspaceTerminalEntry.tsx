import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { CopyDict } from '@i18n';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import type { TerminalProfile } from '@stores/types';
import {
  IconCheck,
  IconDelete,
  IconPlus,
  IconMoreVertical,
  IconEyeOff,
  IconFolderOpen,
  IconFolder,
  IconTerminal,
  IconChevronRight,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { MenuHintItem } from '@regions/right-panel/panels/communicate/MenuHintItem';
import { WorkspaceRemoveConfirmDialog } from '@components/WorkspaceRemoveConfirmDialog';
import { TerminalTabBar } from '../terminal/TerminalTabBar';
import { formatT } from '@i18n/formatT';
import { useTerminalMenu } from './useTerminalMenu';

export interface WorkspaceTerminalEntryProps {
  workspace: RecentWorkspaceEntry;
  isExpanded: boolean;
  tabs: TerminalTabState[];
  activeTabId: string | undefined;
  editingTabId: string | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  tabCount: number;
  onToggleExpand: () => void;
  onCreateTab: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onCloseAllTabs: (workspaceId: string) => void;
  isIndependent?: boolean;
  onDoubleClick: (tabId: string, title: string) => void;
  onEditChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  t: CopyDict;
}

export const WorkspaceTerminalEntry = React.memo(function WorkspaceTerminalEntry({
  workspace,
  isExpanded,
  tabs,
  activeTabId,
  editingTabId,
  editValue,
  editInputRef,
  tabCount,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onHideFromRightPanels,
  onCloseAllTabs,
  isIndependent = false,
  onDoubleClick,
  onEditChange,
  onEditSubmit,
  onEditKeyDown,
  t,
}: WorkspaceTerminalEntryProps) {
  const {
    menuOpen,
    menuPosition,
    subHover,
    subMenuPosition,
    renderKey,
    menuId,
    subMenuId,
    subMenuTriggerRef,
    headerRef,
    menuContainerRef,
    currentProfile,
    profileLabels,
    defaultProfileLabel,
    handleNameClick,
    handleNameContextMenu,
    handleNameKeyDown,
    showSubMenu,
    hideSubMenuDelayed,
    handleMoreClick,
    closeMenu,
    handleHideFromRightPanels,
    handleSelectDefaultProfile,
    handleCloseAllTabsClick,
    handleCreateTabClick,
  } = useTerminalMenu({
    workspace,
    isIndependent,
    onToggleExpand,
    onHideFromRightPanels,
    onCloseAllTabs,
    onCreateTab,
  });

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const handleRequestRemove = useCallback(() => {
    closeMenu();
    setConfirmRemoveOpen(true);
  }, [closeMenu]);
  const handleConfirmRemove = useCallback(() => {
    setConfirmRemoveOpen(false);
    handleHideFromRightPanels();
  }, [handleHideFromRightPanels]);

  return (
    <div
      key={renderKey}
      className={`adl-multitree-entry${isIndependent ? ' adl-multitree-entry--independent' : ''}${!workspace.available ? ' is-unavailable' : ''}`}
    >
      <div className="adl-multitree-entry__header" data-menu-zone-id={menuId} ref={headerRef}>
        <div className="adl-multitree-entry__expand">
          <TooltipSimple content={isExpanded ? t.fileCollapse : t.fileExpand} placement="top">
            <button
              type="button"
              className={`adl-multitree-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
              onClick={onToggleExpand}
              aria-label={isExpanded ? t.fileCollapse : t.fileExpand}
              aria-expanded={isExpanded}
              disabled={!workspace.available}
            >
              {isExpanded ? (
                <IconFolderOpen size={14} decorative />
              ) : (
                <IconFolder size={14} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>

        <div
          className="adl-multitree-entry__namezone"
          role="button"
          tabIndex={0}
          onClick={handleNameClick}
          onContextMenu={handleNameContextMenu}
          onKeyDown={handleNameKeyDown}
          aria-label={workspace.name}
        >
          <span className="adl-multitree-entry__name" title={workspace.path}>
            {workspace.name}
          </span>
          <span className="adl-multitree-entry__count">{tabCount}</span>

          <div className="adl-multitree-entry__actions">
            <TooltipSimple content={t.terminalClearTerminals} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handleCloseAllTabsClick}
                aria-label={t.terminalClearTerminals}
              >
                <IconDelete size={12} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.terminalNewTerminal} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handleCreateTabClick}
                aria-label={t.terminalNewTerminal}
              >
                <IconPlus size={12} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.moreActions} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                data-menu-btn-id={menuId}
                onClick={handleMoreClick}
                aria-label={t.moreActions}
              >
                <IconMoreVertical size={12} decorative />
              </button>
            </TooltipSimple>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition
        ? createPortal(
            <div ref={menuContainerRef}>
              <div
                className="adl-multitree-entry__menu"
                role="menu"
                data-menu-id={menuId}
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                {!isIndependent && (
                  <MenuHintItem
                    label={t.workspaceRemoveEntry}
                    hint={t.workspaceRemoveEntryHint}
                    onClick={handleRequestRemove}
                    icon={<IconEyeOff size={14} />}
                  />
                )}
                {!isIndependent && (
                  <div className="adl-multitree-entry__menu-sep" role="separator" />
                )}
                <button
                  type="button"
                  className="adl-multitree-entry__menu-item"
                  onClick={() => {
                    closeMenu();
                    onCloseAllTabs(workspace.id);
                  }}
                >
                  <IconDelete size={14} />
                  <span className="adl-multitree-entry__menu-item-content">
                    {t.terminalClearTerminals}
                  </span>
                </button>
                <button
                  type="button"
                  className="adl-multitree-entry__menu-item"
                  onClick={() => {
                    closeMenu();
                    onCreateTab();
                  }}
                >
                  <IconPlus size={14} />
                  <span className="adl-multitree-entry__menu-item-content">
                    {t.terminalNewTerminal}
                  </span>
                </button>
                <div
                  ref={subMenuTriggerRef}
                  className="adl-multitree-entry__menu-item adl-multitree-entry__menu-item--with-sub"
                  data-sub-menu-id={subMenuId}
                  onMouseEnter={showSubMenu}
                  onMouseLeave={hideSubMenuDelayed}
                >
                  <IconTerminal size={14} />
                  <span className="adl-multitree-entry__menu-item-content">
                    {formatT(t, 'terminalDefaultProfile', { profile: defaultProfileLabel })}
                  </span>
                  <span className="adl-multitree-entry__menu-item-arrow">
                    <IconChevronRight size={12} decorative />
                  </span>
                </div>
              </div>
              {subHover && subMenuPosition ? (
                <div
                  className="adl-multitree-entry__menu adl-multitree-entry__menu--sub"
                  role="menu"
                  data-menu-id={subMenuId}
                  style={{ top: subMenuPosition.top, left: subMenuPosition.left }}
                  onMouseEnter={showSubMenu}
                  onMouseLeave={hideSubMenuDelayed}
                >
                  {(['powershell', 'bash', 'cmd'] as TerminalProfile[]).map((profile) => (
                    <button
                      key={profile}
                      type="button"
                      className={`adl-multitree-entry__menu-item${profile === currentProfile ? ' is-active' : ''}`}
                      role="menuitemradio"
                      aria-checked={profile === currentProfile}
                      onClick={() => handleSelectDefaultProfile(profile)}
                    >
                      <span className="adl-multitree-entry__menu-item-label">
                        {profileLabels[profile]}
                      </span>
                      {profile === currentProfile ? (
                        <span className="adl-multitree-entry__menu-item-check">
                          <IconCheck size={12} decorative />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {tabs.length > 0 ? (
            <TerminalTabBar
              tabs={tabs}
              activeTabId={activeTabId ?? ''}
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={false}
              dragOverTabId={null}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
              onContextMenu={() => {}}
              onDoubleClick={onDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
              t={t}
            />
          ) : (
            <div className="adl-multitree-entry__empty">
              <button
                type="button"
                className="adl-multitree-entry__empty-btn"
                onClick={onCreateTab}
              >
                <IconPlus size={12} decorative />
                {t.terminalNewTerminal}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <WorkspaceRemoveConfirmDialog
        open={confirmRemoveOpen}
        workspaceName={workspace.name}
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </div>
  );
});
