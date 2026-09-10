import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { CopyDict } from '@i18n';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import type { TerminalProfile } from '@stores/types';
import {
  IconCheck,
  IconRefreshCw,
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
  tabCount: number;
  onToggleExpand: () => void;
  onCreateTab: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  onCloseAllTabs: () => void;
  isIndependent?: boolean;
  t: CopyDict;
}

export const WorkspaceTerminalEntry = React.memo(function WorkspaceTerminalEntry({
  workspace,
  isExpanded,
  tabs,
  activeTabId,
  tabCount,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  isIndependent = false,
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
    handleRefreshClick,
    handleCloseAllTabsClick,
    handleCreateTabClick,
  } = useTerminalMenu({
    workspace,
    isIndependent,
    onToggleExpand,
    onHideFromRightPanels,
    onRefreshTree,
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
            {!isIndependent && (
              <TooltipSimple content={t.fileRefresh} placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={handleRefreshClick}
                  aria-label={t.fileRefresh}
                >
                  <IconRefreshCw size={12} decorative />
                </button>
              </TooltipSimple>
            )}
            <TooltipSimple content={t.deleteAll} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handleCloseAllTabsClick}
                aria-label={t.deleteAll}
              >
                <IconDelete size={12} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t.terminalCreate} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handleCreateTabClick}
                aria-label={t.terminalCreate}
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
              editingTabId={null}
              editValue=""
              editInputRef={{ current: null }}
              isDragging={false}
              dragOverTabId={null}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
              onContextMenu={() => {}}
              onDoubleClick={() => {}}
              onEditChange={() => {}}
              onEditSubmit={() => {}}
              onEditKeyDown={() => {}}
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
                {t.terminalCreate}
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
