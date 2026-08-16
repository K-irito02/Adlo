import React, { useCallback } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import { MultiWorkspaceTreeShell } from '../multi-workspace/MultiWorkspaceTreeShell';
import { WorkspaceChangesEntry } from './WorkspaceChangesEntry';
import { useTCopy } from '@i18n/useTCopy';

export interface MultiWorkspaceChangesTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  expandedStates: Record<string, boolean>;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  refreshingStates?: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  clickedPath: string | undefined;
  clickedWorkspaceId: string | undefined;
  expandedPaths: Record<string, Record<string, boolean>>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  changeCounts: Record<string, number>;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  onNodeClicked: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  onWorkspaceRootClick: (workspaceId: string) => void;
  onClearSelection: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  renderMeta?: (node: WorkspaceTreeNode) => React.ReactNode;
  renderCount?: (node: WorkspaceTreeNode) => React.ReactNode;
}

export function MultiWorkspaceChangesTree({
  workspaces,
  activeWorkspaceId,
  expandedStates,
  treeData,
  loadingStates,
  refreshingStates,
  errorStates,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  clickedPath,
  clickedWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onRefreshOne,
  changeCounts,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenChangePreview,
  onNodeClicked,
  onWorkspaceRootClick,
  onClearSelection,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  renderMeta,
  renderCount,
}: MultiWorkspaceChangesTreeProps) {
  const { t } = useTCopy();

  const renderContent = useCallback(
    (workspace: RecentWorkspaceEntry, isExpanded: boolean) => {
      return (
        <div key={workspace.id} className="adl-multitree-entry">
          <WorkspaceChangesEntry
            workspace={workspace}
            isCurrent={workspace.id === activeWorkspaceId}
            isExpanded={isExpanded}
            treeNodes={treeData[workspace.id]}
            isLoading={loadingStates[workspace.id] ?? false}
            isRefreshing={refreshingStates?.[workspace.id] ?? false}
            error={errorStates[workspace.id]}
            selectedChangePreviewPath={selectedChangePreviewPath}
            selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
            clickedPath={clickedWorkspaceId === workspace.id ? clickedPath : undefined}
            expandedPaths={expandedPaths[workspace.id] ?? {}}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggleExpand={() => onToggleExpand(workspace.id)}
            onHideFromRightPanels={onHideFromRightPanels}
            changeCount={changeCounts[workspace.id] ?? 0}
            onRefreshTree={() => onRefreshOne(workspace.id)}
            onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
            onOpenChangePreview={onOpenChangePreview}
            onNodeClicked={(path, kind) => onNodeClicked(workspace.id, path, kind)}
            onWorkspaceRootClick={() => onWorkspaceRootClick(workspace.id)}
            getContextMenuItems={getContextMenuItems}
            contextMenuPersistRef={contextMenuPersistRef}
            clearMenuHighlightRef={clearMenuHighlightRef}
            expandLabel={t.expandDetails as string}
            collapseLabel={t.collapseDetails as string}
            t={t}
            renderMeta={renderMeta}
            renderCount={renderCount}
          />
        </div>
      );
    },
    [
      activeWorkspaceId,
      treeData,
      loadingStates,
      refreshingStates,
      errorStates,
      selectedChangePreviewPath,
      selectedChangePreviewWorkspaceId,
      clickedPath,
      clickedWorkspaceId,
      expandedPaths,
      dirtyPaths,
      externalChangePath,
      onToggleExpand,
      onRefreshOne,
      onHideFromRightPanels,
      changeCounts,
      onToggleFileTreePath,
      onOpenChangePreview,
      onNodeClicked,
      onWorkspaceRootClick,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      t,
      renderMeta,
      renderCount,
    ],
  );

  return (
    <MultiWorkspaceTreeShell
      visibleWorkspaces={workspaces}
      expandedState={expandedStates}
      emptyText={t.changesEmpty as string}
      onToggleExpand={onToggleExpand}
      onClearSelection={onClearSelection}
      renderContent={renderContent}
    />
  );
}
