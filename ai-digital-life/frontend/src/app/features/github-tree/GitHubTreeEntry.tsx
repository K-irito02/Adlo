import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconSettings, IconRefreshCw, IconMoreVertical } from '@icons';
import { GitHubEntrySubEntries } from './GitHubEntrySubEntries';
import { TooltipSimple } from '@components/Tooltip';
import { RenameDialog } from '@components/RenameDialog';
import { useTCopy } from '@i18n/useTCopy';
import { MenuHintItem } from '@regions/right-panel/panels/communicate/MenuHintItem';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import { asWorkspaceID } from '@shared/branded';
import type { SectionCallbacks } from './GitHubCategorySection';
import { MultiTreeEntryShell } from '../tree/MultiTreeEntryShell';
import { useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import { getMainEntryMenuItems, type MainMenuItem } from './GitHubEntryMenus';

interface GitHubTreeEntryProps {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

export const GitHubTreeEntry = React.memo(function GitHubTreeEntry({
  node,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
}: GitHubTreeEntryProps) {
  const isSelected = selectedTreePath === node.path;
  const { t } = useTCopy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
  const menuId = `github-entry-menu-${node.path}`;
  const count = node.children.length;

  const {
    gitHubDeleteFolderConfig,
    gitHubDeleteFolderConfigRecursive,
    gitHubDeleteFolderDataRecursive,
    gitHubDeleteFolderConfigAndDataRecursive,
    gitHubRenameFolder,
    gitHubDeleteFolder,
    gitHubPinFolder,
    gitHubUnpinFolder,
    gitHubPinWorkspace,
    gitHubUnpinWorkspace,
    gitHubCiFolders,
    recentWorkspaces,
    clearCiState,
    hideWorkspaceFromRightPanels,
  } = useAppStore(
    useShallow((s) => ({
      gitHubDeleteFolderConfig: s.gitHubDeleteFolderConfig,
      gitHubDeleteFolderConfigRecursive: s.gitHubDeleteFolderConfigRecursive,
      gitHubDeleteFolderDataRecursive: s.gitHubDeleteFolderDataRecursive,
      gitHubDeleteFolderConfigAndDataRecursive: s.gitHubDeleteFolderConfigAndDataRecursive,
      gitHubRenameFolder: s.gitHubRenameFolder,
      gitHubDeleteFolder: s.gitHubDeleteFolder,
      gitHubPinFolder: s.gitHubPinFolder,
      gitHubUnpinFolder: s.gitHubUnpinFolder,
      gitHubPinWorkspace: s.gitHubPinWorkspace,
      gitHubUnpinWorkspace: s.gitHubUnpinWorkspace,
      gitHubCiFolders: s.gitHubCiFolders,
      recentWorkspaces: s.recentWorkspaces,
      clearCiState: s.clearCiState,
      hideWorkspaceFromRightPanels: s.hideWorkspaceFromRightPanels,
    }))
  );

  const [renameFolderState, setRenameFolderState] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  const handleStartRename = useCallback((folderId: string, folderName: string) => {
    setRenameFolderState({ folderId, folderName });
  }, []);

  const handleConfirmRename = useCallback(
    (newName: string) => {
      if (renameFolderState) {
        gitHubRenameFolder(renameFolderState.folderId, newName);
        setRenameFolderState(null);
      }
    },
    [renameFolderState, gitHubRenameFolder]
  );

  const handleCancelRename = useCallback(() => {
    setRenameFolderState(null);
  }, []);

  const handleHeaderClick = useCallback(() => {
    onTogglePath(node.path);
    onSelectTreePath(node.path);
  }, [node.path, onSelectTreePath, onTogglePath]);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
    setMenuOpen(true);
  }, []);

  useMenuCloseOnOutsideClick(menuOpen, menuId, () => setMenuOpen(false));

  const folderId = node.path.replace('github-folder:', '');
  const workspaceId =
    node.workspaceId ||
    (node.nodeType === 'workspace' ? node.path.replace('github-workspace:', '') : undefined);
  const isPinned =
    node.nodeType === 'folder'
      ? gitHubCiFolders.find((f) => f.id === folderId)?.pinnedOrder !== undefined
      : node.nodeType === 'workspace'
        ? (recentWorkspaces.find((w) => w.id === node.workspaceId)?.isPinned ?? false)
        : false;
  const isWorkspaceRoot = categoryType === 'ci-workspace' && node.nodeType === 'workspace';
  const isUserFolderRoot =
    categoryType === 'user-folder' && node.nodeType === 'folder' && !node.workspaceId;
  const isNestedFolder = !!(node.nodeType === 'folder' && node.workspaceId);

  const menuItems: Array<MainMenuItem> = getMainEntryMenuItems({
    node,
    categoryType,
    isPinned,
    isWorkspaceRoot,
    isUserFolderRoot,
    isNestedFolder,
    folderId,
    workspaceId,
    t,
    onRefreshWorkspace: (wsId) => callbacks.onRefreshWorkspace(wsId),
    onOpenSettings: (wsId) => callbacks.onOpenSettings(wsId),
    onOpenFolderSettings: (fId) => callbacks.onOpenFolderSettings(fId),
    onDeleteWorkspaceConfig: (wsId) => callbacks.onDeleteWorkspaceConfig(wsId),
    handleStartRename,
    clearCiState,
    gitHubUnpinFolder,
    gitHubPinFolder,
    gitHubUnpinWorkspace,
    gitHubPinWorkspace,
    gitHubDeleteFolder,
    gitHubDeleteFolderConfig,
    gitHubDeleteFolderConfigRecursive,
    gitHubDeleteFolderDataRecursive,
    gitHubDeleteFolderConfigAndDataRecursive,
    hideWorkspaceFromRightPanels: (wsId: string) =>
      hideWorkspaceFromRightPanels(asWorkspaceID(wsId)),
  });

  const handleExpandBtnClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePath(node.path);
    },
    [onTogglePath, node.path]
  );

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onSelectTreePath(node.path);
      }
    },
    [onSelectTreePath, node.path]
  );

  const handleMenuClick = useCallback((action: () => void) => {
    action();
    setMenuOpen(false);
  }, []);

  const actionButtonsSlot = (
    <>
      <TooltipSimple content={t.refresh} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            if (node.workspaceId) {
              callbacks.onRefreshWorkspace(node.workspaceId);
            } else if (node.nodeType === 'folder') {
              const folderId = node.path.replace('github-folder:', '');
              callbacks.onRefreshWorkspace(folderId);
            } else {
              clearCiState();
            }
          }}
          aria-label={t.refresh}
        >
          <IconRefreshCw size={12} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.settings} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            if (node.workspaceId) {
              callbacks.onOpenSettings(node.workspaceId);
            } else if (node.nodeType === 'folder') {
              const folderId = node.path.replace('github-folder:', '');
              callbacks.onOpenFolderSettings(folderId);
            }
          }}
          aria-label={t.settings}
        >
          <IconSettings size={12} decorative />
        </button>
      </TooltipSimple>
      <TooltipSimple content={t.moreActions} placement="top">
        <button
          type="button"
          className="adl-icon-btn adl-icon-btn--xs"
          onClick={(e) => {
            e.stopPropagation();
            setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
            setMenuOpen(true);
          }}
          aria-label={t.moreActions}
        >
          <IconMoreVertical size={12} decorative />
        </button>
      </TooltipSimple>
    </>
  );

  const entryMenuSlot =
    menuOpen && menuPosition && menuItems.length > 0
      ? createPortal(
          <div
            className="adl-multitree-entry__menu"
            role="menu"
            data-menu-id={menuId}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 9999,
            }}
          >
            {menuItems.map((item) => {
              if (item.separator) {
                return (
                  <div key={item.id} className="adl-multitree-entry__menu-sep" role="separator" />
                );
              }
              return item.hasHint && item.hint ? (
                <MenuHintItem
                  key={item.id}
                  label={item.label!}
                  hint={item.hint}
                  onClick={() => handleMenuClick(item.action!)}
                  menuId={menuId}
                  danger={item.danger}
                />
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={() => handleMenuClick(item.action!)}
                >
                  {item.label!}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <MultiTreeEntryShell
      label={node.name}
      isExpanded={isExpanded}
      isSelected={isSelected}
      count={count}
      onHeaderClick={handleHeaderClick}
      onHeaderContextMenu={handleHeaderContextMenu}
      onExpandBtnClick={handleExpandBtnClick}
      onNameKeyDown={handleNameKeyDown}
      expandLabel={t.expand}
      collapseLabel={t.collapse}
      emptyText={t.noContent}
      actionButtonsSlot={actionButtonsSlot}
      entryMenuSlot={entryMenuSlot}
      hasChildren={node.children.length > 0}
      extraContent={
        <RenameDialog
          open={!!renameFolderState}
          initialValue={renameFolderState?.folderName ?? ''}
          title={t.changesRenameDir}
          onConfirm={handleConfirmRename}
          onCancel={handleCancelRename}
        />
      }
    >
      <GitHubEntrySubEntries
        node={node}
        categoryType={categoryType}
        expandedPaths={expandedPaths}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
        onStartRename={handleStartRename}
      />
    </MultiTreeEntryShell>
  );
});
