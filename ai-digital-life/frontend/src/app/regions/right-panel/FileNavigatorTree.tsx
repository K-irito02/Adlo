import React from 'react';
import type { WorkspaceTreeNode, RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import { MultiWorkspaceFileTree } from '@features/workspace-file-tree';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import type { TreeExpansion } from '@stores/slices/uiSliceTypes';

interface FileNavigatorTreeProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
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
  /** 需要闪烁提示的折叠目录路径（原样透传到 MultiWorkspaceFileTree） */
  flashPath?: string;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => void;
  onNodeClicked: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  onSelectWorkspace: (workspaceId: string) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
}

const FileNavigatorTree = React.memo(function FileNavigatorTree({
  visibleWorkspaces,
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
  flashPath,
  onToggleExpand,
  onRefreshOne,
  onHideFromRightPanels,
  onToggleFileTreePath,
  onOpenFile,
  onOpenFileForWorkspace,
  onNodeClicked,
  onSelectWorkspace,
  getContextMenuItems,
  contextMenuPersistRef,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
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
        refreshingStates={refreshingStates}
        errorStates={errorStates}
        expandedStates={expandedStates}
        selectedFilePath={selectedFilePath}
        selectedFileWorkspaceId={selectedFileWorkspaceId}
        clickedPath={clickedPath}
        clickedWorkspaceId={clickedWorkspaceId}
        expandedPaths={expandedPaths}
        dirtyPaths={dirtyPaths}
        externalChangePath={externalChangePath}
        flashPath={flashPath}
        onToggleExpand={onToggleExpand}
        onRefreshOne={onRefreshOne}
        onSelectWorkspace={onSelectWorkspace}
        onHideFromRightPanels={onHideFromRightPanels}
        onToggleFileTreePath={onToggleFileTreePath}
        onOpenFile={onOpenFile}
        onOpenFileForWorkspace={onOpenFileForWorkspace}
        onNodeClicked={onNodeClicked}
        getContextMenuItems={getContextMenuItems}
        contextMenuPersistRef={contextMenuPersistRef}
        setRenamingWorkspacePath={setRenamingWorkspacePath}
        setDeleteWorkspacePath={setDeleteWorkspacePath}
        clearMenuHighlightRef={clearMenuHighlightRef}
      />
    </CustomScrollArea>
  );
});

export { FileNavigatorTree };
export type { FileNavigatorTreeProps };
