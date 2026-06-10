import React, { useId, useCallback } from 'react';
import { BrowserPanel } from './right-panel/panels/BrowserPanel';
import { ChangesPanel } from './right-panel/panels/ChangesPanel';
import { FilesPanel } from './right-panel/panels/FilesPanel';
import { TerminalPanel } from '../features/terminal';
import { ToolSwitcher } from './right-panel/ToolSwitcher';
import { AuditPanel } from '../components/approval/AuditPanel';
import { ModelHealthPanel } from '../components/models/ModelHealthPanel';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { CommunicationPanel } from './right-panel/panels/CommunicationPanel';
import type {
  FilesPanelProps,
  ChangesPanelProps,
  BrowserPanelProps,
  TerminalPanelProps,
  AuditPanelProps,
  ModelPanelProps,
  SettingsPanelProps,
} from './right-panel/types';
import type { PatchDirection, PatchReviewFilter } from '../features/patch-review';
import type { CopyDict } from '../i18n';
import type { EditorRef, DiffEditorRef } from '../stores/types';
import type { ToolId } from '../stores/types';
import { useRightPanelLayout } from './right-panel/hooks/useRightPanelLayout';
import { useRightPanelViewProps } from './right-panel/hooks/useRightPanelViewProps';
import { useFilesPanelProps } from './right-panel/hooks/useFilesPanelProps';
import { useChangesPanelProps } from './right-panel/hooks/useChangesPanelProps';
import { useBrowserPanelProps } from './right-panel/hooks/useBrowserPanelProps';
import { useTerminalPanelProps } from './right-panel/hooks/useTerminalPanelProps';
import { useAuditPanelProps } from './right-panel/hooks/useAuditPanelProps';
import { useModelPanelProps } from './right-panel/hooks/useModelPanelProps';
import { useSettingsPanelProps } from './right-panel/hooks/useSettingsPanelProps';

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
  onSelectPatchFile: (
    relativePath: string,
    options?: { activateTool?: boolean; line?: number; hunkId?: string }
  ) => void;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    line: number,
    options?: { activateTool?: boolean }
  ) => void;
  onTogglePatchHunkCollapse: (hunkId: string) => void;
  onSetAllPatchHunksCollapsed: (collapsed: boolean, relativePath?: string) => void;
  onSetPatchReviewFilter: (filter: PatchReviewFilter) => void;
  onJumpPatchHunk: (direction: PatchDirection) => void;
}

interface ActiveToolPanelProps {
  activeTool: ToolId;
  idBase: string;
  filesProps: FilesPanelProps;
  changesProps: ChangesPanelProps;
  browserProps: BrowserPanelProps;
  terminalProps: TerminalPanelProps;
  auditProps: AuditPanelProps;
  modelProps: ModelPanelProps;
  settingsProps: SettingsPanelProps;
}

function areActiveToolPanelPropsEqual(
  prevProps: ActiveToolPanelProps,
  nextProps: ActiveToolPanelProps
) {
  return (
    prevProps.activeTool === nextProps.activeTool &&
    prevProps.idBase === nextProps.idBase &&
    prevProps.filesProps === nextProps.filesProps &&
    prevProps.changesProps === nextProps.changesProps &&
    prevProps.browserProps === nextProps.browserProps &&
    prevProps.terminalProps === nextProps.terminalProps &&
    prevProps.auditProps === nextProps.auditProps &&
    prevProps.modelProps === nextProps.modelProps &&
    prevProps.settingsProps === nextProps.settingsProps
  );
}

