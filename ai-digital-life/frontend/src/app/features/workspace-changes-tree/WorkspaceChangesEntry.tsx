import React, { useCallback, useMemo, useState } from 'react';
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
import { WorkspaceRemoveConfirmDialog } from '@components/WorkspaceRemoveConfirmDialog';
import { useWorkspaceChangesActions } from './WorkspaceChangesActions';
import { WorkspaceChangesMenu } from './WorkspaceChangesMenu';

export interface WorkspaceChangesEntryProps {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  treeNodes: WorkspaceTreeNode[] | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | undefined;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  clickedPath: string | undefined;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  changeCount: number;
  onRefreshTree: () => void;
  onToggleFileTreePath: (path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  onNodeClicked: (path: string, kind: 'directory' | 'file') => void;
  onWorkspaceRootClick?: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  onRequestDiscardConfirm?: (path: string, workspacePath: string) => void;
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
  isRefreshing,
  error,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  clickedPath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onHideFromRightPanels,
  changeCount,
  onRefreshTree,
  onToggleFileTreePath,
  onOpenChangePreview,
  onNodeClicked,
  onWorkspaceRootClick,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
  onRequestDiscardConfirm,
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
    onWorkspaceRootClick,
    setRenamingWorkspacePath,
    setDeleteWorkspacePath,
    onRequestDiscardConfirm,
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
                <IconRefreshCw
                  size={12}
                  decorative
                  className={isRefreshing ? 'adl-spin' : undefined}
                />
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
        onHideFromRightPanels={handleRequestRemove}
        onRevealInFileManager={handleRevealInFileManager}
        onCopyFullPath={handleCopyFullPath}
        onCopyRelativePath={handleCopyRelativePath}
        onClose={closeMenu}
      />

      <WorkspaceRemoveConfirmDialog
        open={confirmRemoveOpen}
        workspaceName={workspace.name}
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemoveOpen(false)}
      />

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {treeNodes && treeNodes.length > 0 ? (
            <FileTree
              nodes={treeNodes}
              selectedFilePath={effectiveSelectedPath}
              extraSelectedPath={clickedPath}
              activePathIsWeak
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={(path) => {
                onNodeClicked(path, 'directory');
                onToggleFileTreePath(path);
              }}
              onOpenFile={(path) => {
                onNodeClicked(path, 'file');
                onOpenChangePreview(workspace.path, path);
              }}
              getContextMenuItems={wrappedGetContextMenuItems}
              contextMenuPersistRef={contextMenuPersistRef}
              clearMenuHighlightRef={clearMenuHighlightRef}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
              renderMeta={renderMeta}
              renderCount={renderCount}
            />
          ) : isLoading ? (
            <LoadingRow />
          ) : error ? (
            <div className="adl-multitree-entry__error">
              <IconAlertTriangle size={14} decorative />
              <span>{error}</span>
            </div>
          ) : (
            <EmptyRow message={t.changesEmpty as string} />
          )}
        </div>
      ) : null}
    </div>
  );
});
