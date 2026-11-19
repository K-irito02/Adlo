import React, { useCallback, useMemo } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import { applyChildOrder } from '@features/file-tree/childOrder';
import type { TreeExpansion } from '@stores/slices/uiSliceTypes';
import { useAppStore } from '@stores/slicedStore';
import { MultiWorkspaceTreeShell } from '../multi-workspace/MultiWorkspaceTreeShell';
import { AddWorkspaceHint } from '../multi-workspace/AddWorkspaceHint';
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
  expandedPaths: Record<string, TreeExpansion>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: (workspaceId: string) => void;
  onRefreshOne: (workspaceId: string) => void;
  changeCounts: Record<string, number>;
  onHideFromRightPanels: (workspaceId: string) => void;
  onToggleFileTreePath: (workspaceId: string, path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  onHoverChangePreview?: (workspacePath: string, relativePath: string) => void;
  onNodeClicked: (workspaceId: string, path: string, kind: 'directory' | 'file') => void;
  onWorkspaceRootClick: (workspaceId: string) => void;
  onClearSelection: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  onRequestDiscardConfirm?: (path: string, workspacePath: string) => void;
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
  onHoverChangePreview,
  onNodeClicked,
  onWorkspaceRootClick,
  onClearSelection,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
  onRequestDiscardConfirm,
  renderMeta,
  renderCount,
}: MultiWorkspaceChangesTreeProps) {
  const { t } = useTCopy();
  const fileChildOrder = useAppStore((state) => state.fileChildOrder);

  // 与文件面板共享同一份目录顺序（仅影响显示顺序）；变更面板不支持拖拽。
  const orderedTreeData = useMemo(() => {
    const next: Record<string, WorkspaceTreeNode[]> = {};
    for (const workspace of workspaces) {
      next[workspace.id] = applyChildOrder(
        treeData[workspace.id] ?? [],
        workspace.path,
        '',
        fileChildOrder,
      );
    }
    return next;
  }, [workspaces, treeData, fileChildOrder]);

  const renderContent = useCallback(
    (workspace: RecentWorkspaceEntry, isExpanded: boolean) => {
      return (
        <div key={workspace.id} className="adl-multitree-entry">
          <WorkspaceChangesEntry
            workspace={workspace}
            isCurrent={workspace.id === activeWorkspaceId}
            isExpanded={isExpanded}
            treeNodes={orderedTreeData[workspace.id]}
            isLoading={loadingStates[workspace.id] ?? false}
            isRefreshing={refreshingStates?.[workspace.id] ?? false}
            error={errorStates[workspace.id]}
            selectedChangePreviewPath={selectedChangePreviewPath}
            selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
            clickedPath={clickedWorkspaceId === workspace.id ? clickedPath : undefined}
            expandedPaths={expandedPaths[workspace.id]?.expanded ?? {}}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggleExpand={() => onToggleExpand(workspace.id)}
            onHideFromRightPanels={onHideFromRightPanels}
            changeCount={changeCounts[workspace.id] ?? 0}
            onRefreshTree={() => onRefreshOne(workspace.id)}
            onToggleFileTreePath={(path) => onToggleFileTreePath(workspace.id, path)}
            onOpenChangePreview={onOpenChangePreview}
            onHoverChangePreview={onHoverChangePreview}
            onNodeClicked={(path, kind) => onNodeClicked(workspace.id, path, kind)}
            onWorkspaceRootClick={() => onWorkspaceRootClick(workspace.id)}
            getContextMenuItems={getContextMenuItems}
            contextMenuPersistRef={contextMenuPersistRef}
            clearMenuHighlightRef={clearMenuHighlightRef}
            setRenamingWorkspacePath={setRenamingWorkspacePath}
            setDeleteWorkspacePath={setDeleteWorkspacePath}
            onRequestDiscardConfirm={onRequestDiscardConfirm}
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
      orderedTreeData,
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
      onHoverChangePreview,
      onNodeClicked,
      onWorkspaceRootClick,
      getContextMenuItems,
      contextMenuPersistRef,
      clearMenuHighlightRef,
      setRenamingWorkspacePath,
      setDeleteWorkspacePath,
      onRequestDiscardConfirm,
      t,
      renderMeta,
      renderCount,
    ],
  );

  return (
    <MultiWorkspaceTreeShell
      visibleWorkspaces={workspaces}
      expandedState={expandedStates}
      emptyText={
        <AddWorkspaceHint
          prefix={t.workspaceEmptyAddWorkspacePrefix as string}
          suffix={t.workspaceEmptyAddWorkspaceSuffix as string}
        />
      }
      onClearSelection={onClearSelection}
      renderContent={renderContent}
      stickyHeaders
    />
  );
}
