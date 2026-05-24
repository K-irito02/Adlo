import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DIFF_LAYOUT_STORAGE_KEY } from "../../../constants";
import { useUiStore, type ToolId } from "../../../ui-store";
import { countGitChanges, type RightPanelViewProps } from "../types";
import { useAppStore } from "../../../stores/slicedStore";
import { useAppActions } from "../../../hooks/useAppActions";
import { buildSettingsItems } from "../../../settingsViewModel";
import { preferencePatchFromSettingChange } from "../../../settingsViewModel";
import { mapPatchToEditorTab } from "../../../editorTabs";
import { findPatchFileByPath } from "../../../features/patch-review";
import { filterDiagnosticsForPath, detectEditorLanguage } from "../../../workspacePaths";
import type { EditorRef } from "../../../types";
import type { RightPanelProps } from "../../RightPanel";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useRightPanelViewProps(panelProps: RightPanelProps, collapsed: boolean) {
  const { t, standardEditorRef, onOpenFileAtLine, onDiffMount, onSendSelection } = panelProps;
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
  const selectedFileWorkspaceId = useAppStore((s) => s.selectedFileWorkspaceId);
  const selectedChangePreviewPath = useAppStore((s) => s.selectedChangePreviewPath);
  const selectedChangePreviewWorkspaceId = useAppStore((s) => s.selectedChangePreviewWorkspaceId);
  const changePreview = useAppStore(useShallow((s) => s.changePreview));
  const changePreviewLoading = useAppStore((s) => s.changePreviewLoading);
  const fileContent = useAppStore((s) => s.fileContent);
  const fileLastModifiedAt = useAppStore((s) => s.fileLastModifiedAt);
  const externalFileChange = useAppStore(useShallow((s) => s.externalFileChange));
  const outline = useAppStore(useShallow((s) => s.outline));
  const workspaceTrees = useAppStore(useShallow((s) => s.workspaceTrees));
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const workspaceTreeExpandedInFileNav = useAppStore(useShallow((s) => s.workspaceTreeExpandedInFileNav));
  const workspaceTreeLoading = useAppStore(useShallow((s) => s.workspaceTreeLoading));
  const workspaceTreeErrors = useAppStore(useShallow((s) => s.workspaceTreeErrors));
  const repoMap = useAppStore(useShallow((s) => s.repoMap));
  const gitSnapshots = useAppStore(useShallow((s) => s.gitSnapshots));
  const workspaceChangesExpanded = useAppStore(useShallow((s) => s.workspaceChangesExpanded));
  const activePatchSets = useAppStore(useShallow((s) => s.activePatchSets));
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

  const activeTool = useUiStore((state) => state.activeTool);
  const setActiveTool = useUiStore((state) => state.setActiveTool);
  const browserTabs = useUiStore((state) => state.browserTabs);
  const terminalTabs = useUiStore((state) => state.terminalTabs);

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [diffSideBySide, setDiffSideBySide] = useState(readDiffSideBySidePreference);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);
  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  const allExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter(w => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available);
    return visible.length > 0 && visible.every(w => workspaceTreeExpandedInFileNav[w.id]);
  }, [recentWorkspaces, workspaceTreeExpandedInFileNav]);

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
    selectedFileWorkspaceId,
    selectedChangePreviewPath,
    selectedChangePreviewWorkspaceId,
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
    workspaceTrees,
    workspaceTree: [],
    recentWorkspaces,
    allExpanded,
    workspaceTreeExpandedInFileNav,
    workspaceTreeLoading,
    workspaceTreeErrors,
    repoMap,
    searchQuery: localSearchQuery,
    searchResults,
    dirtyEditorPaths,
    standardEditorRef,
    auditEntries,
    settings,
    gitSnapshot,
    gitSnapshots,
    commandHistory,
    activePatchSet,
    activePatchSets,
    workspaceChangesExpanded,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    modelHealth,
    latestCommandRun,
    onOpenFile: (path) => void actions.openFile(path),
    onOpenFileForWorkspace: (workspaceId, workspacePath, path) => void actions.openFileForWorkspace(workspaceId, workspacePath, path),
    onOpenChangePreview: (path) => void actions.openChangePreview(path),
    onOpenChangePreviewForWorkspace: (workspacePath, path) => void actions.openChangePreviewForWorkspace(workspacePath, path),
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
    onExpandAll: () => void actions.expandAllWorkspaceTreesInFileNav(),
    onCollapseAll: () => void actions.collapseAllWorkspaceTreesInFileNav(),
    onRefreshAll: () => void actions.refreshAllWorkspaceTrees(),
    onRefreshOneWorkspace: (workspaceId) => {
      const ws = recentWorkspaces.find(r => r.id === workspaceId);
      if (ws) void actions.loadWorkspaceTree(workspaceId, ws.path);
    },
    onToggleExpandInFileNav: (workspaceId) => {
      const ws = recentWorkspaces.find(r => r.id === workspaceId);
      if (ws) void actions.expandWorkspaceTreeInFileNav(workspaceId, ws.path);
    },
    onHideFromRightPanels: (workspaceId) => void actions.hideWorkspaceFromRightPanels(workspaceId),
    onShowInRightPanels: (workspaceId) => void actions.showWorkspaceInRightPanels(workspaceId),
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

  const badges: Record<string, number> = {
    files: dirtyEditorPaths.length,
    changes: countGitChanges(gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot),
    browser: browserTabs.length,
    terminal: terminalTabs.length,
    audit: auditEntries.length,
    models: 0,
    settings: 0
  };

  return {
    viewProps,
    activeTool,
    setActiveTool,
    badges
  };
}