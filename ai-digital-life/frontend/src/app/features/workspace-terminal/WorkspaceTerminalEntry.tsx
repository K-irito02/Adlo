import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import type { TerminalTabState } from "../../stores/slices/terminalSlice";
import type { TerminalProfile } from "../../ui-store";
import { IconRefreshCw, IconTrash, IconPlus, IconMoreVertical, IconEyeOff, IconFolderOpen, IconFolder, IconTerminal, IconChevronRight } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { TerminalTabBar } from "../terminal/TerminalTabBar";
import { useAppStore } from "../../stores/slicedStore";


export interface WorkspaceTerminalEntryProps {
  workspace: RecentWorkspaceEntry;
  isExpanded: boolean;
  tabs: TerminalTabState[];
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
}

export function WorkspaceTerminalEntry({
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
}: WorkspaceTerminalEntryProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [subHover, setSubHover] = useState(false);
  const [subMenuPosition, setSubMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const menuId = `ws-term-menu-${workspace.id}`;
  const subMenuId = `ws-term-submenu-${workspace.id}`;
  const subMenuTriggerRef = useRef<HTMLDivElement | null>(null);
  const defaultTerminalProfile = useAppStore((state) => state.defaultTerminalProfile);
  const workspaceDefaultProfiles = useAppStore((state) => state.workspaceDefaultProfiles);
  const setDefaultTerminalProfile = useAppStore((state) => state.setDefaultTerminalProfile);
  const setWorkspaceDefaultTerminalProfile = useAppStore((state) => state.setWorkspaceDefaultTerminalProfile);
  const subHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 使用工作区专属默认终端类型，如果没有则使用全局默认
  const currentProfile = isIndependent 
    ? defaultTerminalProfile 
    : (workspaceDefaultProfiles[workspace.id] ?? defaultTerminalProfile);


  const profileLabels: Record<TerminalProfile, string> = {
    powershell: "PowerShell",
    bash: "Bash",
    cmd: "CMD",
  };

  const defaultProfileLabel = profileLabels[currentProfile];

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const subMenuEl = document.querySelector(`[data-menu-id="${subMenuId}"]`);
      const zone = document.querySelector(`[data-menu-zone-id="${menuId}"]`);
      if (zone?.contains(target)) return;
      if (menuEl?.contains(target)) return;
      if (subMenuEl?.contains(target)) return;
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

  const showSubMenu = useCallback(() => {
    if (subHideTimerRef.current) {
      clearTimeout(subHideTimerRef.current);
      subHideTimerRef.current = null;
    }
    setSubHover(true);
    if (subMenuTriggerRef.current) {
      const rect = subMenuTriggerRef.current.getBoundingClientRect();
      setSubMenuPosition({ top: rect.top, left: rect.right + 6 });
    }
  }, []);

  const hideSubMenuDelayed = useCallback(() => {
    if (subHideTimerRef.current) clearTimeout(subHideTimerRef.current);
    subHideTimerRef.current = setTimeout(() => {
      setSubHover(false);
    }, 150);
  }, []);

  const closeMenu = useCallback(() => {
    if (subHideTimerRef.current) clearTimeout(subHideTimerRef.current);
    setMenuOpen(false);
    setMenuPosition(null);
    setSubHover(false);
  }, []);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (subHideTimerRef.current) clearTimeout(subHideTimerRef.current);
    setSubHover(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen((prev) => !prev);
  };

  const handleHideFromRightPanels = useCallback(() => {
    closeMenu();
    onHideFromRightPanels(workspace.id);
  }, [onHideFromRightPanels, workspace.id, closeMenu]);

  const handleSelectDefaultProfile = useCallback((profile: TerminalProfile) => {
    if (isIndependent) {
      setDefaultTerminalProfile(profile);
    } else {
      setWorkspaceDefaultTerminalProfile(workspace.id, profile);
    }
    requestAnimationFrame(() => {
      setRenderKey(prev => prev + 1);
    });
  }, [isIndependent, workspace.id, setDefaultTerminalProfile, setWorkspaceDefaultTerminalProfile]);

  return (
    <div key={renderKey} className={`adl-multitree-entry${isIndependent ? " adl-multitree-entry--independent" : ""}${!workspace.available ? " is-unavailable" : ""}`}>
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
          onContextMenu={isIndependent ? undefined : handleNameContextMenu}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleNameClick(); }}
          aria-label={workspace.name}
        >
          <span className="adl-multitree-entry__name" title={workspace.path}>{workspace.name}</span>
          <span className="adl-multitree-entry__count">{tabCount}</span>

          <div className="adl-multitree-entry__actions">
            {!isIndependent && (
              <TooltipSimple content="刷新" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => { e.stopPropagation(); onRefreshTree(); }}
                  aria-label="刷新"
                >
                  <IconRefreshCw size={12} decorative />
                </button>
              </TooltipSimple>
            )}
            <TooltipSimple content="删除全部" placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={(e) => { e.stopPropagation(); onCloseAllTabs(); }}
                aria-label="删除全部"
              >
                <IconTrash size={12} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content="创建终端" placement="top">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={(e) => { e.stopPropagation(); onCreateTab(); }}
                aria-label="创建终端"
              >
                <IconPlus size={12} decorative />
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
          {!isIndependent && <button type="button" className="adl-multitree-entry__menu-item" role="menuitem" onClick={handleHideFromRightPanels}>
            <IconEyeOff size={14} />
            从此区域移除不显示
          </button>}
          {!isIndependent && <div className="adl-multitree-entry__menu-sep" role="separator" />}
          <div
            ref={subMenuTriggerRef}
            className="adl-multitree-entry__menu-item adl-multitree-entry__menu-item--with-sub"
            data-sub-menu-id={subMenuId}
            onMouseEnter={showSubMenu}
            onMouseLeave={hideSubMenuDelayed}
          >
            <IconTerminal size={14} />
            <span className="adl-multitree-entry__menu-item-content">默认为{defaultProfileLabel}终端</span>
            <span className="adl-multitree-entry__menu-item-arrow">
              <IconChevronRight size={12} decorative />
            </span>
          </div>
        </div>,
        document.body
      ) : null}

      {menuOpen && subHover && subMenuPosition ? createPortal(
        <div
          className="adl-multitree-entry__menu adl-multitree-entry__menu--sub"
          role="menu"
          data-menu-id={subMenuId}
          style={{ top: subMenuPosition.top, left: subMenuPosition.left }}
          onMouseEnter={showSubMenu}
          onMouseLeave={hideSubMenuDelayed}
        >
          {(["powershell", "bash", "cmd"] as TerminalProfile[]).map((profile) => (
            <button
              key={profile}
              type="button"
              className={`adl-multitree-entry__menu-item${profile === currentProfile ? " is-active" : ""}`}
              role="menuitemradio"
              aria-checked={profile === currentProfile}
              onClick={() => handleSelectDefaultProfile(profile)}
            >
              <span className="adl-multitree-entry__menu-item-label">{profileLabels[profile]}</span>
              {profile === currentProfile ? <span className="adl-multitree-entry__menu-item-check">√</span> : null}
            </button>
          ))}
        </div>,
        document.body
      ) : null}

      {isExpanded ? (
        <div className="adl-multitree-entry__tree">
          {tabs.length > 0 ? (
            <TerminalTabBar
              tabs={tabs}
              activeTabId={activeTabId ?? ""}
              editingTabId={null}
              editValue=""
              editInputRef={{ current: null }}
              isDragging={false}
              dragOverTabId={null}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
              onContextMenu={() => {}}
              onDoubleClick={() => {}}
              onEditChange={() => {}}
              onEditSubmit={() => {}}
              onEditKeyDown={() => {}}
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
                创建终端
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
