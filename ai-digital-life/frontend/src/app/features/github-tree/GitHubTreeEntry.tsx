import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconSettings, IconRefreshCw, IconMoreVertical } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { RenameDialog } from '../../components/RenameDialog';
import { useTCopy } from '../../i18n/useTCopy';
import { MenuHintItem } from '../../regions/right-panel/panels/communicate/MenuHintItem';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';
import { MultiTreeEntryShell } from '../tree/MultiTreeEntryShell';
import { useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import { SUB_ENTRY_ICONS, getChildNodeMoreMenuItems, type ChildMenuItem } from './GitHubEntryMenus';

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
  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
  } | null>(null);

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

  useMenuCloseOnOutsideClick(!!childMenuState, 'github-child-menu', () => setChildMenuState(null));

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
  const isNestedFolder = node.nodeType === 'folder' && node.workspaceId;

  const menuItems = (() => {
    const items: Array<{
      id: string;
      label?: string;
      danger?: boolean;
      action?: () => void;
      hasHint?: boolean;
      hint?: string;
      separator?: boolean;
    }> = [];

    if (node.workspaceId || isWorkspaceRoot) {
      const wsId = node.workspaceId || workspaceId;
      items.push({
        id: 'refresh',
        label: t.refresh,
        action: () => (wsId ? callbacks.onRefreshWorkspace(wsId) : clearCiState()),
      });
    } else if (node.nodeType === 'folder') {
      items.push({
        id: 'refresh',
        label: t.refresh,
        action: () => clearCiState(),
      });
    }

    if (node.nodeType === 'folder') {
      if (isPinned) {
        items.push({
          id: 'unpin',
          label: t.unpin,
          action: () => gitHubUnpinFolder(folderId),
        });
      } else {
        items.push({
          id: 'pin',
          label: t.pin,
          action: () => gitHubPinFolder(folderId),
        });
      }
    } else if (node.nodeType === 'workspace') {
      if (isPinned) {
        items.push({
          id: 'unpin-workspace',
          label: t.unpin,
          action: () => gitHubUnpinWorkspace(node.workspaceId!),
        });
      } else {
        items.push({
          id: 'pin-workspace',
          label: t.pin,
          action: () => gitHubPinWorkspace(node.workspaceId!),
        });
      }
    }

    if (!(categoryType === 'ci-workspace' && node.nodeType === 'workspace')) {
      if (node.nodeType === 'folder') {
        items.push({
          id: 'rename',
          label: t.rename,
          action: () => handleStartRename(folderId, node.name),
        });
      }
    }

    if (node.workspaceId) {
      items.push({
        id: 'settings',
        label: t.settings,
        action: () => callbacks.onOpenSettings(node.workspaceId!),
      });
    } else if (node.nodeType === 'folder') {
      items.push({
        id: 'settings',
        label: t.settings,
        action: () => callbacks.onOpenFolderSettings(folderId),
      });
    }

    if (node.nodeType === 'workspace') {
      items.push({
        id: 'hide-from-area',
        label: t.ciRemoveFromView,
        hasHint: true,
        hint: t.ciRemoveFromViewHint,
        action: () => {
          if (workspaceId) {
            hideWorkspaceFromRightPanels(workspaceId);
          }
        },
      });
    }

    items.push({ id: 'sep-danger', separator: true });

    if (isNestedFolder || isUserFolderRoot) {
      items.push({
        id: 'delete-folder',
        label: t.ciDeleteDir,
        danger: true as const,
        hasHint: true,
        hint: t.ciDeleteDirHint,
        action: () => {
          gitHubDeleteFolder(folderId);
          clearCiState();
        },
      });
    }

    if (node.workspaceId) {
      items.push({
        id: 'delete-config',
        label: t.ciDeleteConfig,
        danger: true as const,
        action: () => callbacks.onDeleteWorkspaceConfig(node.workspaceId!),
      });
    } else if (node.nodeType === 'folder') {
      items.push({
        id: 'delete-config',
        label: t.ciDeleteConfig,
        danger: true as const,
        action: () => gitHubDeleteFolderConfig(folderId),
      });
    }

    if (node.workspaceId || node.nodeType === 'folder') {
      items.push({
        id: 'delete-data',
        label: t.ciDeleteData,
        danger: true as const,
        action: () => clearCiState(),
      });
    }

    if (node.workspaceId) {
      items.push({
        id: 'delete-config-and-data',
        label: t.ciDeleteConfigAndData,
        danger: true as const,
        action: () => {
          callbacks.onDeleteWorkspaceConfig(node.workspaceId!);
          clearCiState();
        },
      });
    } else if (node.nodeType === 'folder') {
      items.push({
        id: 'delete-config-and-data',
        label: t.ciDeleteConfigAndData,
        danger: true as const,
        action: () => {
          gitHubDeleteFolderConfig(folderId);
          clearCiState();
        },
      });
    }

    if (isNestedFolder || isUserFolderRoot || node.nodeType === 'workspace') {
      items.push({ id: 'sep-recursive', separator: true });
      items.push({
        id: 'delete-config-recursive',
        label: t.ciDeleteNestedConfig,
        danger: true as const,
        hasHint: true,
        hint: t.ciDeleteNestedConfigHint,
        action: () => {
          gitHubDeleteFolderConfigRecursive(folderId);
        },
      });
      items.push({
        id: 'delete-data-recursive',
        label: t.ciDeleteNestedData,
        danger: true as const,
        hasHint: true,
        hint: t.ciDeleteNestedDataHint,
        action: () => {
          gitHubDeleteFolderDataRecursive(folderId);
        },
      });
      items.push({
        id: 'delete-config-and-data-recursive',
        label: t.ciDeleteNestedAll,
        danger: true as const,
        hasHint: true,
        hint: t.ciDeleteNestedAllHint,
        action: () => {
          gitHubDeleteFolderConfigAndDataRecursive(folderId);
        },
      });
    }

    return items;
  })();

  const renderChildCount = useCallback((childNode: GitHubTreeNode) => {
    if (childNode.kind === 'directory') {
      return childNode.children.length;
    }
    return undefined;
  }, []);

  const renderSubEntryIcon = useCallback((childNode: GitHubTreeNode) => {
    if (childNode.nodeType === 'folder') {
      return (
        <span className="adl-filetree__file-icon adl-filetree__file-icon--default">
          <span className="adl-filetree__file-badge">DIR</span>
        </span>
      );
    }
    const parts = childNode.path.split(':');
    const section = parts[parts.length - 1];
    const icon = section ? SUB_ENTRY_ICONS[section] : null;
    if (icon) {
      return <span className="adl-github-entry__icon">{icon}</span>;
    }
    return undefined;
  }, []);

  const renderChildMeta = useCallback(
    (childNode: GitHubTreeNode) => {
      if (childNode.nodeType !== 'folder') {
        return null;
      }
      const childFolderId = childNode.path.startsWith('github-folder:')
        ? childNode.path.slice('github-folder:'.length)
        : '';

      return (
        <span className="adl-browser-node__actions">
          <TooltipSimple content={t.refresh} placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                callbacks.onRefreshWorkspace(childFolderId);
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
                callbacks.onOpenFolderSettings(childFolderId);
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
                setChildMenuState({
                  x: e.clientX + 4,
                  y: e.clientY,
                  nodePath: childNode.path,
                  nodeType: childNode.nodeType,
                });
              }}
              aria-label={t.moreActions}
            >
              <IconMoreVertical size={12} decorative />
            </button>
          </TooltipSimple>
        </span>
      );
    },
    [callbacks, t]
  );

  const handleChildClick = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      onTogglePath(path);
    },
    [onSelectTreePath, onTogglePath]
  );

  const handleChildOpenFile = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      const parts = path.split(':');
      if (parts.length >= 3 && parts[0] === 'github-workspace') {
        const wsId = parts[1];
        const section = parts[2] as 'overview' | 'workflows' | 'jobs' | 'logs';
        callbacks.onSelectSection(wsId, section);
      }
    },
    [onSelectTreePath, callbacks]
  );

  const handleChildContextMenu = useCallback(
    (childNode: GitHubTreeNode) => {
      const childFolderId = childNode.path.startsWith('github-folder:')
        ? childNode.path.slice('github-folder:'.length)
        : '';
      const childIsPinned =
        gitHubCiFolders.find((f) => f.id === childFolderId)?.pinnedOrder !== undefined;
      // 工作区目录的嵌套子目录
      const isWorkspaceChild = childNode.nodeType === 'folder' && !!node.workspaceId;
      // 非工作区目录的嵌套子目录（路径中包含 / 表示是嵌套的）
      const isUserFolderChild =
        childNode.nodeType === 'folder' && !node.workspaceId && childNode.path.includes('/');
      // 非工作区目录的顶级目录（路径中没有 /）
      const isUserFolderRoot =
        childNode.nodeType === 'folder' && !node.workspaceId && !childNode.path.includes('/');
      // 显示删除目录：工作区嵌套子目录、非工作区嵌套子目录、非工作区顶级目录
      const showDeleteFolder: boolean = isWorkspaceChild || isUserFolderChild || isUserFolderRoot;

      return getChildNodeMoreMenuItems(
        childNode.nodeType,
        childNode.path,
        childNode.name,
        categoryType,
        handleStartRename,
        () => clearCiState(),
        () => {
          if (node.workspaceId) {
            callbacks.onDeleteWorkspaceConfig(node.workspaceId);
          } else {
            gitHubDeleteFolderConfig(childFolderId);
          }
        },
        () => clearCiState(),
        () => {
          if (node.workspaceId) {
            callbacks.onDeleteWorkspaceConfig(node.workspaceId);
            clearCiState();
          } else {
            gitHubDeleteFolderConfig(childFolderId);
            clearCiState();
          }
        },
        () => {
          if (node.workspaceId) {
            callbacks.onOpenSettings(node.workspaceId);
          } else {
            callbacks.onOpenFolderSettings(childFolderId);
          }
        },
        () => gitHubPinFolder(childFolderId),
        () => gitHubUnpinFolder(childFolderId),
        childIsPinned,
        () => {
          gitHubDeleteFolder(childFolderId);
          clearCiState();
        },
        showDeleteFolder,
        t,
        () => gitHubDeleteFolderConfigRecursive(childFolderId),
        () => {
          gitHubDeleteFolderDataRecursive(childFolderId);
        },
        () => gitHubDeleteFolderConfigAndDataRecursive(childFolderId)
      ).map((item: ChildMenuItem) => {
        if ('separator' in item) {
          return { id: item.id, separator: true as const };
        }
        return {
          id: item.id,
          label: item.label,
          danger: item.danger,
          action: () => item.action(),
          hasHint: item.hasHint,
          hint: item.hint,
        };
      });
    },
    [
      categoryType,
      handleStartRename,
      clearCiState,
      callbacks,
      node.workspaceId,
      gitHubDeleteFolderConfig,
      gitHubDeleteFolderConfigRecursive,
      gitHubDeleteFolderDataRecursive,
      gitHubDeleteFolderConfigAndDataRecursive,
      gitHubCiFolders,
      gitHubPinFolder,
      gitHubUnpinFolder,
      gitHubDeleteFolder,
      t,
    ]
  );

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

  const handleChildMenuClick = useCallback((action: () => void) => {
    action();
    setChildMenuState(null);
  }, []);

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

  const fileTreeChildren =
    isExpanded && node.children.length > 0 ? (
      <div className="adl-browser-entry__tree">
        <FileTree<GitHubTreeNode>
          nodes={node.children}
          selectedFilePath={selectedTreePath ?? undefined}
          expandedPaths={expandedPaths}
          onToggle={handleChildClick}
          onOpenFile={handleChildOpenFile}
          renderMeta={renderChildMeta}
          renderCount={renderChildCount}
          renderIconBefore={renderSubEntryIcon}
          getContextMenuItems={handleChildContextMenu}
          expandLabel={t.expand}
          collapseLabel={t.collapse}
        />
      </div>
    ) : null;

  const childMenuSlot = childMenuState
    ? createPortal(
        <div
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="github-child-menu"
          style={{
            position: 'fixed',
            top: childMenuState.y,
            left: childMenuState.x,
            zIndex: 9999,
          }}
        >
          {(() => {
            const childFolderId = childMenuState.nodePath.startsWith('github-folder:')
              ? childMenuState.nodePath.slice('github-folder:'.length)
              : '';
            const childIsPinned =
              gitHubCiFolders.find((f) => f.id === childFolderId)?.pinnedOrder !== undefined;
            // 工作区目录的嵌套子目录
            const isWorkspaceChild = childMenuState.nodeType === 'folder' && !!node.workspaceId;
            // 非工作区目录的嵌套子目录（路径中包含 / 表示是嵌套的）
            const isUserFolderChild =
              childMenuState.nodeType === 'folder' &&
              !node.workspaceId &&
              childMenuState.nodePath.includes('/');
            // 非工作区目录的顶级目录（路径中没有 /）
            const isUserFolderRoot =
              childMenuState.nodeType === 'folder' &&
              !node.workspaceId &&
              !childMenuState.nodePath.includes('/');
            // 显示删除目录：工作区嵌套子目录、非工作区嵌套子目录、非工作区顶级目录
            const showDeleteFolder: boolean =
              isWorkspaceChild || isUserFolderChild || isUserFolderRoot;

            return getChildNodeMoreMenuItems(
              childMenuState.nodeType,
              childMenuState.nodePath,
              '',
              categoryType,
              handleStartRename,
              () => clearCiState(),
              () => {
                if (node.workspaceId) {
                  callbacks.onDeleteWorkspaceConfig(node.workspaceId);
                } else {
                  gitHubDeleteFolderConfig(childFolderId);
                }
              },
              () => clearCiState(),
              () => {
                if (node.workspaceId) {
                  callbacks.onDeleteWorkspaceConfig(node.workspaceId);
                  clearCiState();
                } else {
                  gitHubDeleteFolderConfig(childFolderId);
                  clearCiState();
                }
              },
              () => {
                if (node.workspaceId) {
                  callbacks.onOpenSettings(node.workspaceId);
                } else {
                  callbacks.onOpenFolderSettings(childFolderId);
                }
              },
              () => gitHubPinFolder(childFolderId),
              () => gitHubUnpinFolder(childFolderId),
              childIsPinned,
              () => {
                gitHubDeleteFolder(childFolderId);
                clearCiState();
              },
              showDeleteFolder,
              t,
              () => gitHubDeleteFolderConfigRecursive(childFolderId),
              () => {
                gitHubDeleteFolderDataRecursive(childFolderId);
              },
              () => gitHubDeleteFolderConfigAndDataRecursive(childFolderId)
            );
          })().map((item) => {
            if ('separator' in item) {
              return (
                <div key={item.id} className="adl-multitree-entry__menu-sep" role="separator" />
              );
            }
            return item.hasHint && item.hint ? (
              <MenuHintItem
                key={item.id}
                label={item.label}
                hint={item.hint}
                onClick={() => handleChildMenuClick(item.action)}
                menuId="github-child-menu"
                danger={item.danger}
              />
            ) : (
              <button
                key={item.id}
                type="button"
                className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                role="menuitem"
                onClick={() => handleChildMenuClick(item.action)}
              >
                {item.label}
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
        <>
          {childMenuSlot}
          <RenameDialog
            open={!!renameFolderState}
            initialValue={renameFolderState?.folderName ?? ''}
            title={t.changesRenameDir}
            onConfirm={handleConfirmRename}
            onCancel={handleCancelRename}
          />
        </>
      }
    >
      {fileTreeChildren}
    </MultiTreeEntryShell>
  );
});
