import React, { lazy, Suspense, useId, useCallback } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { ToolSwitcher } from './right-panel/ToolSwitcher';

const FilesPanel = lazy(() =>
  import('./right-panel/panels/FilesPanel').then((m) => ({ default: m.FilesPanel })),
);
const ChangesPanel = lazy(() =>
  import('./right-panel/panels/ChangesPanel').then((m) => ({ default: m.ChangesPanel })),
);
const BrowserPanel = lazy(() =>
  import('./right-panel/panels/BrowserPanel').then((m) => ({ default: m.BrowserPanel })),
);
const TerminalPanel = lazy(() =>
  import('../features/terminal').then((m) => ({ default: m.TerminalPanel })),
);
const SettingsPanel = lazy(() =>
  import('../components/settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const CommunicationPanel = lazy(() =>
  import('./right-panel/panels/CommunicationPanel').then((m) => ({
    default: m.CommunicationPanel,
  })),
);
import type {
  FilesPanelProps,
  ChangesPanelProps,
  BrowserPanelProps,
  TerminalPanelProps,
  SettingsPanelProps,
} from './right-panel/types';
import type { PatchDirection, PatchReviewFilter } from '../features/patch-review';
import type { EditorRef, DiffEditorRef } from '../stores/types';
import type { ToolId } from '../stores/types';
import { useRightPanelLayout } from './right-panel/hooks/useRightPanelLayout';
import { useRightPanelViewProps } from './right-panel/hooks/useRightPanelViewProps';
import { useFilesPanelProps } from './right-panel/hooks/useFilesPanelProps';
import { useChangesPanelProps } from './right-panel/hooks/useChangesPanelProps';
import { useBrowserPanelProps } from './right-panel/hooks/useBrowserPanelProps';
import { useTerminalPanelProps } from './right-panel/hooks/useTerminalPanelProps';

import { useSettingsPanelProps } from './right-panel/hooks/useSettingsPanelProps';

export interface RightPanelProps {
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
    options?: { activateTool?: boolean; line?: number; hunkId?: string },
  ) => void;
  onSelectPatchHunk: (
    relativePath: string,
    hunkId: string,
    line: number,
    options?: { activateTool?: boolean },
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
  settingsProps: SettingsPanelProps;
}

function areActiveToolPanelPropsEqual(
  prevProps: ActiveToolPanelProps,
  nextProps: ActiveToolPanelProps,
) {
  return (
    prevProps.activeTool === nextProps.activeTool &&
    prevProps.idBase === nextProps.idBase &&
    prevProps.filesProps === nextProps.filesProps &&
    prevProps.changesProps === nextProps.changesProps &&
    prevProps.browserProps === nextProps.browserProps &&
    prevProps.terminalProps === nextProps.terminalProps &&
    prevProps.settingsProps === nextProps.settingsProps
  );
}

function PanelSkeleton() {
  return null;
}

const ActiveToolPanel = React.memo(function ActiveToolPanel({
  activeTool,
  idBase,
  filesProps,
  changesProps,
  browserProps,
  terminalProps,
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
        <Suspense fallback={<PanelSkeleton />}>
          <FilesPanel {...filesProps} />
        </Suspense>
      </div>
      <div hidden={activeTool !== 'changes'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <ChangesPanel {...changesProps} />
        </Suspense>
      </div>
      <div hidden={activeTool !== 'browser'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <BrowserPanel {...browserProps} />
        </Suspense>
      </div>
      <div hidden={activeTool !== 'terminal'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <TerminalPanel {...terminalProps} />
        </Suspense>
      </div>
      <div hidden={activeTool !== 'settings'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <SettingsPanel
            settings={settingsProps.settings}
            onChangeSetting={settingsProps.onChangeSetting}
          />
        </Suspense>
      </div>
      <div hidden={activeTool !== 'communicate'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <CommunicationPanel />
        </Suspense>
      </div>
    </div>
  );
}, areActiveToolPanelPropsEqual);

const RightPanel = React.memo(function RightPanel(panelProps: RightPanelProps) {
  const { t } = useTCopy();
  const { collapsed } = panelProps;

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
    activeRightTool === 'browser' && !collapsed,
  );
  const terminalProps = useTerminalPanelProps(panelProps);
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
      aria-label={t.toolPanel}
      aria-hidden={collapsed}
    >
      <div
        className="adl-rightpanel__resize-handle"
        onPointerDown={handleResizeStart}
        aria-hidden="true"
      />
      <div className="adl-rightpanel__content">
        <ToolSwitcher
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
          settingsProps={settingsProps}
        />
      </div>
    </aside>
  );
});

export { RightPanel };
