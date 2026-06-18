import React from 'react';
import type { WorkspaceTreeNode, RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { MultiWorkspaceFileTree } from '../../features/workspace-file-tree';
import { CustomScrollArea } from '../../features/file-tree/CustomScrollArea';
import { useAppStore } from '../../stores/slicedStore';
import type { FileTreeContextMenuItem } from '../../features/file-tree';

interface FileNavigatorTreeProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
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
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string
  ) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
}

const FileNavigatorTree = React.memo(function FileNavigatorTree({
  visibleWorkspaces,
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
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenFile,
  onOpenFileForWorkspace,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
}: FileNavigatorTreeProps) {
  if (visibleWorkspaces.length === 0) {
    return null;
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <MultiWorkspaceFileTree
        workspaces={visibleWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        treeData={treeData}
        loadingStates={loadingStates}
        errorStates={errorStates}
        expandedStates={expandedStates}
        selectedFilePath={selectedFilePath}
        selectedFileWorkspaceId={selectedFileWorkspaceId}
        expandedPaths={expandedPaths}
        dirtyPaths={dirtyPaths}
        externalChangePath={externalChangePath}
        onToggleExpand={onToggleExpand}
        onRefreshOne={onRefreshOne}
        onOpenWorkspace={(path: string) => {
          useAppStore.getState().openWorkspace(path);
        }}
        onPinWorkspace={(workspaceId: string) => {
          useAppStore.getState().pinWorkspace(workspaceId);
        }}
        onUnpinWorkspace={(workspaceId: string) => {
          useAppStore.getState().unpinWorkspace(workspaceId);
        }}
        onHideFromRightPanels={onHideFromRightPanels}
        onToggleFileTreePath={onToggleFileTreePath}
        onOpenFile={onOpenFile}
        onOpenFileForWorkspace={onOpenFileForWorkspace}
        onReorderWorkspaces={(input) => {
          useAppStore.getState().reorderWorkspaces(input);
        }}
        getContextMenuItems={getContextMenuItems}
        contextMenuPersistRef={contextMenuPersistRef}
        clearMenuHighlightRef={clearMenuHighlightRef}
      />
    </CustomScrollArea>
  );
});

export { FileNavigatorTree };
export type { FileNavigatorTreeProps };
