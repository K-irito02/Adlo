import type React from 'react';
import { useCallback, useState } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import type { FileTreeContextMenuItem } from '@features/file-tree';

export interface UseWorkspaceChangesActionsParams {
  workspace: RecentWorkspaceEntry;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
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
}: UseWorkspaceChangesActionsParams): WorkspaceChangesActions {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [branchSubOpen, setBranchSubOpen] = useState(false);
  const menuId = `ws-changes-menu-${workspace.id}`;

  const wrappedGetContextMenuItems = useCallback(
    (node: WorkspaceTreeNode) => {
      const items = getContextMenuItems(node);
      return items.map((item) => {
        if (item.separator || !item.action) {
          return item;
        }
        if (item.id === 'stage' || item.id === 'unstage' || item.id === 'discard') {
          return {
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              const s = useAppStore.getState();
              if (item.id === 'stage') {
                void s.stageWorkspaceFile(targetNode.path, workspace.path);
              } else if (item.id === 'unstage') {
                void s.unstageWorkspaceFile(targetNode.path, workspace.path);
              } else {
                void s.discardWorkspaceFile(targetNode.path, workspace.path);
              }
            },
          } as FileTreeContextMenuItem<WorkspaceTreeNode>;
        }
        return item;
      });
    },
    [getContextMenuItems, workspace.path],
  );

  const handleNameClick = useCallback(() => {
    onToggleExpand();
  }, [onToggleExpand]);

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

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('[WorkspaceChangesEntry] clipboard write failed');
    }
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
