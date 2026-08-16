import { useCallback, useEffect } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { FileTreeContextMenuItem } from '@features/file-tree';
import { MultiWorkspaceContainer } from '../multi-workspace/MultiWorkspaceContainer';
import { WorkspaceFileTreeEntry } from './WorkspaceFileTreeEntry';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';

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
  expandedPaths: Record<string, Record<string, boolean>>;
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

  // 点击选中态清除逻辑：
  // - 处于"新建/重命名/删除"对话框、新建按钮、真实文件树行、工作区头部等交互元素上时，
  //   保留选中态（新建/重命名目标需要依赖当前选中的目录）。
  // - 点击其余区域（包括文件树容器内的空白/无关区域）时清除选中态，与主流编辑器一致：
  //   仅真正的树内容行/头部才被视为"目标区域"，容器的空白处不占位。
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          [
            '.adl-prompt-modal', // 新建文件/文件夹、重命名对话框
            '.adl-confirm-overlay', // 删除确认对话框
            '.adl-tool-navigator__create-action', // 新建文件/文件夹按钮
            '.adl-filetree__row', // 文件树节点行
            '.adl-multitree-entry__header', // 工作区头部（点击即选中根目录）
            '.adl-sidebar-menu', // 右键上下文菜单（重命名/删除等）：点击菜单项时保留选中态，
            // 使用户能看清正在操作的是哪个节点，对齐主流编辑器行为
          ].join(', '),
        )
      ) {
        return;
      }
      useAppStore.getState().clearFileTreeClickedNode();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
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
            expandedPaths={expandedPaths[workspace.id] ?? {}}
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
