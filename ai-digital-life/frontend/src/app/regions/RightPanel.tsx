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
// ── 通信面板（发布前隐藏，可恢复） ─────────────────────────────────────────
// 隐藏原因：通信面板还有很多功能没有实现，发布产品时暂不对外展示，
// 以后考虑好后会再恢复实现与完善，所以这里只注释、不删除代码。
// 恢复方法（共 3 处，缺一不可）：
// 1. 取消下面 CommunicationPanel 懒加载的注释；
// 2. 恢复下方 ActiveToolPanel 中 communicate 面板 div 的注释；
// 3. 恢复 ToolSwitcher.tsx TAB_META 中的 communicate 配置块注释。
// 注意：i18n（communicate.ts）、communicateSlice、CSS 均完整保留，恢复后即刻可用；
// 持久化的 activeRightTool 若为旧值（如 'communicate'），注册表的 readStringEnum 会回落到 'files'，无需迁移。
// const CommunicationPanel = lazy(() =>
//   import('./right-panel/panels/CommunicationPanel').then((m) => ({
//     default: m.CommunicationPanel,
//   })),
// );
import type {
  FilesPanelProps,
  ChangesPanelProps,
  BrowserPanelProps,
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
          <TerminalPanel />
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
      {/* ── 通信面板（发布前隐藏，可恢复）：隐藏原因与恢复方法见文件顶部懒加载处的注释。
          面板组件、i18n、slice、CSS 均完整保留；恢复时取消本段注释即可。 */}
      {/* <div hidden={activeTool !== 'communicate'} style={{ height: '100%', minHeight: 0 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <CommunicationPanel />
        </Suspense>
      </div> */}
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
          settingsProps={settingsProps}
        />
      </div>
    </aside>
  );
});

export { RightPanel };
