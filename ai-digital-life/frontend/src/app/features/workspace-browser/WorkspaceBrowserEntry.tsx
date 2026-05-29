import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { BrowserTabState } from "../../stores/slices/browserSlice";
import { IconTrash, IconPlus, IconMoreVertical, IconEyeOff, IconFolderOpen, IconFolder, IconGlobe } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { BrowserTabBar } from "../browser/BrowserTabBar";
import { useAppStore } from "../../stores/slicedStore";

export interface WorkspaceBrowserEntryProps {
  workspace: RecentWorkspaceEntry;
  isExpanded: boolean;
  tabs: BrowserTabState[];
  activeTabId: string | undefined;
  tabCount: number;
  onToggleExpand: () => void;
  onCreateTab: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  onCloseAllTabs: () => void;
  isIndependent?: boolean;
  t: CopyDict;
  editingTabId?: string | null;
  editValue?: string;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
  isDragging?: boolean;
  dragOverTabId?: string | null;
  onDragStart?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onDrop?: (e: React.DragEvent, tabId: string, isPinned: boolean) => void;
  onTabContextMenu?: (e: React.MouseEvent, tabId: string, isPinned: boolean) => void;
  onTabDoubleClick?: (tabId: string, title: string) => void;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditKeyDown?: (e: React.KeyboardEvent) => void;
}

export function WorkspaceBrowserEntry({
  workspace,
  isExpanded,
  tabs,
  activeTabId,
  tabCount,
  onToggleExpand,
  onCreateTab,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onHideFromRightPanels,
  onRefreshTree,
  onCloseAllTabs,
  isIndependent = false,
  t,
  editingTabId = null,
  editValue = "",
  editInputRef = { current: null },
  isDragging = false,
  dragOverTabId = null,
  onDragStart = () => {},
  onDragEnd = () => {},
  onDragOver = () => {},
  onDrop = () => {},
  onTabContextMenu = () => {},
  onTabDoubleClick = () => {},
  onEditChange = () => {},
  onEditSubmit = () => {},
  onEditKeyDown = () => {},
}: WorkspaceBrowserEntryProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const menuId = `ws-browser-menu-${workspace.id}`;

  const browserOpenTab = useAppStore((state) => state.browserOpenTab);

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
      if (e.key === "Escape") setMenuOpen(false);
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
  }, [menuOpen, menuId]);

  const handleNameClick = () => {
    onToggleExpand();
  };

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

  const handleHideFromRightPanels = useCallback(() => {
    closeMenu();
    onHideFromRightPanels(workspace.id);
  }, [onHideFromRightPanels, workspace.id, closeMenu]);

  const handleOpenAllInNewTabs = useCallback(() => {
    closeMenu();
    for (const tab of tabs) {
      browserOpenTab(tab.url, tab.title, tab.workspaceId);
    }
  }, [closeMenu, tabs, browserOpenTab]);

  const handleDeleteWorkspace = useCallback(() => {
    closeMenu();
    onCloseAllTabs();
  }, [closeMenu, onCloseAllTabs]);

  return (
    <div 
      className={`adl-multitree-entry${isIndependent ? " adl-multitree-entry--independent" : ""}${!workspace.available ? " is-unavailable" : ""}`}
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
              disabled={!workspace.available}
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
          aria-label={workspace.name}
        >
          <span className="adl-multitree-entry__name" title={workspace.path}>{workspace.name}</span>
          <span className="adl-multitree-entry__count">{tabCount}</span>

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
                onClick={(e) => { e.stopPropagation(); onCloseAllTabs(); }}
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
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleHideFromRightPanels}>
            <IconEyeOff size={14} />
            从该区域移除不显示
          </button>
          <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleDeleteWorkspace}>
            <IconTrash size={14} />
            删除此目录全部标签
          </button>
        </div>,
        document.body
      ) : null}

      {isExpanded ? (
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
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
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
      ) : null}
    </div>
  );
}
