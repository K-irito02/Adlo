import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconFolder, IconFolderOpen, IconPlus, IconTrash, IconMoreVertical, IconGlobe, IconEdit, IconCut } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { RenameDialog } from "../../components/RenameDialog";
import { BrowserTabBar } from "../browser/BrowserTabBar";
import type { TabFolderState, BrowserTabState } from "../../stores/slices/browserSlice";
import { useAppStore } from "../../stores/slicedStore";

interface TabFolderEntryProps {
  folder: TabFolderState;
  tabs?: BrowserTabState[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCreateTab: () => void;
  onDeleteFolder: () => void;
  onDeleteAllFolderTabs?: () => void;
  onRenameFolder?: (newName: string) => void;
  activeTabId?: string | undefined;
  editingTabId?: string | null;
  editValue?: string;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  isDragging?: boolean;
  dragOverTabId?: string | null;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onTogglePin?: (tabId: string) => void;
  onDragStart?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDrop?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onTabContextMenu?: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  onTabDoubleClick?: (tabId: string, title: string) => void;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditKeyDown?: (e: React.KeyboardEvent) => void;
  t?: any;
}

export function TabFolderEntry({
  folder,
  tabs = [],
  isExpanded,
  onToggleExpand,
  onCreateTab,
  onDeleteFolder,
  onDeleteAllFolderTabs,
  onRenameFolder,
  activeTabId,
  editingTabId = null,
  editValue = "",
  editInputRef = { current: null },
  isDragging = false,
  dragOverTabId = null,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onDragStart = () => {},
  onDragEnd = () => {},
  onDragOver = () => {},
  onDrop = () => {},
  onTabContextMenu = () => {},
  onTabDoubleClick = () => {},
  onEditChange = () => {},
  onEditSubmit = () => {},
  onEditKeyDown = () => {},
  t,
}: TabFolderEntryProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const menuId = `tab-folder-menu-${folder.id}`;

  const browserOpenTab = useAppStore((state) => state.browserOpenTab);
  const browserCloseTab = useAppStore((state) => state.browserCloseTab);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const zone = document.querySelector(`[data-menu-zone-id="${menuId}"]`);
      if (zone?.contains(target)) return;
      if (menuEl?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        if (renameDialogOpen) setRenameDialogOpen(false);
      }
    };
    const handleScroll = () => {
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menuOpen, menuId, renameDialogOpen]);

  const handleNameClick = useCallback(() => {
    if (!renameDialogOpen) {
      onToggleExpand();
    }
  }, [onToggleExpand, renameDialogOpen]);

  const handleNameContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen(true);
  };

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPosition(null);
  }, []);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen((prev) => !prev);
  };

  const handleDeleteFolder = useCallback(() => {
    closeMenu();
    onDeleteFolder();
  }, [closeMenu, onDeleteFolder]);

  const handleOpenAllInNewTabs = useCallback(() => {
    closeMenu();
    for (const tab of tabs) {
      browserOpenTab(tab.url, tab.title, tab.workspaceId);
    }
  }, [closeMenu, tabs, browserOpenTab]);

  const handleDeleteAllFolderTabs = useCallback(() => {
    closeMenu();
    for (const tab of tabs) {
      browserCloseTab(tab.id);
    }
    if (onDeleteAllFolderTabs) {
      onDeleteAllFolderTabs();
    }
  }, [closeMenu, tabs, browserCloseTab, onDeleteAllFolderTabs]);

  const handleStartRename = useCallback(() => {
    closeMenu();
    setRenameDialogOpen(true);
  }, [closeMenu]);

  const handleRenameSubmit = useCallback(
    (newName: string) => {
      onRenameFolder?.(newName);
      setRenameDialogOpen(false);
    },
    [onRenameFolder]
  );

  const handleRenameCancel = useCallback(() => {
    setRenameDialogOpen(false);
  }, []);

  const handleCutFolder = useCallback(() => {
    closeMenu();
  }, [closeMenu]);

  return (
    <div
      className={`adl-multitree-entry${renameDialogOpen ? " is-highlighted" : ""}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="adl-multitree-entry__header" data-menu-zone-id={menuId}>
        <div className="adl-multitree-entry__expand">
          <TooltipSimple content={isExpanded ? "收起" : "展开"} placement="top">
            <button
              type="button"
              className={`adl-multitree-entry__expand-btn${isExpanded ? " is-expanded" : ""}`}
              onClick={onToggleExpand}
              aria-label={isExpanded ? "收起" : "展开"}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <IconFolderOpen size={14} decorative /> : <IconFolder size={14} decorative />}
            </button>
          </TooltipSimple>
        </div>

        <div
          className="adl-multitree-entry__namezone"
          role="button"
          tabIndex={0}
          onClick={handleNameClick}
          onContextMenu={handleNameContextMenu}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleNameClick(); }}
          aria-label={folder.name}
        >
          <span className="adl-multitree-entry__name">{folder.name}</span>
          <span className="adl-multitree-entry__count">{tabs?.length || 0}</span>

          <div className="adl-multitree-entry__actions">
            {isHovering && (
              <TooltipSimple content="创建标签" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => { e.stopPropagation(); onCreateTab(); }}
                  aria-label="创建标签"
                >
                  <IconPlus size={12} decorative />
                </button>
              </TooltipSimple>
            )}
            <TooltipSimple content="删除此目录全部标签" placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={(e) => { e.stopPropagation(); handleDeleteAllFolderTabs(); }}
                aria-label="删除此目录全部标签"
              >
                <IconTrash size={12} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content="更多操作" placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                data-menu-btn-id={menuId}
                onClick={handleMoreClick}
                aria-label="更多操作"
              >
                <IconMoreVertical size={12} decorative />
              </button>
            </TooltipSimple>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition ? createPortal(
        <div className="adl-multitree-entry__menu" role="menu" data-menu-id={menuId} style={{ top: menuPosition.top, left: menuPosition.left }}>
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleOpenAllInNewTabs}>
            <IconGlobe size={14} />
            全部在新标签中打开
          </button>
          <div className="adl-multitree-entry__menu-sep" role="separator" />
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleStartRename}>
            <IconEdit size={14} />
            重命名
          </button>
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleCutFolder}>
            <IconCut size={14} />
            剪切
          </button>
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleDeleteAllFolderTabs}>
            <IconTrash size={14} />
            删除此目录全部标签
          </button>
          <div className="adl-multitree-entry__menu-sep" role="separator" />
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleDeleteFolder}>
            <IconTrash size={14} />
            删除此目录
          </button>
        </div>,
        document.body
      ) : null}

      <RenameDialog
        open={renameDialogOpen}
        initialValue={folder.name}
        title="重命名目录"
        itemInfo={`当前名称: ${folder.name}`}
        placeholder="输入新目录名称"
        onConfirm={handleRenameSubmit}
        onCancel={handleRenameCancel}
      />

      {isExpanded && (
        <div className="adl-multitree-entry__tree">
          {tabs.length > 0 ? (
            <BrowserTabBar
              tabs={tabs}
              activeTabId={activeTabId ?? ""}
              editingTabId={editingTabId}
              editValue={editValue}
              editInputRef={editInputRef}
              isDragging={isDragging}
              dragOverTabId={dragOverTabId}
              onSelectTab={onSelectTab || (() => {})}
              onCloseTab={onCloseTab || (() => {})}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onContextMenu={onTabContextMenu}
              onDoubleClick={onTabDoubleClick}
              onEditChange={onEditChange}
              onEditSubmit={onEditSubmit}
              onEditKeyDown={onEditKeyDown}
              t={t}
            />
          ) : (
            <div className="adl-multitree-entry__empty">
              <button
                type="button"
                className="adl-multitree-entry__empty-btn"
                onClick={onCreateTab}
              >
                <IconPlus size={12} decorative />
                创建标签
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
