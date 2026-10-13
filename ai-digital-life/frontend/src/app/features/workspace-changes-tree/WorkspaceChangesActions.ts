import type React from 'react';
import { useCallback, useState } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { joinPathSegments } from '@app/utils/workspacePaths';
import type { FileTreeContextMenuItem } from '@features/file-tree';
export interface UseWorkspaceChangesActionsParams {
  workspace: RecentWorkspaceEntry;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  onWorkspaceRootClick?: () => void;
  // 事项2：重命名/删除确认必须作用到右键节点所属工作区（面板级 dialogs 持有），
  // 由本 wrapper 在原动作之后注入（与文件面板 WorkspaceFileTreeEntry 对齐）。
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  // 目录级 discard 需二次确认（审查 2-1）：目录会递归 restore/clean，一次影响面大。
  onRequestDiscardConfirm?: (path: string, workspacePath: string) => void;
}

export interface WorkspaceChangesActions {
  menuOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  branchSubOpen: boolean;
  setBranchSubOpen: (open: boolean) => void;
  menuId: string;
  handleNameClick: () => void;
  handleNameContextMenu: (e: React.MouseEvent) => void;
  handleNameKeyDown: (e: React.KeyboardEvent) => void;
  handleMoreClick: (e: React.MouseEvent) => void;
  closeMenu: () => void;
  handleCopyFullPath: () => Promise<void>;
  handleCopyRelativePath: () => Promise<void>;
  handleRevealInFileManager: () => Promise<void>;
  handleHideFromRightPanels: () => void;
  handleRefreshClick: (e: React.MouseEvent) => void;
  wrappedGetContextMenuItems: (
    node: WorkspaceTreeNode,
  ) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
}

export function useWorkspaceChangesActions({
  workspace,
  onToggleExpand,
  onHideFromRightPanels,
  onRefreshTree,
  getContextMenuItems,
  onWorkspaceRootClick,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
  onRequestDiscardConfirm,
}: UseWorkspaceChangesActionsParams): WorkspaceChangesActions {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [branchSubOpen, setBranchSubOpen] = useState(false);
  const menuId = `ws-changes-menu-${workspace.id}`;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('[WorkspaceChangesEntry] clipboard write failed');
    }
  }, []);

  // 按工作区重绑菜单动作（事项2）：面板级 getContextMenuItems 不知节点所属工作区，
  // reveal/复制全路径若回退 currentWorkspace 会在多工作区下作用错目标；
  // Git 项（stage/unstage/discard）本就支持 workspacePath，在此一并绑定。
  // 注：变更面板 showClipboard:false（无 cut/copy/paste）、open-in-files 已移除，
  // 故此处只需处理 git/reveal/copy/rename/delete 五类。
  const wrappedGetContextMenuItems = useCallback(
    (node: WorkspaceTreeNode) => {
      const items = getContextMenuItems(node);
      const result: FileTreeContextMenuItem<WorkspaceTreeNode>[] = [];
      for (const item of items) {
        if (item.separator || !item.action) {
          result.push(item);
          continue;
        }
        if (item.id === 'stage' || item.id === 'unstage' || item.id === 'discard') {
          const isDiscard = item.id === 'discard';
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              // 目录级 discard 走二次确认（审查 2-1）；文件级沿用即时执行。
              if (isDiscard && targetNode.kind === 'directory' && onRequestDiscardConfirm) {
                onRequestDiscardConfirm(targetNode.path, workspace.path);
                return;
              }
              const s = useAppStore.getState();
              if (item.id === 'stage') {
                void s.stageWorkspaceFile(targetNode.path, workspace.path);
              } else if (item.id === 'unstage') {
                void s.unstageWorkspaceFile(targetNode.path, workspace.path);
              } else {
                void s.discardWorkspaceFile(targetNode.path, workspace.path);
              }
            },
          } as FileTreeContextMenuItem<WorkspaceTreeNode>);
          continue;
        }
        if (item.id === 'reveal' || item.id === 'copy-full-path') {
          const isReveal = item.id === 'reveal';
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              const fullPath = joinPathSegments(workspace.path, targetNode.path);
              if (isReveal) {
                void window.digitalLife.workspace.revealInFileManager(fullPath);
              } else {
                void copyToClipboard(fullPath);
              }
            },
          });
          continue;
        }
        if (item.id === 'rename' || item.id === 'delete') {
          const isRename = item.id === 'rename';
          const originalAction = item.action;
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              originalAction?.(targetNode, [targetNode]);
              if (isRename) {
                setRenamingWorkspacePath?.(workspace.path);
              } else {
                setDeleteWorkspacePath?.(workspace.path);
              }
            },
          });
          continue;
        }
        result.push(item);
      }
      return result;
    },
    [
      getContextMenuItems,
      workspace.path,
      copyToClipboard,
      setRenamingWorkspacePath,
      setDeleteWorkspacePath,
      onRequestDiscardConfirm,
    ],
  );

  const handleNameClick = useCallback(() => {
    onToggleExpand();
    onWorkspaceRootClick?.();
  }, [onToggleExpand, onWorkspaceRootClick]);

  const handleNameContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
    setMenuOpen(true);
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPosition(null);
  }, []);

  const handleCopyFullPath = useCallback(async () => {
    closeMenu();
    await copyToClipboard(workspace.path);
  }, [workspace.path, closeMenu, copyToClipboard]);

  const handleCopyRelativePath = useCallback(async () => {
    closeMenu();
    await copyToClipboard(workspace.name);
  }, [workspace.name, closeMenu, copyToClipboard]);

  const handleRevealInFileManager = useCallback(async () => {
    closeMenu();
    await window.digitalLife.workspace.revealInFileManager(workspace.path);
  }, [workspace.path, closeMenu]);

  const handleHideFromRightPanels = useCallback(() => {
    closeMenu();
    onHideFromRightPanels(workspace.id);
  }, [onHideFromRightPanels, workspace.id, closeMenu]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleNameClick();
      }
    },
    [handleNameClick],
  );

  const handleRefreshClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRefreshTree();
    },
    [onRefreshTree],
  );

  return {
    menuOpen,
    menuPosition,
    branchSubOpen,
    setBranchSubOpen,
    menuId,
    handleNameClick,
    handleNameContextMenu,
    handleNameKeyDown,
    handleMoreClick,
    closeMenu,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleRevealInFileManager,
    handleHideFromRightPanels,
    handleRefreshClick,
    wrappedGetContextMenuItems,
  };
}
