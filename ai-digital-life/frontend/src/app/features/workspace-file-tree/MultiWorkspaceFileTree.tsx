import { useCallback } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import { MultiWorkspaceTreeShell } from '../multi-workspace/MultiWorkspaceTreeShell';
import { WorkspaceFileTreeEntry } from './WorkspaceFileTreeEntry';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { TreeExpansion } from '@stores/slices/uiSliceTypes';

export interface MultiWorkspaceFileTreeProps {
  workspaces: RecentWorkspaceEntry[];
  activeWorkspaceId: string | undefined;
  treeData: Record<string, WorkspaceTreeNode[]>;
  loadingStates: Record<string, boolean>;
  refreshingStates?: Record<string, boolean>;
  errorStates: Record<string, string | undefined>;
  expandedStates: Record<string, boolean>;
  selectedFilePath: string | undefined;
  selectedFileWorkspaceId: string | undefined;
  clickedPath: string | undefined;
  clickedWorkspaceId: string | undefined;
  expandedPaths: Record<string, TreeExpansion>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => void;
  onNodeClicked: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
}

export function MultiWorkspaceFileTree({
  workspaces,
  activeWorkspaceId,
  treeData,
  loadingStates,
  refreshingStates,
  errorStates,
  expandedStates,
  selectedFilePath,
  selectedFileWorkspaceId,
  clickedPath,
  clickedWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onRefreshOne,
  onSelectWorkspace,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenFileForWorkspace,
  onNodeClicked,
  getContextMenuItems,
  contextMenuPersistRef,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
  clearMenuHighlightRef,
}: MultiWorkspaceFileTreeProps) {
  const { t } = useTCopy();

  const onClearSelection = useCallback(() => {
    useAppStore.getState().clearFileTreeClickedNode();
  }, []);

  const renderContent = useCallback(
    (workspace: RecentWorkspaceEntry, isExpanded: boolean) => {
      const handleOpenFile = (relativePath: string) => {
        onOpenFileForWorkspace(workspace.id, workspace.path, relativePath);
      };

      const handleNodeClicked = (path: string, kind: 'directory' | 'file') => {
        onNodeClicked(workspace.id, path, kind);
      };

      return (
        <div key={workspace.id} className="adl-multitree-entry">
          <WorkspaceFileTreeEntry
            workspace={workspace}
            isCurrent={workspace.id === activeWorkspaceId}
            isExpanded={isExpanded}
            treeNodes={treeData[workspace.id]}
            isLoading={loadingStates[workspace.id] ?? false}
            isRefreshing={refreshingStates?.[workspace.id] ?? false}
            error={errorStates[workspace.id]}
            selectedFilePath={selectedFilePath}
            selectedFileWorkspaceId={selectedFileWorkspaceId}
            clickedPath={clickedWorkspaceId === workspace.id ? clickedPath : undefined}
            expandedPaths={expandedPaths[workspace.id]?.expanded ?? {}}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggleExpand={() => onToggleExpand(workspace.id)}
            onSelectWorkspace={() => onSelectWorkspace(workspace.id)}
            onHideFromRightPanels={onHideFromRightPanels}
            onRefreshTree={() => onRefreshOne(workspace.id)}
            onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
            onOpenFile={handleOpenFile}
            onNodeClicked={handleNodeClicked}
            getContextMenuItems={getContextMenuItems}
            contextMenuPersistRef={contextMenuPersistRef}
            setRenamingWorkspacePath={setRenamingWorkspacePath}
            setDeleteWorkspacePath={setDeleteWorkspacePath}
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
      refreshingStates,
      errorStates,
      selectedFilePath,
      selectedFileWorkspaceId,
      clickedPath,
      clickedWorkspaceId,
      expandedPaths,
      dirtyPaths,
      externalChangePath,
      onToggleExpand,
      onRefreshOne,
      onSelectWorkspace,
      onHideFromRightPanels,
      onToggleFileTreePath,
      onOpenFileForWorkspace,
      onNodeClicked,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      setRenamingWorkspacePath,
      setDeleteWorkspacePath,
      t,
    ],
  );

  return (
    <MultiWorkspaceTreeShell
      visibleWorkspaces={workspaces}
      expandedState={expandedStates}
      emptyText={t.workspaceEmpty as string}
      onToggleExpand={onToggleExpand}
      onClearSelection={onClearSelection}
      renderContent={renderContent}
    />
  );
}
