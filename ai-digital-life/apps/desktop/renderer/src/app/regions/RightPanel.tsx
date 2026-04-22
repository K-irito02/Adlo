import React, { useCallback } from "react";
import { useUiStore } from "../ui-store";
import { BrowserPanel } from "./right-panel/BrowserPanel";
import { ChangesPanel } from "./right-panel/ChangesPanel";
import { FilesPanel } from "./right-panel/FilesPanel";
import { TerminalPanel } from "./right-panel/TerminalPanel";
import { ToolSwitcher } from "./right-panel/ToolSwitcher";
import type { RightPanelViewProps } from "./right-panel/types";
import { countGitChanges } from "./right-panel/types";

export function RightPanel(props: RightPanelViewProps) {
  const { collapsed, editorTabs, dirtyEditorPaths } = props;
  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUiStore((state) => state.setRightPanelWidth);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const terminalTabs = useUiStore((state) => state.terminalTabs);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = rightPanelWidth;
      const body = document.body;
      body.classList.add("adl-is-resizing");

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        setRightPanelWidth(startWidth + delta);
      };

      const handleUp = () => {
        body.classList.remove("adl-is-resizing");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [rightPanelWidth, setRightPanelWidth]
  );

  const badges = {
    files: dirtyEditorPaths.length,
    changes: countGitChanges(props.appInfo),
    browser: browserTabs.length,
    terminal: terminalTabs.length
  };

  return (
    <aside
      className={`adl-rightpanel${collapsed ? " adl-rightpanel--collapsed" : ""}`}
      aria-label="Workspace tool panel"
      aria-hidden={collapsed}
    >
      <div className="adl-rightpanel__resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      <div className="adl-rightpanel__content">
        <ToolSwitcher t={props.t} activeTool={activeTool} badges={badges} onSelect={setActiveTool} />

        <div className={`adl-rightpanel__tool${activeTool === "files" ? " is-active" : ""}`} hidden={activeTool !== "files"}>
          <FilesPanel {...props} />
        </div>
        <div className={`adl-rightpanel__tool${activeTool === "changes" ? " is-active" : ""}`} hidden={activeTool !== "changes"}>
          <ChangesPanel {...props} />
        </div>
        <div className={`adl-rightpanel__tool${activeTool === "browser" ? " is-active" : ""}`} hidden={activeTool !== "browser"}>
          <BrowserPanel {...props} />
        </div>
        <div className={`adl-rightpanel__tool${activeTool === "terminal" ? " is-active" : ""}`} hidden={activeTool !== "terminal"}>
          <TerminalPanel {...props} />
        </div>
      </div>
    </aside>
  );
}

