import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconTrash, IconSettings, IconFolder, IconFolderOpen } from '../../icons';
import { FileTree } from '../file-tree';
import { TooltipSimple } from '../../components/Tooltip';
import { RenameDialog } from '../../components/RenameDialog';
import { useAppStore } from '../../stores/slicedStore';
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
  onRename: (folderId: string, currentName: string) => void
): Array<{ id: string; label: string; danger?: boolean; action: () => void }> {
  if (nodeType !== 'folder') return [];
  const folderId = nodePath.startsWith('github-folder:')
    ? nodePath.slice('github-folder:'.length)
    : '';
  return [
    {
      id: 'delete',
      label: '删除CI配置及数据',
      danger: true as const,
      action: () => useAppStore.getState().gitHubDeleteFolder(folderId),
    },
    {
      id: 'rename',
      label: '重命名',
      action: () => onRename(folderId, currentName),
    },
  ];
}

export function GitHubTreeEntry({
  node,
  categoryType: _categoryType,
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

  const gitHubDeleteFolder = useAppStore((s) => s.gitHubDeleteFolder);
  const gitHubRenameFolder = useAppStore((s) => s.gitHubRenameFolder);

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

  const menuItems = node.workspaceId
    ? [
        {
          id: 'refresh',
          label: '刷新 CI 状态',
          action: () => callbacks.onRefreshWorkspace(node.workspaceId!),
        },
        {
          id: 'delete-config',
          label: '删除CI配置及数据',
          danger: true as const,
          action: () => callbacks.onDeleteWorkspaceConfig(node.workspaceId!),
        },
      ]
    : [];

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
      const folderId = childNode.path.startsWith('github-folder:')
        ? childNode.path.slice('github-folder:'.length)
        : '';
      const isUnderWorkspace = !!node.workspaceId;
      return (
        <span className="adl-browser-node__actions">
          <TooltipSimple content="删除CI配置及数据" placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                gitHubDeleteFolder(folderId);
              }}
              aria-label="删除CI配置及数据"
            >
              <IconTrash size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content="设置" placement="top">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={(e) => {
                e.stopPropagation();
                if (isUnderWorkspace && node.workspaceId) {
                  callbacks.onOpenSettings(node.workspaceId);
                } else {
                  handleStartRename(folderId, childNode.name);
                }
              }}
              aria-label="设置"
            >
              <IconSettings size={12} decorative />
            </button>
          </TooltipSimple>
        </span>
      );
    },
    [gitHubDeleteFolder, callbacks, node.workspaceId, handleStartRename]
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
    (childNode: GitHubTreeNode) =>
      getChildNodeMoreMenuItems(
        childNode.nodeType,
        childNode.path,
        childNode.name,
        handleStartRename
      ).map((item) => ({
        id: item.id,
        label: item.label,
        danger: item.danger,
        action: () => item.action(),
      })),
    [handleStartRename]
  );

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
            onClick={(e) => {
              e.stopPropagation();
              onTogglePath(node.path);
            }}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectTreePath(node.path);
          }}
          role="button"
          tabIndex={0}
        >
          <span className="adl-browser-entry__name" title={node.name}>
            {node.name}
          </span>
          <div className="adl-browser-entry__trailing">
            <span className="adl-browser-entry__count">{count}</span>
            <div className="adl-browser-entry__actions">
              {node.workspaceId && (
                <>
                  <TooltipSimple content="删除CI配置及数据" placement="top">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        callbacks.onDeleteWorkspaceConfig(node.workspaceId!);
                      }}
                      aria-label="删除CI配置及数据"
                    >
                      <IconTrash size={12} decorative />
                    </button>
                  </TooltipSimple>
                  <TooltipSimple content="设置" placement="top">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        callbacks.onOpenSettings(node.workspaceId!);
                      }}
                      aria-label="设置"
                    >
                      <IconSettings size={12} decorative />
                    </button>
                  </TooltipSimple>
                </>
              )}
              {!node.workspaceId &&
                node.nodeType === 'folder' &&
                (() => {
                  const folderId = node.path.replace('github-folder:', '');
                  return (
                    <>
                      <TooltipSimple content="删除CI配置及数据" placement="top">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            gitHubDeleteFolder(folderId);
                          }}
                          aria-label="删除CI配置及数据"
                        >
                          <IconTrash size={12} decorative />
                        </button>
                      </TooltipSimple>
                      <TooltipSimple content="设置" placement="top">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(folderId, node.name);
                          }}
                          aria-label="设置"
                        >
                          <IconSettings size={12} decorative />
                        </button>
                      </TooltipSimple>
                    </>
                  );
                })()}
            </div>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition && node.workspaceId
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id={menuId}
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    item.action();
                    setMenuOpen(false);
                  }}
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
              style={{ top: childMenuState.y, left: childMenuState.x }}
            >
              {getChildNodeMoreMenuItems(
                childMenuState.nodeType,
                childMenuState.nodePath,
                '',
                handleStartRename
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    item.action();
                    setChildMenuState(null);
                  }}
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
}
