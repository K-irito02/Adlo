import React, { useCallback } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceChangesEntry } from './WorkspaceChangesEntry';
import { useTCopy } from '@i18n/useTCopy';

export interface MultiWorkspaceChangesTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  expandedStates: Record<string, boolean>;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  expandedPaths: Record<string, Record<string, boolean>>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  changeCounts: Record<string, number>;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
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
  errorStates,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onRefreshOne,
  changeCounts,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenChangePreview,
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
            error={errorStates[workspace.id]}
            selectedChangePreviewPath={selectedChangePreviewPath}
            selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
            expandedPaths={expandedPaths[workspace.id] ?? {}}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggleExpand={() => onToggleExpand(workspace.id)}
            onHideFromRightPanels={onHideFromRightPanels}
            changeCount={changeCounts[workspace.id] ?? 0}
            onRefreshTree={() => onRefreshOne(workspace.id)}
            onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
            onOpenChangePreview={onOpenChangePreview}
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
      errorStates,
      selectedChangePreviewPath,
      selectedChangePreviewWorkspaceId,
      expandedPaths,
      dirtyPaths,
      externalChangePath,
      onToggleExpand,
      onRefreshOne,
      onHideFromRightPanels,
      changeCounts,
      onToggleFileTreePath,
      onOpenChangePreview,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      t,
      renderMeta,
      renderCount,
    ],
  );

  if (workspaces.length === 0) {
    return (
      <div className="adl-multitree">
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.changesEmpty as string}</p>
        </div>
      </div>
    );
  }

  return (
    <MultiWorkspaceContainer
      visibleWorkspaces={workspaces}
      expandedState={expandedStates}
      onToggleExpand={onToggleExpand}
      renderContent={renderContent}
    />
  );
}
