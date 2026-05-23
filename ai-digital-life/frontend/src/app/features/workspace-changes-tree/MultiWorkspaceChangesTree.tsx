import React, { useCallback, useMemo, useState } from "react";
import type { RecentWorkspaceEntry, WorkspaceTreeNode, ReorderWorkspacesInput } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { FileTreeContextMenuItem } from "../../features/file-tree";
import { CustomScrollArea } from "../../features/file-tree/CustomScrollArea";
import { WorkspaceChangesEntry } from "./WorkspaceChangesEntry";

export interface MultiWorkspaceChangesTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  expandedStates: Record<string, boolean>;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  selectedChangePreviewPath: string | undefined;
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
}

function moveIdWithinBucket(ids: string[], draggedId: string, targetId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(targetIndex, 0, draggedId);
  return next;
}

export function MultiWorkspaceChangesTree({
  workspaces,
  activeWorkspaceId,
  expandedStates,
  treeData,
  loadingStates,
  errorStates,
  selectedChangePreviewPath,
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
}: MultiWorkspaceChangesTreeProps) {
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string | undefined>(undefined);

  const pinnedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.isPinned),
    [workspaces],
  );

  const unpinnedWorkspaces = useMemo(
    () => workspaces.filter((w) => !w.isPinned),
    [workspaces],
  );

  const pinnedIds = useMemo(() => pinnedWorkspaces.map((w) => w.id), [pinnedWorkspaces]);
  const unpinnedIds = useMemo(() => unpinnedWorkspaces.map((w) => w.id), [unpinnedWorkspaces]);

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
    [dragWorkspaceId, pinnedIds, unpinnedIds, onReorderWorkspaces],
  );

  const renderEntry = useCallback(
    (workspace: RecentWorkspaceEntry) => {
      const isPinned = workspace.isPinned;
      return (
        <div
          key={workspace.id}
          className={`adl-multitree-entry${dragWorkspaceId === workspace.id ? " is-dragging" : ""}`}
          draggable
          onDragStart={() => setDragWorkspaceId(workspace.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(workspace.id, isPinned)}
        >
          <WorkspaceChangesEntry
            workspace={workspace}
            isCurrent={workspace.id === activeWorkspaceId}
            isExpanded={expandedStates[workspace.id] ?? false}
            treeNodes={treeData[workspace.id]}
            isLoading={loadingStates[workspace.id] ?? false}
            error={errorStates[workspace.id]}
            selectedChangePreviewPath={selectedChangePreviewPath}
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
          />
        </div>
      );
    },
    [
      activeWorkspaceId,
      expandedStates,
      treeData,
      loadingStates,
      errorStates,
      selectedChangePreviewPath,
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
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      {pinnedWorkspaces.length > 0 ? (
        <>
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>已置顶</span>
            <span className="adl-multitree-section-label__count">{pinnedWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {pinnedWorkspaces.map(renderEntry)}
          </div>
        </>
      ) : null}

      {unpinnedWorkspaces.length > 0 ? (
        <>
          {pinnedWorkspaces.length > 0 ? (
            <div className="adl-multitree__separator" />
          ) : null}
          <div className="adl-multitree-section-label" role="heading" aria-level={2}>
            <span>未置顶</span>
            <span className="adl-multitree-section-label__count">{unpinnedWorkspaces.length}</span>
          </div>
          <div className="adl-multitree__bucket">
            {unpinnedWorkspaces.map(renderEntry)}
          </div>
        </>
      ) : null}
    </CustomScrollArea>
  );
}
