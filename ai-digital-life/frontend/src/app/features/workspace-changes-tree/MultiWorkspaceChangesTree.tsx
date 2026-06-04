import React, { useCallback, useMemo, useState } from 'react';
import type {
  RecentWorkspaceEntry,
  WorkspaceTreeNode,
  ReorderWorkspacesInput,
} from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import type { FileTreeContextMenuItem } from '../../features/file-tree';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceChangesEntry } from './WorkspaceChangesEntry';
import { moveIdWithinBucket } from '../../utils/dragUtils';

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
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  changeCounts: Record<string, number>;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  t: CopyDict;
  renderMeta?: (node: WorkspaceTreeNode) => React.ReactNode;
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
  onPinWorkspace,
  onUnpinWorkspace,
  changeCounts,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenChangePreview,
  onReorderWorkspaces,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  t,
  renderMeta,
}: MultiWorkspaceChangesTreeProps) {
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string | undefined>(undefined);

  const pinnedIds = useMemo(
    () => workspaces.filter((w) => w.isPinned).map((w) => w.id),
    [workspaces]
  );

  const unpinnedIds = useMemo(
    () => workspaces.filter((w) => !w.isPinned).map((w) => w.id),
    [workspaces]
  );

  const handleDrop = useCallback(
    (targetWorkspaceId: string, isPinnedBucket: boolean) => {
      if (!dragWorkspaceId || dragWorkspaceId === targetWorkspaceId) {
        return;
      }

      const bucketIds = isPinnedBucket ? pinnedIds : unpinnedIds;
      if (!bucketIds.includes(dragWorkspaceId)) {
        return;
      }

      const nextIds = moveIdWithinBucket(bucketIds, dragWorkspaceId, targetWorkspaceId);
      const finalPinnedIds = isPinnedBucket ? nextIds : pinnedIds;
      const finalUnpinnedIds = isPinnedBucket ? unpinnedIds : nextIds;

      onReorderWorkspaces({ pinnedIds: finalPinnedIds, unpinnedIds: finalUnpinnedIds });
      setDragWorkspaceId(undefined);
    },
    [dragWorkspaceId, pinnedIds, unpinnedIds, onReorderWorkspaces]
  );

  const renderContent = useCallback(
    (workspace: RecentWorkspaceEntry, isExpanded: boolean) => {
      const isPinned = workspace.isPinned;
      return (
        <div
          key={workspace.id}
          className={`adl-multitree-entry${dragWorkspaceId === workspace.id ? ' is-dragging' : ''}`}
          draggable
          onDragStart={() => setDragWorkspaceId(workspace.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(workspace.id, isPinned)}
        >
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
            onPinWorkspace={() => onPinWorkspace(workspace.id)}
            onUnpinWorkspace={() => onUnpinWorkspace(workspace.id)}
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
      dragWorkspaceId,
      onToggleExpand,
      onRefreshOne,
      onHideFromRightPanels,
      onToggleFileTreePath,
      onOpenChangePreview,
      onReorderWorkspaces,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      t,
      handleDrop,
      renderMeta,
    ]
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
