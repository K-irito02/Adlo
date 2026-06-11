import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconTrash, IconSettings, IconFolder, IconFolderOpen, IconRefreshCw, IconMoreVertical } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { RenameDialog } from '../../components/RenameDialog';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';

const SUB_ENTRY_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 2h5v5H2V2zm0 7h5v5H2V9zm7-7h5v5H9V2zm0 7h5v5H9V9z" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z" />
    </svg>
  ),
  jobs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7zM3.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9z" />
      <path d="M4.5 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
    </svg>
  ),
};

interface GitHubTreeEntryProps {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

function getChildNodeMoreMenuItems(
  nodeType: string,
  nodePath: string,
  currentName: string,
  categoryType: GitHubCategoryType,
  onRename: (folderId: string, currentName: string) => void,
  onRefresh: () => void,
  onDeleteConfig: () => void,
  onDeleteData: () => void,
  onDeleteConfigAndData: () => void,
  onSettings: () => void
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (nodeType !== 'folder') return [];
  const folderId = nodePath.startsWith('github-folder:')
    ? nodePath.slice('github-folder:'.length)
    : '';
  const items: Array<{ id: string; label: string; danger?: boolean; action: () => void }> = [
    {
      id: 'refresh',
      label: '刷新',
      action: onRefresh,
    },
    {
      id: 'rename',
      label: '重命名',
      action: () => onRename(folderId, currentName),
    },
    {
      id: 'settings',
      label: '设置',
      action: onSettings,
    },
    {
      id: 'delete-config',
      label: '删除CI配置',
      danger: true as const,
      action: onDeleteConfig,
    },
    {
      id: 'delete-data',
      label: '删除数据',
      danger: true as const,
      action: onDeleteData,
    },
    {
      id: 'delete-config-and-data',
      label: '删除CI配置及数据',
      danger: true as const,
      action: onDeleteConfigAndData,
    },
  ];
  return items;
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

  const { gitHubDeleteFolderConfig, gitHubRenameFolder, clearCiState } = useAppStore(
    useShallow((s) => ({
      gitHubDeleteFolderConfig: s.gitHubDeleteFolderConfig,
      gitHubRenameFolder: s.gitHubRenameFolder,
      clearCiState: s.clearCiState,
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

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      if (menuEl?.contains(target)) return;
      setMenuOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [menuOpen, menuId]);

  useEffect(() => {
    if (!childMenuState) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="github-child-menu"]`);
      if (menuEl?.contains(target)) return;
      setChildMenuState(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [childMenuState]);

  const menuItems = (() => {
    const items: Array<{ id: string; label: string; danger?: boolean; action: () => void }> = [];

    // 刷新 - 所有节点都有
    if (node.workspaceId) {
      items.push({
        id: 'refresh',
        label: '刷新',
        action: () => callbacks.onRefreshWorkspace(node.workspaceId!),
      });
    } else if (node.nodeType === 'folder') {
      items.push({
        id: 'refresh',
        label: '刷新',
        action: () => clearCiState(),
      });
    }

    // 重命名 - 工作区目录的顶级目录没有重命名
    if (!(categoryType === 'ci-workspace' && node.nodeType === 'workspace')) {
      if (node.nodeType === 'folder') {
        const folderId = node.path.replace('github-folder:', '');
        items.push({
          id: 'rename',
          label: '重命名',
          action: () => handleStartRename(folderId, node.name),
        });
      }
    }

    // 设置 - 所有节点都有（移到删除操作之前）
    if (node.workspaceId) {
      items.push({
        id: 'settings',
        label: '设置',
        action: () => callbacks.onOpenSettings(node.workspaceId!),
      });
    } else if (node.nodeType === 'folder') {
      const folderId = node.path.replace('github-folder:', '');
      items.push({
        id: 'settings',
        label: '设置',
        action: () => callbacks.onOpenFolderSettings(folderId),
      });
    }

    // 删除CI配置 - 所有节点都有
    if (node.workspaceId) {
      items.push({
        id: 'delete-config',
        label: '删除CI配置',
        danger: true as const,
        action: () => callbacks.onDeleteWorkspaceConfig(node.workspaceId!),
      });
    } else if (node.nodeType === 'folder') {
      const folderId = node.path.replace('github-folder:', '');
      items.push({
        id: 'delete-config',
        label: '删除CI配置',
        danger: true as const,
        action: () => gitHubDeleteFolderConfig(folderId),
      });
    }

    // 删除数据 - 所有节点都有
    if (node.workspaceId || node.nodeType === 'folder') {
      items.push({
        id: 'delete-data',
        label: '删除数据',
        danger: true as const,
        action: () => clearCiState(),
      });
    }

    // 删除CI配置及数据 - 所有节点都有
    if (node.workspaceId) {
      items.push({
        id: 'delete-config-and-data',
        label: '删除CI配置及数据',
        danger: true as const,
        action: () => {
          callbacks.onDeleteWorkspaceConfig(node.workspaceId!);
          clearCiState();
        },
      });
    } else if (node.nodeType === 'folder') {
      const folderId = node.path.replace('github-folder:', '');
      items.push({
        id: 'delete-config-and-data',
        label: '删除CI配置及数据',
        danger: true as const,
        action: () => {
          gitHubDeleteFolderConfig(folderId);
          clearCiState();
        },
      });
    }

    return items;
  })();

  const renderChildCount = useCallback((childNode: GitHubTreeNode) => {
    if (childNode.kind === 'directory') return childNode.children.length;
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
      if (childNode.nodeType !== 'folder') return null;
      const childFolderId = childNode.path.startsWith('github-folder:')
        ? childNode.path.slice('github-folder:'.length)
        : '';
      const isUnderWorkspace = !!node.workspaceId;

      const handleOpenChildMenu = useCallback(
        (e: React.MouseEvent) => {
          e.stopPropagation();
          setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
          setMenuOpen(true);
        },
        []
      );

      return (
        <span className="adl-browser-node__actions">
          {/* 刷新按钮 */}
          <TooltipSimple content="刷新" placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                clearCiState();
              }}
              aria-label="刷新"
            >
              <IconRefreshCw size={12} decorative />
            </button>
          </TooltipSimple>
          {/* 设置按钮 - 所有目录都有 */}
          <TooltipSimple content="设置" placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                if (isUnderWorkspace && node.workspaceId) {
                  callbacks.onOpenSettings(node.workspaceId);
                } else {
                  callbacks.onOpenFolderSettings(childFolderId);
                }
              }}
              aria-label="设置"
            >
              <IconSettings size={12} decorative />
            </button>
          </TooltipSimple>
          {/* 更多操作按钮 */}
          <TooltipSimple content="更多操作" placement="top">
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
              aria-label="更多操作"
            >
              <IconMoreVertical size={12} decorative />
            </button>
          </TooltipSimple>
        </span>
      );
    },
    [clearCiState, callbacks, node.workspaceId]
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
        }
      ).map((item) => ({
        id: item.id,
        label: item.label,
        danger: item.danger,
        action: () => item.action(),
      }));
    },
    [categoryType, handleStartRename, clearCiState, callbacks, node.workspaceId, gitHubDeleteFolderConfig]
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
      if (e.key === 'Enter') onSelectTreePath(node.path);
    },
    [onSelectTreePath, node.path]
  );

  const handleWorkspaceConfigClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      callbacks.onDeleteWorkspaceConfig(node.workspaceId!);
    },
    [callbacks, node.workspaceId]
  );

  const handleOpenSettingsClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      callbacks.onOpenSettings(node.workspaceId!);
    },
    [callbacks, node.workspaceId]
  );

  const handleDeleteFolderClick = useCallback(
    (e: React.MouseEvent, folderId: string) => {
      e.stopPropagation();
      gitHubDeleteFolderConfig(folderId);
    },
    [gitHubDeleteFolderConfig]
  );

  const handleStartRenameClick = useCallback(
    (e: React.MouseEvent, folderId: string, name: string) => {
      e.stopPropagation();
      handleStartRename(folderId, name);
    },
    [handleStartRename]
  );

  const handleChildMenuClick = useCallback((action: () => void) => {
    action();
    setChildMenuState(null);
  }, []);

  const handleMenuClick = useCallback((action: () => void) => {
    action();
    setMenuOpen(false);
  }, []);

  return (
    <div className="adl-browser-entry">
      <div
        className={`adl-browser-entry__header${isSelected ? ' is-selected' : ''}`}
        onClick={handleHeaderClick}
        onContextMenu={handleHeaderContextMenu}
      >
        <div className="adl-browser-entry__expand">
          <button
            type="button"
            className={`adl-browser-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
            onClick={handleExpandBtnClick}
            aria-label={isExpanded ? '收起' : '展开'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
          </button>
        </div>
        <div
          className="adl-browser-entry__namezone"
          onKeyDown={handleNameKeyDown}
          role="button"
          tabIndex={0}
        >
          <span className="adl-browser-entry__name" title={node.name}>
            {node.name}
          </span>
          <div className="adl-browser-entry__trailing">
            <span className="adl-browser-entry__count">{count}</span>
            <div className="adl-browser-entry__actions">
              {/* 刷新按钮 - 所有目录都有 */}
              <TooltipSimple content="刷新" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.workspaceId) {
                      callbacks.onRefreshWorkspace(node.workspaceId);
                    } else {
                      clearCiState();
                    }
                  }}
                  aria-label="刷新"
                >
                  <IconRefreshCw size={12} decorative />
                </button>
              </TooltipSimple>
              {/* 设置按钮 - 所有目录都有 */}
              <TooltipSimple content="设置" placement="top">
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
                  aria-label="设置"
                >
                  <IconSettings size={12} decorative />
                </button>
              </TooltipSimple>
              {/* 更多操作按钮 - 所有目录都有 */}
              <TooltipSimple content="更多操作" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
                    setMenuOpen(true);
                  }}
                  aria-label="更多操作"
                >
                  <IconMoreVertical size={12} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition && menuItems.length > 0
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id={menuId}
              style={{ 
                position: 'fixed',
                top: menuPosition.top, 
                left: menuPosition.left,
                width: '176px',
                zIndex: 9999,
              }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={() => handleMenuClick(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}

      {isExpanded && node.children.length > 0 ? (
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
            expandLabel="展开"
            collapseLabel="收起"
          />
        </div>
      ) : null}

      {isExpanded && node.children.length === 0 ? (
        <div className="adl-browser-entry__empty">
          <span className="adl-empty-hint">暂无内容</span>
        </div>
      ) : null}

      {childMenuState
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id="github-child-menu"
              style={{ 
                position: 'fixed',
                top: childMenuState.y, 
                left: childMenuState.x,
                width: '176px',
                zIndex: 9999,
              }}
            >
              {(() => {
                const childFolderId = childMenuState.nodePath.startsWith('github-folder:')
                  ? childMenuState.nodePath.slice('github-folder:'.length)
                  : '';
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
                  }
                );
              })().map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={() => handleChildMenuClick(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}

      <RenameDialog
        open={!!renameFolderState}
        initialValue={renameFolderState?.folderName ?? ''}
        title="重命名目录"
        onConfirm={handleConfirmRename}
        onCancel={handleCancelRename}
      />
    </div>
  );
});
