import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@ai-digital-life/kernel';
import type { CopyDict } from '@i18n';
import {
  IconRefreshCw,
  IconPin,
  IconPinOff,
  IconMoreVertical,
  IconFolder,
  IconFolderOpen,
  IconAlertTriangle,
  IconLoader,
  IconCopy,
  IconEyeOff,
} from '@icons';
import { FileTree, type FileTreeContextMenuItem } from '@features/file-tree';
import { TooltipSimple } from '@components/Tooltip';

export interface WorkspaceChangesEntryProps {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  treeNodes: WorkspaceTreeNode[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath: string | undefined;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  changeCount: number;
  onRefreshTree: () => void;
  onToggleFileTreePath: (path: string) => void;
  onOpenChangePreview: (workspacePath: string, relativePath: string) => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  contextMenuPersistRef: React.MutableRefObject<boolean>;
  clearMenuHighlightRef: React.MutableRefObject<(() => void) | undefined>;
  expandLabel: string;
  collapseLabel: string;
  t: CopyDict;
  renderMeta?: (node: WorkspaceTreeNode) => React.ReactNode;
  renderCount?: (node: WorkspaceTreeNode) => React.ReactNode;
}

export const WorkspaceChangesEntry = React.memo(function WorkspaceChangesEntry({
  workspace,
  isCurrent,
  isExpanded,
  treeNodes,
  isLoading,
  error,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggleExpand,
  onHideFromRightPanels,
  onPinWorkspace,
  onUnpinWorkspace,
  changeCount,
  onRefreshTree,
  onToggleFileTreePath,
  onOpenChangePreview,
  getContextMenuItems,
  contextMenuPersistRef,
  clearMenuHighlightRef,
  expandLabel,
  collapseLabel,
  t,
  renderMeta,
  renderCount,
}: WorkspaceChangesEntryProps) {
  const effectiveSelectedPath = useMemo(() => {
    if (selectedChangePreviewWorkspaceId === workspace.id) {
      return selectedChangePreviewPath;
    }
    return undefined;
  }, [selectedChangePreviewWorkspaceId, workspace.id, selectedChangePreviewPath]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuId = `ws-changes-menu-${workspace.id}`;

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
    } catch {}
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

  const isPinned = workspace.isPinned;

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleNameClick();
      }
    },
    [handleNameClick]
  );

  const handleRefreshClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRefreshTree();
    },
    [onRefreshTree]
  );

  const handlePinClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPinned) {
        onUnpinWorkspace(workspace.id);
      } else {
        onPinWorkspace(workspace.id);
      }
    },
    [isPinned, onPinWorkspace, onUnpinWorkspace, workspace.id]
  );

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

          <span className="adl-multitree-entry__count">{changeCount}</span>

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

            <TooltipSimple content={isPinned ? t.fileUnpin : t.filePin} placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={handlePinClick}
                aria-label={isPinned ? t.fileUnpin : t.filePin}
              >
                {isPinned ? <IconPinOff size={12} decorative /> : <IconPin size={12} decorative />}
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

      {menuOpen && menuPosition
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id={menuId}
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
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
            document.body
          )
        : null}

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {isLoading ? (
            <div className="adl-multitree-entry__loading">
              <IconLoader size={14} decorative />
              <span>{t.loading as string}</span>
            </div>
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
              onOpenFile={(path) => onOpenChangePreview(workspace.path, path)}
              getContextMenuItems={getContextMenuItems}
              contextMenuPersistRef={contextMenuPersistRef}
              clearMenuHighlightRef={clearMenuHighlightRef}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
              renderMeta={renderMeta}
              renderCount={renderCount}
            />
          ) : (
            <div className="adl-multitree-entry__empty">
              <span>{t.changesEmpty as string}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
