import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import type { CopyDict } from '@i18n';
import {
  IconRefreshCw,
  IconMoreVertical,
  IconFolder,
  IconFolderOpen,
  IconAlertTriangle,
  IconCopy,
  IconEyeOff,
} from '@icons';
import { FileTree, type FileTreeContextMenuItem } from '@features/file-tree';
import { TooltipSimple } from '@components/Tooltip';
import { LoadingRow, EmptyRow } from '@components/LoadingRow';
import { useAppStore } from '@stores/slicedStore';
import { BranchMenuItem } from '@regions/right-panel/panels/BranchSubCard';
import { joinPathSegments } from '@app/utils/workspacePaths';

export interface WorkspaceFileTreeEntryProps {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  treeNodes: WorkspaceTreeNode[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  selectedFilePath: string | undefined;
  selectedFileWorkspaceId: string | undefined;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: () => void;
  onOpenWorkspace: (path: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  onToggleFileTreePath: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  expandLabel: string;
  collapseLabel: string;
  t: CopyDict;
}

export const WorkspaceFileTreeEntry = React.memo(function WorkspaceFileTreeEntry({
  workspace,
  isCurrent,
  isExpanded,
  treeNodes,
  isLoading,
  error,
  selectedFilePath,
  selectedFileWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onHideFromRightPanels,
  onRefreshTree,
  onToggleFileTreePath,
  onOpenFile,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  expandLabel,
  collapseLabel,
  t,
}: WorkspaceFileTreeEntryProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [adjustedMenuPosition, setAdjustedMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = `ws-menu-${workspace.id}`;
  const [branchSubOpen, setBranchSubOpen] = useState(false);
  const gitSnapshot = useAppStore((s) => s.gitSnapshots[workspace.id]);
  const currentBranch = gitSnapshot?.branch ?? '';

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const btn = document.querySelector(`[data-menu-btn-id="${menuId}"]`);
      if (btn?.contains(target)) {
        return;
      }
      if (menuEl?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    const handleScroll = () => {
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuOpen, menuId]);

  useEffect(() => {
    if (!menuOpen || !menuPosition || !menuRef.current) {
      setAdjustedMenuPosition(menuPosition);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    let { top, left } = menuPosition;

    if (left + rect.width > vw - MARGIN) {
      left = Math.max(MARGIN, vw - rect.width - MARGIN);
    }
    if (top + rect.height > vh - MARGIN) {
      top = Math.max(MARGIN, vh - rect.height - MARGIN);
    }

    setAdjustedMenuPosition({ top, left });
  }, [menuOpen, menuPosition]);

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
      console.warn('[WorkspaceFileTreeEntry] clipboard write failed');
    }
  }, []);

  // Wrap getContextMenuItems to bind workspace.path for reveal/copy-full-path
  const wrappedGetContextMenuItems = useCallback(
    (node: WorkspaceTreeNode) => {
      const items = getContextMenuItems(node);
      return items.map((item) => {
        if (item.separator) {
          return item;
        }
        // Override reveal and copy-full-path to use this workspace's path
        if (item.id === 'reveal' || item.id === 'copy-full-path') {
          const isReveal = item.id === 'reveal';
          return {
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              const fullPath = joinPathSegments(workspace.path, targetNode.path);
              if (isReveal) {
                window.digitalLife.workspace.revealInFileManager(fullPath);
              } else {
                copyToClipboard(fullPath);
              }
            },
          };
        }
        // Override paste to use this workspace's path
        if (item.id === 'paste') {
          return {
            ...item,
            action: async (targetNode: WorkspaceTreeNode) => {
              const store = useAppStore.getState();
              const sourcePath = store.clipboardSourcePath;
              const operation = store.clipboardOperation;
              if (!sourcePath || !operation) {
                return;
              }
              const targetDir =
                targetNode.kind === 'directory'
                  ? targetNode.path
                  : targetNode.path.substring(0, targetNode.path.lastIndexOf('/') + 1);
              const sourceName = sourcePath.split('/').pop() || sourcePath;
              const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
              if (operation === 'copy') {
                await store.duplicateWorkspaceFile(sourcePath, newPath, workspace.path);
              } else if (operation === 'cut') {
                if (sourcePath === newPath) {
                  store.clearClipboard();
                  return;
                }
                await store.moveWorkspaceFile(sourcePath, newPath, workspace.path);
              }
              store.clearClipboard();
            },
          };
        }
        return item;
      });
    },
    [getContextMenuItems, workspace.path, copyToClipboard],
  );

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

  const handleRefreshClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRefreshTree();
    },
    [onRefreshTree],
  );

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleNameClick();
      }
    },
    [handleNameClick],
  );

  const effectiveSelectedPath = useMemo(() => {
    if (selectedFileWorkspaceId === workspace.id) {
      return selectedFilePath;
    }
    return undefined;
  }, [selectedFileWorkspaceId, workspace.id, selectedFilePath]);

  return (
    <div
      className={`adl-multitree-entry${isCurrent ? ' is-current' : ''}${!workspace.available ? ' is-unavailable' : ''}`}
    >
      <div className="adl-multitree-entry__header">
        <div className="adl-multitree-entry__expand">
          <TooltipSimple content={isExpanded ? t.fileCollapse : t.fileExpand} placement="top">
            <button
              type="button"
              className={`adl-multitree-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
              onClick={onToggleExpand}
              aria-label={isExpanded ? t.fileCollapse : t.fileExpand}
              aria-expanded={isExpanded}
              disabled={!workspace.available}
            >
              {isExpanded ? (
                <IconFolderOpen size={14} decorative />
              ) : (
                <IconFolder size={14} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>

        <div
          className="adl-multitree-entry__namezone"
          role="button"
          tabIndex={0}
          onClick={handleNameClick}
          onContextMenu={handleNameContextMenu}
          onKeyDown={handleNameKeyDown}
          aria-label={workspace.name}
        >
          <span className="adl-multitree-entry__name" title={workspace.path}>
            {workspace.name}
          </span>

          <div className="adl-multitree-entry__actions">
            <TooltipSimple content={t.fileRefresh} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handleRefreshClick}
                aria-label={t.fileRefresh}
              >
                <IconRefreshCw size={12} decorative />
              </button>
            </TooltipSimple>

            <TooltipSimple content={t.fileMoreActions} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                data-menu-btn-id={menuId}
                onClick={handleMoreClick}
                aria-label={t.fileMoreActions}
              >
                <IconMoreVertical size={12} decorative />
              </button>
            </TooltipSimple>
          </div>
        </div>
      </div>

      {menuOpen && adjustedMenuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id={menuId}
              style={{ top: adjustedMenuPosition.top, left: adjustedMenuPosition.left }}
            >
              <BranchMenuItem
                isSubOpen={branchSubOpen}
                onSubOpenChange={setBranchSubOpen}
                workspacePath={workspace.path}
                currentBranch={currentBranch}
                isRepo={gitSnapshot?.isRepo ?? false}
              />
              <div className="adl-multitree-entry__menu-sep" role="separator" />
              <button
                type="button"
                className="adl-multitree-entry__menu-item"
                role="menuitem"
                onClick={handleHideFromRightPanels}
              >
                <IconEyeOff size={14} />
                {t.fileRemoveFromView}
              </button>
              <button
                type="button"
                className="adl-multitree-entry__menu-item"
                role="menuitem"
                onClick={handleRevealInFileManager}
              >
                <IconFolderOpen size={14} />
                {t.sessionMenuRevealFolder as string}
              </button>
              <div className="adl-multitree-entry__menu-sep" role="separator" />
              <button
                type="button"
                className="adl-multitree-entry__menu-item"
                role="menuitem"
                onClick={handleCopyFullPath}
              >
                <IconCopy size={14} />
                {t.fileCopyFullPath}
              </button>
              <button
                type="button"
                className="adl-multitree-entry__menu-item"
                role="menuitem"
                onClick={handleCopyRelativePath}
              >
                <IconCopy size={14} />
                {t.fileCopyRelativePath}
              </button>
            </div>,
            document.body,
          )
        : null}

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {isLoading ? (
            <LoadingRow />
          ) : error ? (
            <div className="adl-multitree-entry__error">
              <IconAlertTriangle size={14} decorative />
              <span>{error}</span>
            </div>
          ) : treeNodes && treeNodes.length > 0 ? (
            <FileTree
              nodes={treeNodes}
              selectedFilePath={effectiveSelectedPath}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={onToggleFileTreePath}
              onOpenFile={onOpenFile}
              getContextMenuItems={wrappedGetContextMenuItems}
              contextMenuPersistRef={contextMenuPersistRef}
              clearMenuHighlightRef={clearMenuHighlightRef}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
            />
          ) : (
            <EmptyRow message={t.workspaceEmpty as string} />
          )}
        </div>
      ) : null}
    </div>
  );
});
