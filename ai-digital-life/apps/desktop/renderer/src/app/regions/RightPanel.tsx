import React, { useCallback, useId, useRef } from "react";
import { RIGHT_PANEL_WIDTH_MAX, RIGHT_PANEL_WIDTH_MIN, useUiStore } from "../ui-store";
import { BrowserPanel } from "./right-panel/BrowserPanel";
import { ChangesPanel } from "./right-panel/ChangesPanel";
import { FilesPanel } from "./right-panel/FilesPanel";
import { TerminalPanel } from "./right-panel/TerminalPanel";
import { ToolSwitcher } from "./right-panel/ToolSwitcher";
import type { RightPanelViewProps } from "./right-panel/types";
import { countGitChanges } from "./right-panel/types";

export function RightPanel(props: RightPanelViewProps) {
  const panelIdBase = useId();
  const { collapsed, editorTabs, dirtyEditorPaths } = props;
  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUiStore((state) => state.setRightPanelWidth);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const terminalTabs = useUiStore((state) => state.terminalTabs);
  const panelRef = useRef<HTMLElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = rightPanelWidth;
      let latestWidth = startWidth;
      const body = document.body;
      const shellBody = panelRef.current?.closest(".adl-shell__body") as HTMLElement | null;
      body.classList.add("adl-is-resizing");
      shellBody?.classList.add("is-resizing");

      const clampWidth = (value: number) => Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(RIGHT_PANEL_WIDTH_MAX, value));
      const applyPreviewWidth = (value: number) => {
        shellBody?.style.setProperty("--rightpanel-width", `${clampWidth(value)}px`);
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        latestWidth = clampWidth(startWidth + delta);
        if (resizeFrameRef.current !== null) {
          return;
        }
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyPreviewWidth(latestWidth);
        });
      };

      const handleUp = () => {
        body.classList.remove("adl-is-resizing");
        shellBody?.classList.remove("is-resizing");
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        applyPreviewWidth(latestWidth);
        setRightPanelWidth(latestWidth);
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
      ref={panelRef}
      className={`adl-rightpanel${collapsed ? " adl-rightpanel--collapsed" : ""}`}
      aria-label="Workspace tool panel"
      aria-hidden={collapsed}
    >
      <div className="adl-rightpanel__resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      <div className="adl-rightpanel__content">
        <ToolSwitcher t={props.t} activeTool={activeTool} badges={badges} idBase={panelIdBase} onSelect={setActiveTool} />

        <div
          id={`${panelIdBase}-files-panel`}
          role="tabpanel"
          aria-labelledby={`${panelIdBase}-files-tab`}
          tabIndex={0}
          className={`adl-rightpanel__tool${activeTool === "files" ? " is-active" : ""}`}
          hidden={activeTool !== "files"}
        >
          <FilesPanel {...props} />
        </div>
        <div
          id={`${panelIdBase}-changes-panel`}
          role="tabpanel"
          aria-labelledby={`${panelIdBase}-changes-tab`}
          tabIndex={0}
          className={`adl-rightpanel__tool${activeTool === "changes" ? " is-active" : ""}`}
          hidden={activeTool !== "changes"}
        >
          <ChangesPanel {...props} />
        </div>
        <div
          id={`${panelIdBase}-browser-panel`}
          role="tabpanel"
          aria-labelledby={`${panelIdBase}-browser-tab`}
          tabIndex={0}
          className={`adl-rightpanel__tool${activeTool === "browser" ? " is-active" : ""}`}
          hidden={activeTool !== "browser"}
        >
          <BrowserPanel {...props} />
        </div>
        <div
          id={`${panelIdBase}-terminal-panel`}
          role="tabpanel"
          aria-labelledby={`${panelIdBase}-terminal-tab`}
          tabIndex={0}
          className={`adl-rightpanel__tool${activeTool === "terminal" ? " is-active" : ""}`}
          hidden={activeTool !== "terminal"}
        >
          <TerminalPanel {...props} />
        </div>
      </div>
    </aside>
  );
}
