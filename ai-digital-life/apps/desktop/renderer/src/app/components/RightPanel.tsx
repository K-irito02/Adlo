import React from "react";
import { renderIcon, type IconName } from "../../design-system/icons";
import { ToolSwitcher } from "./ToolSwitcher";
import { ToolContextArea } from "./ToolContextArea";
import { ToolSidebar } from "./ToolSidebar";

export type ToolType = "files" | "changes" | "browser" | "terminal";

export interface RightPanelProps {
  visible: boolean;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  children?: React.ReactNode;
}

export function RightPanel({ visible, activeTool, onToolChange, children }: RightPanelProps) {
  if (!visible) {
    return null;
  }

  return (
    <aside
      className="right-panel"
      role="complementary"
      aria-label="Right panel"
      style={{
        width: "var(--right-panel-width)",
        minWidth: "var(--right-panel-width-min)",
        maxWidth: "var(--right-panel-width-max)",
      }}
    >
      <ToolSwitcher activeTool={activeTool} onToolChange={onToolChange} />
      <div className="right-panel__divider" role="separator" aria-hidden="true" />
      <div className="right-panel__body">
        <ToolContextArea activeTool={activeTool} />
        <div className="right-panel__content-area">
          <ToolSidebar activeTool={activeTool} />
          <main className="right-panel__tool-content">{children}</main>
        </div>
      </div>
    </aside>
  );
}

export default RightPanel;
