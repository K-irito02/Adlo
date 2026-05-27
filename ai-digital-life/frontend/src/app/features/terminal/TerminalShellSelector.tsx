import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { IconChevronDown, IconChevronRight, IconPlus } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import type { TerminalProfile } from "../../ui-store";
import type { CopyDict } from "../../copy";
import type { TerminalShellMenuItem, WorkspaceMenuItem } from "./useTerminalPanel";
import { useAppStore } from "../../stores/slicedStore";

interface TerminalShellSelectorProps {
  currentProfile: TerminalProfile;
  currentProfileLabel: string;
  menuOpen: boolean;
  menuItems: TerminalShellMenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  onCreateTab: (profile?: TerminalProfile, workspaceId?: string) => void;
  onToggle: () => void;
  onSelect: (profile: TerminalProfile) => void;
  t: CopyDict;
}

export function TerminalShellSelector({
  currentProfile,
  currentProfileLabel,
  menuOpen,
  menuItems,
  menuRef,
  onCreateTab,
  onToggle,
  onSelect,
  t
}: TerminalShellSelectorProps) {
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);
  const subMenuRef = useRef<HTMLDivElement | null>(null);

  const terminalWorkspaceId = useAppStore((s) => s.terminalWorkspaceId);
  const setTerminalWorkspaceId = useAppStore((s) => s.setTerminalWorkspaceId);
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);

  const boundWorkspace = useMemo(() => {
    if (!terminalWorkspaceId) return null;
    return recentWorkspaces.find(w => w.id === terminalWorkspaceId);
  }, [terminalWorkspaceId, recentWorkspaces]);

  const boundWorkspaceLabel = useMemo(() => {
    if (!boundWorkspace) return t.terminalIndependent;
    return boundWorkspace.name;
  }, [boundWorkspace, t.terminalIndependent]);

  useEffect(() => {
    if (!menuOpen) {
      setActiveSubMenuId(null);
    }
  }, [menuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !subMenuRef.current?.contains(target)) {
        setActiveSubMenuId(null);
      }
    };
    if (activeSubMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeSubMenuId, menuRef]);

  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnterSubMenu = useCallback((itemId: string) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setActiveSubMenuId(itemId);
  }, []);

  const handleMouseLeaveSubMenu = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setActiveSubMenuId(null);
      leaveTimerRef.current = null;
    }, 200);
  }, []);

  const handleMouseEnterSubMenuContent = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleMouseLeaveSubMenuContent = useCallback(() => {
    setActiveSubMenuId(null);
  }, []);

  const handleWorkspaceSelect = useCallback((workspaceId: string) => {
    setTerminalWorkspaceId(workspaceId);
    setActiveSubMenuId(null);
  }, [setTerminalWorkspaceId]);

  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <div className={`adl-split-pill${menuOpen ? " is-open" : ""}`}>
        <TooltipSimple content={t.menuNewTerminal} placement="top">
          <button
            type="button"
            className="adl-split-pill__main"
            onClick={() => onCreateTab(currentProfile, terminalWorkspaceId)}
            aria-label={t.menuNewTerminal}
          >
            <IconPlus size={12} decorative />
            <span>{currentProfileLabel}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={boundWorkspaceLabel} placement="top">
          <button
            type="button"
            className={`adl-split-pill__toggle${menuOpen ? " is-open" : ""}`}
            onClick={onToggle}
            aria-label={t.shellTypeSelect}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="adl-split-pill__workspace-label" title={boundWorkspaceLabel}>
              {boundWorkspaceLabel.length > 12 ? boundWorkspaceLabel.substring(0, 12) + "..." : boundWorkspaceLabel}
            </span>
            <IconChevronDown size={12} decorative />
          </button>
        </TooltipSimple>
      </div>
      {menuOpen ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown adl-terminal-shell-dropdown" role="menu">
          {menuItems.map((item) =>
            "separator" in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : "hasSubMenu" in item ? (
              <div
                key={item.id}
                className={`adl-menu__item adl-menu__item--has-sub${activeSubMenuId === item.id ? " is-open" : ""}`}
                onMouseEnter={() => handleMouseEnterSubMenu(item.id)}
                onMouseLeave={handleMouseLeaveSubMenu}
              >
                <span>{item.label}</span>
                <IconChevronRight size={12} decorative />
                {activeSubMenuId === item.id && (
                  <div
                    className="adl-menu__dropdown adl-menu__dropdown--sub adl-menu__dropdown--right"
                    role="menu"
                    ref={subMenuRef}
                    onMouseEnter={handleMouseEnterSubMenuContent}
                    onMouseLeave={handleMouseLeaveSubMenuContent}
                  >
                    {item.subMenu.map((subItem: WorkspaceMenuItem) => (
                      <button
                        key={subItem.id}
                        type="button"
                        role="menuitem"
                        className={`adl-menu__item${subItem.workspaceId === terminalWorkspaceId ? " is-active" : ""}`}
                        onClick={() => handleWorkspaceSelect(subItem.workspaceId)}
                        title={subItem.label}
                      >
                        <span>{subItem.label}</span>
                        {subItem.workspaceId === terminalWorkspaceId && (
                          <span className="adl-menu__check">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.profile ? item.profile === currentProfile : false}
                className="adl-menu__item"
                onClick={() => {
                  if (item.profile) {
                    onSelect(item.profile);
                  } else {
                    item.action?.();
                  }
                }}
              >
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
