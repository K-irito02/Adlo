import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { DIFF_LAYOUT_STORAGE_KEY } from "../constants";
import { RIGHT_PANEL_WIDTH_MAX, RIGHT_PANEL_WIDTH_MIN, useUiStore, type ToolId } from "../ui-store";
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
import { countGitChanges } from "./right-panel/types";
import {
  deriveRightPanelOverlayState,
  type RightPanelMode
} from "./right-panel/rightPanelLayout";
import type { CopyDict } from "../copy";
import type { EditorRef, DiffEditorRef } from "../types";
import { useAppStore } from "../stores/slicedStore";
import { useAppActions } from "../hooks/useAppActions";
import { buildSettingsItems } from "../settingsViewModel";
import { preferencePatchFromSettingChange } from "../settingsViewModel";
import { mapPatchToEditorTab } from "../editorTabs";
import { findPatchFileByPath } from "../features/patch-review";
import { filterDiagnosticsForPath, detectEditorLanguage } from "../workspacePaths";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface RightPanelLayoutMetrics {
  shellBody: HTMLElement | null;
  shellWidth: number;
  leftWidth: number;
  rightMaxWidth: number;
  overlayThreshold: number;
}

interface RightPanelProps {
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

function ActiveToolPanel({ activeTool, idBase, ...props }: { activeTool: ToolId; idBase: string } & RightPanelViewProps) {
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
}

export function RightPanel(panelProps: RightPanelProps) {
  const { t, collapsed, standardEditorRef, onOpenFileAtLine, onDiffMount, onSendSelection } = panelProps;
  const {
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onJumpPatchHunk
  } = panelProps;

  const actions = useAppActions();
  const appInfo = useAppStore((s) => s.appInfo);
  const openTabs = useAppStore(useShallow((s) => s.openTabs));
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedChangePreviewPath = useAppStore((s) => s.selectedChangePreviewPath);
  const changePreview = useAppStore(useShallow((s) => s.changePreview));
  const changePreviewLoading = useAppStore((s) => s.changePreviewLoading);
  const fileContent = useAppStore((s) => s.fileContent);
  const fileLastModifiedAt = useAppStore((s) => s.fileLastModifiedAt);
  const externalFileChange = useAppStore(useShallow((s) => s.externalFileChange));
  const outline = useAppStore(useShallow((s) => s.outline));
  const workspaceTree = useAppStore(useShallow((s) => s.workspaceTree));
  const repoMap = useAppStore(useShallow((s) => s.repoMap));
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore(useShallow((s) => s.searchResults));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
  const auditEntries = useAppStore(useShallow((s) => s.auditEntries));
  const gitSnapshot = useAppStore(useShallow((s) => s.gitSnapshot));
  const commandHistory = useAppStore(useShallow((s) => s.commandHistory));
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));
  const modelHealth = useAppStore(useShallow((s) => s.modelHealth));
  const latestCommandRun = useAppStore(useShallow((s) => s.latestCommandRun));

  const [localSearchQuery, setLocalSearchQuery] = React.useState(searchQuery);
  const [diffSideBySide, setDiffSideBySide] = React.useState(readDiffSideBySidePreference);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);
  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  const persistDiffLayout = useCallback((sideBySide: boolean) => {
    setDiffSideBySide(sideBySide);
    try {
      window.localStorage.setItem(DIFF_LAYOUT_STORAGE_KEY, sideBySide ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const filePatch = useMemo(() => {
    if (!activePatchSet) return undefined;
    return findPatchFileByPath(activePatchSet, selectedPatchFilePath ?? selectedFilePath);
  }, [activePatchSet, selectedFilePath, selectedPatchFilePath]);

  const selectedDiagnostics = useMemo(
    () => filterDiagnosticsForPath(latestPatchApplication?.validation?.diagnostics ?? [], selectedFilePath),
    [selectedFilePath, latestPatchApplication?.validation?.diagnostics]
  );

  const editorLanguage = useMemo(
    () => detectEditorLanguage(selectedFilePath, filePatch?.language),
    [filePatch?.language, selectedFilePath]
  );

  const mergedTabs = useMemo(() => {
    const seen = new Set<string>();
    return [...openTabs, ...(activePatchSet?.filePatches.map(mapPatchToEditorTab) ?? [])].filter(
      (tab) => {
        if (seen.has(tab.path)) return false;
        seen.add(tab.path);
        return true;
      }
    );
  }, [activePatchSet?.filePatches, openTabs]);

  const editorHint = undefined;

  const handleEditorMount = useCallback(
    (editor: EditorRef) => {
      standardEditorRef.current = editor;
    },
    [standardEditorRef]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const pathAtEdit = selectedFilePath;
      if (!pathAtEdit) return;
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) return;
        const baseline = useAppStore.getState().fileContent ?? "";
        const dirty = (value ?? "") !== baseline;
        actions.notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [actions.notifyEditorBufferDirty, selectedFilePath]
  );

  useEffect(() => () => window.clearTimeout(editorDirtyTimerRef.current), [selectedFilePath]);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  const handleApplyPatchSet = useCallback(() => {
    if (activePatchSet) void actions.applyPatchSet(activePatchSet.id);
  }, [activePatchSet, actions.applyPatchSet]);

  const handleRollbackPatchSet = useCallback(() => {
    if (activePatchSet) void actions.rollbackPatchSet(activePatchSet.id);
  }, [activePatchSet, actions.rollbackPatchSet]);

  const handleSetHunkDecision = useCallback(
    (hunkId: string, decision: "pending" | "accepted" | "rejected") => {
      if (activePatchSet) void actions.setHunkDecision(activePatchSet.id, hunkId, decision);
    },
    [activePatchSet, actions.setHunkDecision]
  );

  const handleChangeSetting = useCallback(
    (id: string, value: string | boolean | number) => {
      const patch = preferencePatchFromSettingChange(id, value);
      if (patch) {
        void actions.updatePreferences(patch);
      }
    },
    [actions.updatePreferences]
  );

  const viewProps: RightPanelViewProps = {
    t,
    appInfo,
    collapsed,
    editorTabs: mergedTabs,
    selectedFilePath,
    selectedChangePreviewPath,
    changePreview,
    changePreviewLoading,
    fileContent,
    fileLastModifiedAt,
    externalChangePath: externalFileChange?.path,
    editorLanguage,
    diffSideBySide,
    filePatch,
    diagnostics: selectedDiagnostics,
    editorHint,
    outline,
    workspaceTree,
    repoMap,
    searchQuery: localSearchQuery,
    searchResults,
    dirtyEditorPaths,
    standardEditorRef,
    auditEntries,
    settings,
    gitSnapshot,
    commandHistory,
    activePatchSet,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    modelHealth,
    latestCommandRun,
    onOpenFile: (path) => void actions.openFile(path),
    onOpenChangePreview: (path) => void actions.openChangePreview(path),
    onOpenFileAtLine,
    onReloadExternal: () => {
      if (selectedFilePath) void actions.openFile(selectedFilePath);
    },
    onCreateWorkspaceFile: actions.createWorkspaceFile,
    onCreateWorkspaceFolder: actions.createWorkspaceFolder,
    onEditorChange: handleEditorChange,
    onEditorMount: handleEditorMount,
    onDiffMount,
    onSearch: (query) => void actions.searchFiles(query),
    onSearchChange: setLocalSearchQuery,
    onRefreshWorkspaceTree: () => void actions.refreshWorkspaceTree(),
    onSendSelection,
    onSetDiffLayout: persistDiffLayout,
    onSetHunkDecision: handleSetHunkDecision,
    onApplyPatchSet: handleApplyPatchSet,
    onRollbackPatchSet: handleRollbackPatchSet,
    onAcceptAllHunks: () => void actions.acceptAllHunks(),
    onRejectAllHunks: () => void actions.rejectAllHunks(),
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onJumpPatchHunk,
    onRefreshModelHealth: () => void actions.refreshModelHealth(),
    onChangeSetting: handleChangeSetting
  };

  const panelIdBase = useId();
  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUiStore((state) => state.setRightPanelWidth);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const terminalTabs = useUiStore((state) => state.terminalTabs);
  const panelRef = useRef<HTMLElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastRestorableWidthRef = useRef(rightPanelWidth);
  const overlayAnchorWidthRef = useRef<number | undefined>(undefined);
  const rightPanelModeRef = useRef<RightPanelMode>("docked");
  const [rightPanelMode, setRightPanelMode] = React.useState<RightPanelMode>("docked");

  const syncOverlayClasses = useCallback(
    (mode: RightPanelMode, shellBody?: HTMLElement | null) => {
      const shell = shellBody ?? ((panelRef.current?.closest(".adl-shell__body") as HTMLElement | null) ?? null);
      const panel = panelRef.current;
      if (!shell || !panel) return;
      const overlayState = deriveRightPanelOverlayState(mode, collapsed);
      shell.classList.toggle("is-rightpanel-overlay-active", overlayState.overlayActive);
      shell.classList.toggle("is-rightpanel-overlay-expanded", overlayState.overlayExpanded);
      panel.classList.toggle("adl-rightpanel--overlay-active", overlayState.overlayActive);
      panel.classList.toggle("adl-rightpanel--overlay-expanded", overlayState.overlayExpanded);
    },
    [collapsed]
  );

  const readLayoutMetrics = useCallback((): RightPanelLayoutMetrics => {
    const shellBody = panelRef.current?.closest(".adl-shell__body") as HTMLElement | null;
    const root = document.documentElement;
    const shellWidth = shellBody?.getBoundingClientRect().width ?? window.innerWidth;
    const leftbar = shellBody?.querySelector(".adl-leftbar") as HTMLElement | null;
    const cssLeftWidth = parseFloat(getComputedStyle(root).getPropertyValue("--leftbar-width")) || 0;
    const leftWidth = leftCollapsed ? 0 : (leftbar?.getBoundingClientRect().width ?? cssLeftWidth);
    const overlayTriggerReserve =
      parseFloat(getComputedStyle(root).getPropertyValue("--center-width-min")) || 360;
    const rightMaxWidth = Math.max(RIGHT_PANEL_WIDTH_MIN, shellWidth - leftWidth);
    const overlayThreshold = Math.max(RIGHT_PANEL_WIDTH_MIN, rightMaxWidth - overlayTriggerReserve);
    return {
      shellBody,
      shellWidth,
      leftWidth,
      rightMaxWidth,
      overlayThreshold
    };
  }, []);

  const deriveRightPanelMode = useCallback((width: number, metrics: RightPanelLayoutMetrics): RightPanelMode => {
    if (width >= metrics.rightMaxWidth - 1) {
      return "overlay_full";
    }
    if (width >= metrics.overlayThreshold) {
      return "overlay_partial";
    }
    return "docked";
  }, []);

  const clampPanelWidthToShell = useCallback(
    (width: number) => {
      const { rightMaxWidth } = readLayoutMetrics();
      const maxWidth = Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(RIGHT_PANEL_WIDTH_MAX, rightMaxWidth));
      return Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(maxWidth, width));
    },
    [readLayoutMetrics]
  );

  const applyPanelGeometry = useCallback(
    (
      width: number,
      options?: { commitRestorable?: boolean; preserveFull?: boolean; updateState?: boolean }
    ) => {
      const metrics = readLayoutMetrics();
      const targetWidth = options?.preserveFull ? metrics.rightMaxWidth : width;
      const nextWidth = Math.max(
        RIGHT_PANEL_WIDTH_MIN,
        Math.min(Math.min(RIGHT_PANEL_WIDTH_MAX, metrics.rightMaxWidth), targetWidth)
      );
      const previousMode = rightPanelModeRef.current;
      const nextMode = deriveRightPanelMode(nextWidth, metrics);
      let nextAnchorWidth: number | undefined = overlayAnchorWidthRef.current;

      if (previousMode === "docked" && nextMode !== "docked") {
        nextAnchorWidth = metrics.overlayThreshold;
      } else if (nextMode === "docked") {
        nextAnchorWidth = undefined;
      } else if (nextAnchorWidth === undefined) {
        nextAnchorWidth = metrics.overlayThreshold;
      }

      const effectiveAnchorWidth =
        nextAnchorWidth === undefined
          ? undefined
          : Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(nextAnchorWidth, metrics.rightMaxWidth));

      if (metrics.shellBody) {
        const widthValue = `${nextWidth}px`;
        if (metrics.shellBody.style.getPropertyValue("--rightpanel-width") !== widthValue) {
          metrics.shellBody.style.setProperty("--rightpanel-width", widthValue);
        }

        if (effectiveAnchorWidth !== undefined) {
          const anchorValue = `${effectiveAnchorWidth}px`;
          if (metrics.shellBody.style.getPropertyValue("--rightpanel-overlay-anchor-width") !== anchorValue) {
            metrics.shellBody.style.setProperty("--rightpanel-overlay-anchor-width", anchorValue);
          }
        } else if (metrics.shellBody.style.getPropertyValue("--rightpanel-overlay-anchor-width")) {
          metrics.shellBody.style.removeProperty("--rightpanel-overlay-anchor-width");
        }
      }

      overlayAnchorWidthRef.current = effectiveAnchorWidth;
      rightPanelModeRef.current = nextMode;
      syncOverlayClasses(nextMode, metrics.shellBody);

      if (options?.updateState !== false) {
        setRightPanelMode((current) => (current === nextMode ? current : nextMode));
      }

      if (options?.commitRestorable && nextMode !== "overlay_full") {
        lastRestorableWidthRef.current = nextWidth;
      }

      return { nextWidth, nextMode, effectiveAnchorWidth };
    },
    [deriveRightPanelMode, readLayoutMetrics, syncOverlayClasses]
  );

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = rightPanelWidth;
      let latestWidth = startWidth;
      const body = document.body;
      const { shellBody } = readLayoutMetrics();
      draggingRef.current = true;
      body.classList.add("adl-is-resizing");
      shellBody?.classList.add("is-resizing");
      const applyPreviewWidth = (value: number) => {
        applyPanelGeometry(value, { updateState: false });
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        latestWidth = clampPanelWidthToShell(startWidth + delta);
        if (resizeFrameRef.current !== null) {
          return;
        }
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyPreviewWidth(latestWidth);
        });
      };

      const cleanup = (endEvent: PointerEvent) => {
        draggingRef.current = false;
        body.classList.remove("adl-is-resizing");
        shellBody?.classList.remove("is-resizing");
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        const { nextWidth } = applyPanelGeometry(latestWidth, { commitRestorable: true });
        setRightPanelWidth(nextWidth);
        target.releasePointerCapture(endEvent.pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", cleanup);
        target.removeEventListener("pointercancel", cleanup);
        target.removeEventListener("lostpointercapture", cleanup);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", cleanup);
      target.addEventListener("pointercancel", cleanup);
      target.addEventListener("lostpointercapture", cleanup);
    },
    [applyPanelGeometry, clampPanelWidthToShell, readLayoutMetrics, rightPanelWidth, setRightPanelWidth]
  );

  useEffect(() => {
    const syncWidthToLayout = () => {
      if (draggingRef.current) {
        return;
      }
      const { nextWidth, nextMode } = applyPanelGeometry(rightPanelWidth, {
        commitRestorable: rightPanelMode !== "overlay_full",
        preserveFull: rightPanelMode === "overlay_full"
      });
      if (nextWidth !== rightPanelWidth) {
        setRightPanelWidth(nextWidth);
      } else if (nextMode !== rightPanelMode) {
        setRightPanelMode(nextMode);
      }
    };

    const queueSyncWidthToLayout = () => {
      if (draggingRef.current || syncFrameRef.current !== null) {
        return;
      }
      syncFrameRef.current = window.requestAnimationFrame(() => {
        syncFrameRef.current = null;
        syncWidthToLayout();
      });
    };

    syncWidthToLayout();
    window.addEventListener("resize", queueSyncWidthToLayout);
    const shellBody = panelRef.current?.closest(".adl-shell__body") as HTMLElement | null;
    const leftbar = shellBody?.querySelector(".adl-leftbar") as HTMLElement | null;
    const leftbarResizeObserver =
      typeof ResizeObserver !== "undefined" && leftbar
        ? new ResizeObserver(() => {
            queueSyncWidthToLayout();
          })
        : undefined;

    leftbarResizeObserver?.observe(leftbar!);

    return () => {
      window.removeEventListener("resize", queueSyncWidthToLayout);
      if (syncFrameRef.current !== null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      leftbarResizeObserver?.disconnect();
    };
  }, [applyPanelGeometry, leftCollapsed, rightPanelMode, rightPanelWidth, setRightPanelWidth]);

  useEffect(() => {
    syncOverlayClasses(rightPanelMode);
    return () => {
      const shellBody = panelRef.current?.closest(".adl-shell__body") as HTMLElement | null;
      const panel = panelRef.current;
      if (!shellBody || !panel) return;
      shellBody.classList.remove("is-rightpanel-overlay-active");
      shellBody.classList.remove("is-rightpanel-overlay-expanded");
      panel.classList.remove("adl-rightpanel--overlay-active");
      panel.classList.remove("adl-rightpanel--overlay-expanded");
    };
  }, [rightPanelMode, syncOverlayClasses]);

  const badges: Record<string, number> = {
    files: dirtyEditorPaths.length,
    changes: countGitChanges(gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot),
    browser: browserTabs.length,
    terminal: terminalTabs.length,
    audit: auditEntries.length,
    models: 0,
    settings: 0
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
