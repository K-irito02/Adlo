import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconSettings, IconRefreshCw, IconMoreVertical } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { MenuHintItem } from '../../regions/right-panel/panels/communicate/MenuHintItem';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../../i18n/useTCopy';
import { useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';
import { SUB_ENTRY_ICONS, getChildNodeMoreMenuItems } from './GitHubEntryMenus';

interface GitHubEntrySubEntriesProps {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
  onStartRename: (folderId: string, currentName: string) => void;
}

export const GitHubEntrySubEntries = React.memo(function GitHubEntrySubEntries({
  node,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  onStartRename,
}: GitHubEntrySubEntriesProps) {
  const { t } = useTCopy();
  const isExpanded = expandedPaths[node.path] ?? false;

  const {
    gitHubDeleteFolderConfig,
    gitHubDeleteFolderConfigRecursive,
    gitHubDeleteFolderDataRecursive,
    gitHubDeleteFolderConfigAndDataRecursive,
    gitHubDeleteFolder,
    gitHubPinFolder,
    gitHubUnpinFolder,
    gitHubCiFolders,
    clearCiState,
  } = useAppStore(
    useShallow((s) => ({
      gitHubDeleteFolderConfig: s.gitHubDeleteFolderConfig,
      gitHubDeleteFolderConfigRecursive: s.gitHubDeleteFolderConfigRecursive,
      gitHubDeleteFolderDataRecursive: s.gitHubDeleteFolderDataRecursive,
      gitHubDeleteFolderConfigAndDataRecursive: s.gitHubDeleteFolderConfigAndDataRecursive,
      gitHubDeleteFolder: s.gitHubDeleteFolder,
      gitHubPinFolder: s.gitHubPinFolder,
      gitHubUnpinFolder: s.gitHubUnpinFolder,
      gitHubCiFolders: s.gitHubCiFolders,
      clearCiState: s.clearCiState,
    }))
  );

  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    nodePath: string;
    nodeType: string;
  } | null>(null);

  useMenuCloseOnOutsideClick(!!childMenuState, 'github-child-menu', () => setChildMenuState(null));

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

  const renderChildCount = useCallback((childNode: GitHubTreeNode) => {
    if (childNode.kind === 'directory') {
      return childNode.children.length;
    }
    return undefined;
  }, []);

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
      const isWorkspaceChild = childNode.nodeType === 'folder' && !!node.workspaceId;
      const isUserFolderChild =
        childNode.nodeType === 'folder' && !node.workspaceId && childNode.path.includes('/');
      const isUserFolderRoot =
        childNode.nodeType === 'folder' && !node.workspaceId && !childNode.path.includes('/');
      const showDeleteFolder: boolean = isWorkspaceChild || isUserFolderChild || isUserFolderRoot;

      return getChildNodeMoreMenuItems(
        childNode.nodeType,
        childNode.path,
        childNode.name,
        categoryType,
        onStartRename,
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
      ).map((item) => {
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
      onStartRename,
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

  const handleChildMenuClick = useCallback((action: () => void) => {
    action();
    setChildMenuState(null);
  }, []);

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
            const isWorkspaceChild = childMenuState.nodeType === 'folder' && !!node.workspaceId;
            const isUserFolderChild =
              childMenuState.nodeType === 'folder' &&
              !node.workspaceId &&
              childMenuState.nodePath.includes('/');
            const isUserFolderRoot =
              childMenuState.nodeType === 'folder' &&
              !node.workspaceId &&
              !childMenuState.nodePath.includes('/');
            const showDeleteFolder: boolean =
              isWorkspaceChild || isUserFolderChild || isUserFolderRoot;

            return getChildNodeMoreMenuItems(
              childMenuState.nodeType,
              childMenuState.nodePath,
              '',
              categoryType,
              onStartRename,
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
    <>
      {childMenuSlot}
      {fileTreeChildren}
    </>
  );
});
