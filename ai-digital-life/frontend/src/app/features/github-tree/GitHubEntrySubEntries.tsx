import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileTree } from '../file-tree';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useClampedMenuPosition, useMenuCloseOnOutsideClick } from '../tree/treeEntryMenus';
import { MenuHintItem } from '@regions/right-panel/panels/communicate/MenuHintItem';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';
import { buildChildFolderMenuItems } from './GitHubChildMenuLogic';
import { renderChildMeta, renderChildCount, renderSubEntryIcon } from './GitHubEntryRenderers';

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
    })),
  );

  const [childMenuState, setChildMenuState] = useState<{
    x: number;
    y: number;
    childNode: GitHubTreeNode;
  } | null>(null);

  useMenuCloseOnOutsideClick(!!childMenuState, 'github-child-menu', () => setChildMenuState(null));

  // 子菜单视口钳制（事项 16 同类）：底部行不再被应用下边缘裁剪。
  const childMenuPosition = useMemo(
    () => (childMenuState ? { top: childMenuState.y, left: childMenuState.x } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅坐标参与钳制
    [childMenuState?.x, childMenuState?.y],
  );
  const childMenuClamp = useClampedMenuPosition(childMenuPosition);

  const pinnedFolderIds = useMemo(
    () => new Set(gitHubCiFolders.filter((f) => f.pinnedOrder !== undefined).map((f) => f.id)),
    [gitHubCiFolders],
  );

  const handleOpenChildMenu = useCallback((childNode: GitHubTreeNode, x: number, y: number) => {
    setChildMenuState({ x, y, childNode });
  }, []);

  const childMetaRenderer = useCallback(
    (childNode: GitHubTreeNode) => renderChildMeta(childNode, t, callbacks, handleOpenChildMenu),
    [t, callbacks, handleOpenChildMenu],
  );

  const handleChildClick = useCallback(
    (path: string) => {
      onSelectTreePath(path);
      onTogglePath(path);
    },
    [onSelectTreePath, onTogglePath],
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
    [onSelectTreePath, callbacks],
  );

  const buildMenuItems = useCallback(
    (child: GitHubTreeNode, name: string) =>
      buildChildFolderMenuItems({
        child,
        name,
        categoryType,
        workspaceId: node.workspaceId,
        pinnedFolderIds,
        t,
        onStartRename,
        clearCiState,
        callbacks,
        gitHubDeleteFolderConfig,
        gitHubDeleteFolderConfigRecursive,
        gitHubDeleteFolderDataRecursive,
        gitHubDeleteFolderConfigAndDataRecursive,
        gitHubDeleteFolder,
        gitHubPinFolder,
        gitHubUnpinFolder,
      }),
    [
      categoryType,
      node.workspaceId,
      pinnedFolderIds,
      t,
      onStartRename,
      clearCiState,
      callbacks,
      gitHubDeleteFolderConfig,
      gitHubDeleteFolderConfigRecursive,
      gitHubDeleteFolderDataRecursive,
      gitHubDeleteFolderConfigAndDataRecursive,
      gitHubDeleteFolder,
      gitHubPinFolder,
      gitHubUnpinFolder,
    ],
  );

  const handleChildContextMenu = useCallback(
    (childNode: GitHubTreeNode) =>
      buildMenuItems(childNode, childNode.name).map((item) => {
        if ('separator' in item) {
          return { id: item.id, separator: true as const };
        }
        return {
          id: item.id,
          label: item.label,
          badge: item.badge,
          danger: item.danger,
          action: () => item.action(),
          hasHint: item.hasHint,
          hint: item.hint,
        };
      }),
    [buildMenuItems],
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
          renderMeta={childMetaRenderer}
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
          ref={childMenuClamp.menuRef}
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="github-child-menu"
          style={
            childMenuClamp.adjusted
              ? {
                  position: 'fixed',
                  top: childMenuClamp.adjusted.top,
                  left: childMenuClamp.adjusted.left,
                  zIndex: 'var(--z-max)',
                }
              : {
                  position: 'fixed',
                  top: childMenuState.y,
                  left: childMenuState.x,
                  zIndex: 'var(--z-max)',
                }
          }
        >
          {buildMenuItems(childMenuState.childNode, '').map((item) => {
            if ('separator' in item) {
              return (
                <div key={item.id} className="adl-multitree-entry__menu-sep" role="separator" />
              );
            }
            return item.hasHint && item.hint ? (
              <MenuHintItem
                key={item.id}
                label={item.label}
                badge={item.badge}
                hint={item.hint}
                onClick={() => handleChildMenuClick(item.action)}
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
                {item.badge ? <span className="adl-menu-item__badge">{item.badge}</span> : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {childMenuSlot}
      {fileTreeChildren}
    </>
  );
});
