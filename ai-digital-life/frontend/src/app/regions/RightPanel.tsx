import React, { useId } from "react";
import { BrowserPanel } from "./right-panel/BrowserPanel";
import { ChangesPanel } from "./right-panel/ChangesPanel";
import { FilesPanel } from "./right-panel/FilesPanel";
import { TerminalPanel } from "../features/terminal";
import { ToolSwitcher } from "./right-panel/ToolSwitcher";
import { AuditPanel } from "../components/approval/AuditPanel";
import { ModelHealthPanel } from "../components/models/ModelHealthPanel";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import type { RightPanelViewProps } from "./right-panel/types";
import type { PatchDirection, PatchReviewFilter } from "../features/patch-review";
import type { CopyDict } from "../copy";
import type { EditorRef, DiffEditorRef } from "../types";
import type { ToolId } from "../ui-store";
import { useRightPanelLayout } from "./right-panel/hooks/useRightPanelLayout";
import { useRightPanelViewProps } from "./right-panel/hooks/useRightPanelViewProps";

export interface RightPanelProps {
  t: CopyDict;
  collapsed: boolean;
  standardEditorRef: React.MutableRefObject<EditorRef | null>;
  selectedPatchFilePath?: string;
  selectedPatchHunkId?: string;
  collapsedPatchHunkIds: string[];
  patchReviewFilter: PatchReviewFilter;
  onOpenFileAtLine: (relativePath: string, line: number) => void;
  onDiffMount: (editor: EditorRef | DiffEditorRef) => void;
  onSendSelection: () => void;
  onSelectPatchFile: (relativePath: string, options?: { activateTool?: boolean; line?: number; hunkId?: string }) => void;
  onSelectPatchHunk: (relativePath: string, hunkId: string, line: number, options?: { activateTool?: boolean }) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSetAllPatchHunksCollapsed: (collapsed: boolean, relativePath?: string) => void;
  onSetPatchReviewFilter: (filter: PatchReviewFilter) => void;
  onJumpPatchHunk: (direction: PatchDirection) => void;
}

const ActiveToolPanel = React.memo(function ActiveToolPanel({ activeTool, idBase, ...props }: { activeTool: ToolId; idBase: string } & RightPanelViewProps) {
  const panelId = `${idBase}-${activeTool}-panel`;
  const tabId = `${idBase}-${activeTool}-tab`;
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className="adl-rightpanel__tool is-active"
    >
      {activeTool === "files" ? <FilesPanel {...props} /> : null}
      {activeTool === "changes" ? <ChangesPanel {...props} /> : null}
      {activeTool === "browser" ? <BrowserPanel {...props} /> : null}
      {activeTool === "terminal" ? <TerminalPanel {...props} /> : null}
      {activeTool === "audit" ? <AuditPanel t={props.t} entries={props.auditEntries} /> : null}
      {activeTool === "models" ? (
        <ModelHealthPanel t={props.t} modelHealth={props.modelHealth} onRefresh={props.onRefreshModelHealth} />
      ) : null}
      {activeTool === "settings" ? (
        <SettingsPanel t={props.t} settings={props.settings} onChangeSetting={props.onChangeSetting} />
      ) : null}
    </div>
  );
});

export function RightPanel(panelProps: RightPanelProps) {
  const { t, collapsed } = panelProps;

  const { viewProps, activeTool, setActiveTool, badges } = useRightPanelViewProps(panelProps, collapsed);
  const { panelRef, handleResizeStart, rightPanelMode, rightPanelWidth, applyPanelGeometry, lastRestorableWidthRef, readLayoutMetrics, clampPanelWidthToShell, setRightPanelWidth } = useRightPanelLayout(collapsed);

  const panelIdBase = useId();

  return (
    <aside
      ref={panelRef}
      className={`adl-rightpanel${collapsed ? " adl-rightpanel--collapsed" : ""}`}
      aria-label="Workspace tool panel"
      aria-hidden={collapsed}
    >
      <div className="adl-rightpanel__resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      <div className="adl-rightpanel__content">
        <ToolSwitcher
          t={t}
          activeTool={activeTool}
          badges={badges}
          idBase={panelIdBase}
          onSelect={setActiveTool}
          rightPanelExpanded={rightPanelMode === "overlay_full"}
          onToggleRightPanelExpanded={() => {
            const metrics = readLayoutMetrics();
            if (rightPanelMode === "overlay_full") {
              const restoredWidth = clampPanelWidthToShell(lastRestorableWidthRef.current);
              const { nextWidth } = applyPanelGeometry(restoredWidth, { commitRestorable: true });
              setRightPanelWidth(nextWidth);
              return;
            }
            const entryWidth = rightPanelWidth >= metrics.overlayThreshold ? rightPanelWidth : clampPanelWidthToShell(rightPanelWidth);
            lastRestorableWidthRef.current = clampPanelWidthToShell(entryWidth);
            const { nextWidth } = applyPanelGeometry(metrics.rightMaxWidth);
            setRightPanelWidth(nextWidth);
          }}
        />

        <ActiveToolPanel {...viewProps} activeTool={activeTool} idBase={panelIdBase} />
      </div>
    </aside>
  );
}