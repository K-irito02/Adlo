import React from "react";
import {
  IconFiles,
  IconGitFork,
  IconGlobe,
  IconTerminal
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import type { CopyDict } from "../../copy";
import type { ToolId } from "../../ui-store";

interface ToolSwitcherProps {
  t: CopyDict;
  activeTool: ToolId;
  badges: Record<ToolId, number>;
  onSelect: (tool: ToolId) => void;
}

const TAB_META: Array<{ id: ToolId; shortcut: string; icon: React.ReactNode; labelKey: keyof CopyDict }> = [
  { id: "files", shortcut: "Ctrl+Shift+E", icon: <IconFiles size={16} decorative />, labelKey: "toolFiles" },
  { id: "changes", shortcut: "Ctrl+Shift+G", icon: <IconGitFork size={16} decorative />, labelKey: "toolChanges" },
  { id: "browser", shortcut: "Ctrl+Shift+B", icon: <IconGlobe size={16} decorative />, labelKey: "toolBrowser" },
  { id: "terminal", shortcut: "Ctrl+Shift+`", icon: <IconTerminal size={16} decorative />, labelKey: "toolTerminal" }
];

export function ToolSwitcher({ t, activeTool, badges, onSelect }: ToolSwitcherProps) {
  return (
    <div className="adl-toolswitcher" role="tablist" aria-label={t.toolSwitcher}>
      {TAB_META.map((tab) => {
        const label = t[tab.labelKey] as string;
        const badge = badges[tab.id];
        return (
          <TooltipSimple key={tab.id} content={`${label} · ${tab.shortcut}`} placement="top">
            <button
              type="button"
              role="tab"
              aria-selected={activeTool === tab.id}
              className={`adl-toolswitcher__tab${activeTool === tab.id ? " is-active" : ""}`}
              onClick={() => onSelect(tab.id)}
            >
              <span className="adl-toolswitcher__icon">{tab.icon}</span>
              <span className="adl-toolswitcher__label">{label}</span>
              {badge > 0 ? <span className="adl-toolswitcher__badge">{badge}</span> : null}
            </button>
          </TooltipSimple>
        );
      })}
    </div>
  );
}
