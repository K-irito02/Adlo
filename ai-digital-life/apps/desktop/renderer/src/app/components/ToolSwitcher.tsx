import React from "react";
import { renderIcon, type IconName } from "../../design-system/icons";
import type { ToolType } from "./RightPanel";

export interface ToolSwitcherProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  badges?: Record<string, number>;
}

interface ToolTabDefinition {
  key: ToolType;
  icon: IconName;
  label: string;
  shortcut: string;
  badgeKey?: string;
}

const TOOL_TABS: readonly ToolTabDefinition[] = [
  { key: "files", icon: "files", label: "\u6587\u4EF6", shortcut: "Ctrl+Shift+E" },
  { key: "changes", icon: "git-fork", label: "\u53D8\u66F4", shortcut: "Ctrl+Shift+G", badgeKey: "changes" },
  { key: "browser", icon: "globe", label: "\u6D4F\u89C8\u5668", shortcut: "Ctrl+Shift+B" },
  { key: "terminal", icon: "terminal", label: "\u7EC8\u7AEF", shortcut: "Ctrl+Shift+`" },
] as const;

export function ToolSwitcher({ activeTool, onToolChange, badges }: ToolSwitcherProps) {
  return (
    <nav className="tool-switcher" role="tablist" aria-label="Tool switcher">
      {TOOL_TABS.map((tab) => {
        const isActive = activeTool === tab.key;
        const badgeCount = tab.badgeKey ? badges?.[tab.badgeKey] : undefined;

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${tab.label} (${tab.shortcut})`}
            className={`tool-switcher__tab${isActive ? " tool-switcher__tab--active" : ""}`}
            onClick={() => onToolChange(tab.key)}
          >
            <span
              className="tool-switcher__tab-icon"
              dangerouslySetInnerHTML={{
                __html: renderIcon(tab.icon, { size: "sm", decorative: true }).value,
              }}
            />
            <span className="tool-switcher__tab-label">{tab.label}</span>
            <span className="tool-switcher__tab-shortcut">{tab.shortcut}</span>
            {badgeCount != null && badgeCount > 0 ? (
              <span className="tool-switcher__tab-badge">{badgeCount > 99 ? "99+" : badgeCount}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default ToolSwitcher;