const ActiveToolPanel = React.memo(function ActiveToolPanel({
  activeTool,
  idBase,
  filesProps,
  changesProps,
  browserProps,
  terminalProps,
  auditProps,
  modelProps,
  settingsProps,
}: ActiveToolPanelProps) {
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
      <div hidden={activeTool !== 'files'} style={{ height: '100%', minHeight: 0 }}>
        <FilesPanel {...filesProps} />
      </div>
      <div hidden={activeTool !== 'changes'} style={{ height: '100%', minHeight: 0 }}>
        <ChangesPanel {...changesProps} />
      </div>
      <div hidden={activeTool !== 'browser'} style={{ height: '100%', minHeight: 0 }}>
        <BrowserPanel {...browserProps} />
      </div>
      <div hidden={activeTool !== 'terminal'} style={{ height: '100%', minHeight: 0 }}>
        <TerminalPanel {...terminalProps} />
      </div>
      <div hidden={activeTool !== 'audit'} style={{ height: '100%', minHeight: 0 }}>
        <AuditPanel t={auditProps.t} entries={auditProps.auditEntries} />
      </div>
      <div hidden={activeTool !== 'models'} style={{ height: '100%', minHeight: 0 }}>
        <ModelHealthPanel
          t={modelProps.t}
          modelHealth={modelProps.modelHealth}
          onRefresh={modelProps.onRefreshModelHealth}
        />
      </div>
      <div hidden={activeTool !== 'settings'} style={{ height: '100%', minHeight: 0 }}>
        <SettingsPanel
          t={settingsProps.t}
          settings={settingsProps.settings}
          onChangeSetting={settingsProps.onChangeSetting}
        />
      </div>
      <div hidden={activeTool !== 'communicate'} style={{ height: '100%', minHeight: 0 }}>
        <CommunicationPanel />
      </div>
    </div>
  );
}, areActiveToolPanelPropsEqual);

const RightPanel = React.memo(function RightPanel(panelProps: RightPanelProps) {
  const { t, collapsed } = panelProps;

  const { activeRightTool, setActiveRightTool, badges, diffSideBySide, onSetDiffLayout } =
    useRightPanelViewProps();
  const {
    panelRef,
    handleResizeStart,
    rightPanelMode,
    rightPanelWidth,
    applyPanelGeometry,
    lastRestorableWidthRef,
    readLayoutMetrics,
    clampPanelWidthToShell,
    setRightPanelWidth,
  } = useRightPanelLayout(collapsed);

  const filesProps = useFilesPanelProps(panelProps, diffSideBySide, onSetDiffLayout);
  const changesProps = useChangesPanelProps(panelProps, diffSideBySide, onSetDiffLayout);
  const browserProps = useBrowserPanelProps(
    panelProps,
    activeRightTool === 'browser' && !collapsed
  );
  const terminalProps = useTerminalPanelProps(panelProps);
  const auditProps = useAuditPanelProps(panelProps);
  const modelProps = useModelPanelProps(panelProps);
  const settingsProps = useSettingsPanelProps(panelProps);

  const panelIdBase = useId();

  const handleToggleRightPanelExpanded = useCallback(() => {
    const metrics = readLayoutMetrics();
    if (rightPanelMode === 'overlay_full') {
      const restoredWidth = clampPanelWidthToShell(lastRestorableWidthRef.current);
      const { nextWidth } = applyPanelGeometry(restoredWidth, { commitRestorable: true });
      setRightPanelWidth(nextWidth);
      return;
    }
    const entryWidth =
      rightPanelWidth >= metrics.overlayThreshold
        ? rightPanelWidth
        : clampPanelWidthToShell(rightPanelWidth);
    lastRestorableWidthRef.current = clampPanelWidthToShell(entryWidth);
    const { nextWidth } = applyPanelGeometry(metrics.rightMaxWidth);
    setRightPanelWidth(nextWidth);
  }, [
    rightPanelMode,
    rightPanelWidth,
    readLayoutMetrics,
    clampPanelWidthToShell,
    applyPanelGeometry,
    setRightPanelWidth,
    lastRestorableWidthRef,
  ]);

  return (
    <aside
      ref={panelRef}
      className={`adl-rightpanel${collapsed ? ' adl-rightpanel--collapsed' : ''}`}
      aria-label="Workspace tool panel"
      aria-hidden={collapsed}
    >
      <div
        className="adl-rightpanel__resize-handle"
        onPointerDown={handleResizeStart}
        aria-hidden="true"
      />
      <div className="adl-rightpanel__content">
        <ToolSwitcher
          t={t}
          activeTool={activeRightTool}
          badges={badges}
          idBase={panelIdBase}
          onSelect={setActiveRightTool}
          rightPanelExpanded={rightPanelMode === 'overlay_full'}
          onToggleRightPanelExpanded={handleToggleRightPanelExpanded}
        />

        <ActiveToolPanel
          activeTool={activeRightTool}
          idBase={panelIdBase}
          filesProps={filesProps}
          changesProps={changesProps}
          browserProps={browserProps}
          terminalProps={terminalProps}
          auditProps={auditProps}
          modelProps={modelProps}
          settingsProps={settingsProps}
        />
      </div>
    </aside>
  );
});

export { RightPanel };
