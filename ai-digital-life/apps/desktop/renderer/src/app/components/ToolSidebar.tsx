import React, { useState } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";
import { TooltipSimple } from "./Tooltip";
import type { ToolType } from "./RightPanel";

export interface ToolSidebarProps {
  activeTool: ToolType;
  onAction?: (action: string) => void;
}

interface SidebarActionDef {
  key: string;
  icon: IconName;
  title: string;
  separator?: boolean;
}

const SIDEBAR_ACTIONS: Record<ToolType, readonly SidebarActionDef[]> = {
  files: [
    { key: "toggle-explorer", icon: "layout-grid", title: "Toggle Explorer" },
    { key: "search-files", icon: "search", title: "Search Files" },
    { key: "new-file", icon: "file-plus", title: "New File" },
    { key: "new-folder", icon: "folder-plus", title: "New Folder" },
    { key: "refresh-files", icon: "refresh", title: "Refresh" },
    { key: "collapse-all", icon: "chevron-down", title: "Collapse All", separator: true },
    { key: "files-more", icon: "more-vertical", title: "More Actions", separator: true },
  ] as const,
  changes: [
    { key: "stage-toggle", icon: "check-circle", title: "Stage / Unstage" },
    { key: "branch-select", icon: "git-branch", title: "Select Branch" },
    { key: "refresh-changes", icon: "refresh", title: "Refresh Changes" },
    { key: "changes-more", icon: "more-vertical", title: "More Actions", separator: true },
  ] as const,
  browser: [
    { key: "toggle-sidebar", icon: "columns", title: "Toggle Sidebar" },
    { key: "browser-back", icon: "chevron-left", title: "Back" },
    { key: "browser-forward", icon: "chevron-right", title: "Forward" },
    { key: "browser-refresh", icon: "refresh", title: "Refresh" },
    { key: "bookmarks", icon: "bookmark", title: "Bookmarks" },
    { key: "browser-more", icon: "more-vertical", title: "More Actions", separator: true },
  ] as const,
  terminal: [
    { key: "new-terminal", icon: "plus", title: "New Terminal" },
    { key: "shell-selector", icon: "terminal", title: "Shell Selector" },
    { key: "split-toggle", icon: "columns", title: "Split Toggle" },
    { key: "terminal-more", icon: "more-vertical", title: "More Actions", separator: true },
  ] as const,
};

export function ToolSidebar({ activeTool, onAction }: ToolSidebarProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const actions = SIDEBAR_ACTIONS[activeTool];

  const handleAction = (key: string) => {
    setActiveAction(key);
    onAction?.(key);
  };

  return (
    <nav
      className="tool-sidebar"
      role="toolbar"
      aria-label={`${activeTool} tool sidebar`}
    >
      <ul className="tool-sidebar__list" role="list">
        {actions.map((action) => (
          <li
            key={action.key}
            className={`tool-sidebar__item${action.separator ? " tool-sidebar__item--separator" : ""}`}
            role={action.separator ? "separator" : undefined}
          >
            <TooltipSimple content={action.title} placement="right">
              <button
                type="button"
                className={`tool-sidebar__btn${activeAction === action.key ? " tool-sidebar__btn--active" : ""}`}
                onClick={() => handleAction(action.key)}
                aria-pressed={activeAction === action.key}
              >
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderIcon(action.icon, { size: "sm", decorative: true }).value,
                  }}
                />
              </button>
            </TooltipSimple>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default ToolSidebar;
