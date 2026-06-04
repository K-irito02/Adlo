import React, { useCallback, useMemo, useState } from 'react';
import type {
  RecentWorkspaceEntry,
  WorkspaceTreeNode,
  ReorderWorkspacesInput,
} from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import type { FileTreeContextMenuItem } from '../../features/file-tree';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceFileTreeEntry } from './WorkspaceFileTreeEntry';
import { moveIdWithinBucket } from '../../utils/dragUtils';

export interface MultiWorkspaceFileTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  expandedStates: Record<string, boolean>;
  selectedFilePath: string | undefined;
  selectedFileWorkspaceId: string | undefined;
  expandedPaths: Record<string, Record<string, boolean>>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  onOpenWorkspace: (path: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string
  ) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  t: CopyDict;
}

export function MultiWorkspaceFileTree({
  workspaces,
  activeWorkspaceId,
  treeData,
  loadingStates,
  errorStates,
  expandedStates,
  selectedFilePath,
  selectedFileWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onRefreshOne,
  onOpenWorkspace,
  onPinWorkspace,
  onUnpinWorkspace,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenFileForWorkspace,
  onReorderWorkspaces,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  t,
}: MultiWorkspaceFileTreeProps) {
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

      const handleOpenFile = (relativePath: string) => {
        onOpenFileForWorkspace(workspace.id, workspace.path, relativePath);
      };

      return (
        <div
          key={workspace.id}
          className={`adl-multitree-entry${dragWorkspaceId === workspace.id ? ' is-dragging' : ''}`}
          draggable
          onDragStart={() => setDragWorkspaceId(workspace.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(workspace.id, isPinned)}
        >
          <WorkspaceFileTreeEntry
            workspace={workspace}
            isCurrent={workspace.id === activeWorkspaceId}
            isExpanded={isExpanded}
            treeNodes={treeData[workspace.id]}
            isLoading={loadingStates[workspace.id] ?? false}
            error={errorStates[workspace.id]}
            selectedFilePath={selectedFilePath}
            selectedFileWorkspaceId={selectedFileWorkspaceId}
            expandedPaths={expandedPaths[workspace.id] ?? {}}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggleExpand={() => onToggleExpand(workspace.id)}
            onOpenWorkspace={onOpenWorkspace}
            onPinWorkspace={onPinWorkspace}
            onUnpinWorkspace={onUnpinWorkspace}
            onHideFromRightPanels={onHideFromRightPanels}
            onRefreshTree={() => onRefreshOne(workspace.id)}
            onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
            onOpenFile={handleOpenFile}
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
      treeData,
      loadingStates,
      errorStates,
      selectedFilePath,
      selectedFileWorkspaceId,
      expandedPaths,
      dirtyPaths,
      externalChangePath,
      dragWorkspaceId,
      onToggleExpand,
      onRefreshOne,
      onOpenWorkspace,
      onPinWorkspace,
      onUnpinWorkspace,
      onHideFromRightPanels,
      onToggleFileTreePath,
      onOpenFileForWorkspace,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      t,
      handleDrop,
    ]
  );

  if (workspaces.length === 0) {
    return (
      <div className="adl-multitree">
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{t.workspaceEmpty as string}</p>
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
