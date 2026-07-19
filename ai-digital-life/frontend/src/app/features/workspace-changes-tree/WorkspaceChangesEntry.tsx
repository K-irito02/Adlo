import React, { useMemo } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { CopyDict } from '@i18n';
import { useAppStore } from '@stores/slicedStore';
import {
  IconRefreshCw,
  IconMoreVertical,
  IconFolder,
  IconFolderOpen,
  IconAlertTriangle,
} from '@icons';
import { FileTree, type FileTreeContextMenuItem } from '@features/file-tree';
import { TooltipSimple } from '@components/Tooltip';
import { LoadingRow, EmptyRow } from '@components/LoadingRow';
import { useWorkspaceChangesActions } from './WorkspaceChangesActions';
import { WorkspaceChangesMenu } from './WorkspaceChangesMenu';

export interface WorkspaceChangesEntryProps {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  treeNodes: WorkspaceTreeNode[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  changeCount: number;
  onRefreshTree: () => void;
  onToggleFileTreePath: (path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  expandLabel: string;
  collapseLabel: string;
  t: CopyDict;
  renderMeta?: (node: WorkspaceTreeNode) => React.ReactNode;
  renderCount?: (node: WorkspaceTreeNode) => React.ReactNode;
}

export const WorkspaceChangesEntry = React.memo(function WorkspaceChangesEntry({
  workspace,
  isCurrent,
  isExpanded,
  treeNodes,
  isLoading,
  error,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onHideFromRightPanels,
  changeCount,
  onRefreshTree,
  onToggleFileTreePath,
  onOpenChangePreview,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  expandLabel,
  collapseLabel,
  t,
  renderMeta,
  renderCount,
}: WorkspaceChangesEntryProps) {
  const {
    menuOpen,
    menuPosition,
    branchSubOpen,
    setBranchSubOpen,
    menuId,
    handleNameClick,
    handleNameContextMenu,
    handleNameKeyDown,
    handleMoreClick,
    closeMenu,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleRevealInFileManager,
    handleHideFromRightPanels,
    handleRefreshClick,
    wrappedGetContextMenuItems,
  } = useWorkspaceChangesActions({
    workspace,
    onToggleExpand,
    onHideFromRightPanels,
    onRefreshTree,
    getContextMenuItems,
  });

  const effectiveSelectedPath = useMemo(() => {
    if (selectedChangePreviewWorkspaceId === workspace.id) {
      return selectedChangePreviewPath;
    }
    return undefined;
  }, [selectedChangePreviewWorkspaceId, workspace.id, selectedChangePreviewPath]);

  const gitSnapshot = useAppStore((s) => s.gitSnapshots[workspace.id]);
  const currentBranch = gitSnapshot?.branch ?? '';

  return (
    <div
      className={`adl-multitree-entry${isCurrent ? ' is-current' : ''}${!workspace.available ? ' is-unavailable' : ''}`}
    >
      <div className="adl-multitree-entry__header">
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

          <span className="adl-multitree-entry__count">{changeCount}</span>

          <div className="adl-multitree-entry__actions">
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

            <TooltipSimple content={t.fileMoreActions} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                data-menu-btn-id={menuId}
                onClick={handleMoreClick}
                aria-label={t.fileMoreActions}
              >
                <IconMoreVertical size={12} decorative />
              </button>
            </TooltipSimple>
          </div>
        </div>
      </div>

      <WorkspaceChangesMenu
        menuOpen={menuOpen}
        menuPosition={menuPosition}
        menuId={menuId}
        branchSubOpen={branchSubOpen}
        setBranchSubOpen={setBranchSubOpen}
        workspace={workspace}
        gitSnapshot={gitSnapshot}
        currentBranch={currentBranch}
        t={t}
        onHideFromRightPanels={handleHideFromRightPanels}
        onRevealInFileManager={handleRevealInFileManager}
        onCopyFullPath={handleCopyFullPath}
        onCopyRelativePath={handleCopyRelativePath}
        onClose={closeMenu}
      />

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {isLoading ? (
            <LoadingRow />
          ) : error ? (
            <div className="adl-multitree-entry__error">
              <IconAlertTriangle size={14} decorative />
              <span>{error}</span>
            </div>
          ) : treeNodes && treeNodes.length > 0 ? (
            <FileTree
              nodes={treeNodes}
              selectedFilePath={effectiveSelectedPath}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={onToggleFileTreePath}
              onOpenFile={(path) => onOpenChangePreview(workspace.path, path)}
              getContextMenuItems={wrappedGetContextMenuItems}
              contextMenuPersistRef={contextMenuPersistRef}
              clearMenuHighlightRef={clearMenuHighlightRef}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
              renderMeta={renderMeta}
              renderCount={renderCount}
            />
          ) : (
            <EmptyRow message={t.changesEmpty as string} />
          )}
        </div>
      ) : null}
    </div>
  );
});
