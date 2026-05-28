import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../stores/slicedStore";
import { useAppActions } from "../../../hooks/useAppActions";
import { findPatchFileByPath } from "../../../features/patch-review";
import { filterDiagnosticsForPath, detectEditorLanguage } from "../../../workspacePaths";
import type { FilesPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";
import type { EditorRef } from "../../../types";

export function useFilesPanelProps(
  panelProps: RightPanelProps,
  diffSideBySide: boolean,
  onSetDiffLayout: (sideBySide: boolean) => void
): FilesPanelProps {
  const {
    t, standardEditorRef, onOpenFileAtLine, onDiffMount,
    selectedPatchFilePath, selectedPatchHunkId, collapsedPatchHunkIds,
    onSelectPatchFile, onSelectPatchHunk, onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed, onJumpPatchHunk
  } = panelProps;

  const actions = useAppActions();
  const appInfo = useAppStore((s) => s.appInfo);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileWorkspaceId = useAppStore((s) => s.selectedFileWorkspaceId);
  const fileContent = useAppStore((s) => s.fileContent);
  const externalFileChange = useAppStore(useShallow((s) => s.externalFileChange));
  const outline = useAppStore(useShallow((s) => s.outline));
  const workspaceTrees = useAppStore(useShallow((s) => s.workspaceTrees));
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const workspaceTreeExpandedInFileNav = useAppStore(useShallow((s) => s.workspaceTreeExpandedInFileNav));
  const workspaceTreeLoading = useAppStore(useShallow((s) => s.workspaceTreeLoading));
  const workspaceTreeErrors = useAppStore(useShallow((s) => s.workspaceTreeErrors));
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore(useShallow((s) => s.searchResults));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);

  const allExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter(w => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available);
    return visible.length > 0 && visible.every(w => workspaceTreeExpandedInFileNav[w.id]);
  }, [recentWorkspaces, workspaceTreeExpandedInFileNav]);

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

  const handleOpenFile = useCallback((path: string) => {
    void actions.openFile(path);
  }, [actions.openFile]);

  const handleOpenFileForWorkspace = useCallback((workspaceId: string, workspacePath: string, path: string) => {
    void actions.openFileForWorkspace(workspaceId, workspacePath, path);
  }, [actions.openFileForWorkspace]);

  const handleSearch = useCallback((query: string) => {
    void actions.searchFiles(query);
  }, [actions.searchFiles]);

  const handleRefreshWorkspaceTree = useCallback(() => {
    void actions.refreshWorkspaceTree();
  }, [actions.refreshWorkspaceTree]);

  const handleExpandAll = useCallback(() => {
    void actions.expandAllWorkspaceTreesInFileNav();
  }, [actions.expandAllWorkspaceTreesInFileNav]);

  const handleCollapseAll = useCallback(() => {
    void actions.collapseAllWorkspaceTreesInFileNav();
  }, [actions.collapseAllWorkspaceTreesInFileNav]);

  const handleRefreshAll = useCallback(() => {
    void actions.refreshAllWorkspaceTrees();
  }, [actions.refreshAllWorkspaceTrees]);

  const handleRefreshOneWorkspace = useCallback((workspaceId: string) => {
    const ws = recentWorkspaces.find(r => r.id === workspaceId);
    if (ws) void actions.loadWorkspaceTree(workspaceId, ws.path);
  }, [recentWorkspaces, actions.loadWorkspaceTree]);

  const handleToggleExpandInFileNav = useCallback((workspaceId: string) => {
    const ws = recentWorkspaces.find(r => r.id === workspaceId);
    if (ws) void actions.expandWorkspaceTreeInFileNav(workspaceId, ws.path);
  }, [recentWorkspaces, actions.expandWorkspaceTreeInFileNav]);

  const handleHideFromRightPanels = useCallback((workspaceId: string) => {
    void actions.hideWorkspaceFromRightPanels(workspaceId);
  }, [actions.hideWorkspaceFromRightPanels]);

  const handleCreateWorkspaceFile = useCallback((relativePath: string, content?: string): Promise<string | undefined> => {
    return actions.createWorkspaceFile(relativePath, content);
  }, [actions.createWorkspaceFile]);

  const handleCreateWorkspaceFolder = useCallback((relativePath: string): Promise<string | undefined> => {
    return actions.createWorkspaceFolder(relativePath);
  }, [actions.createWorkspaceFolder]);

  useEffect(() => () => window.clearTimeout(editorDirtyTimerRef.current), [selectedFilePath]);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  return useMemo(() => ({
    t,
    appInfo,
    selectedFilePath,
    selectedFileWorkspaceId,
    fileContent,
    filePatch,
    editorLanguage,
    diffSideBySide,
    diagnostics: selectedDiagnostics,
    editorHint,
    outline,
    workspaceTrees,
    recentWorkspaces,
    allExpanded,
    workspaceTreeExpandedInFileNav,
    workspaceTreeLoading,
    workspaceTreeErrors,
    searchQuery: localSearchQuery,
    searchResults,
    dirtyEditorPaths,
    externalChangePath: externalFileChange?.path,
    standardEditorRef,
    onOpenFile: handleOpenFile,
    onOpenFileForWorkspace: handleOpenFileForWorkspace,
    onOpenFileAtLine,
    onEditorChange: handleEditorChange,
    onEditorMount: handleEditorMount,
    onDiffMount,
    onSearch: handleSearch,
    onSearchChange: setLocalSearchQuery,
    onRefreshWorkspaceTree: handleRefreshWorkspaceTree,
    onExpandAll: handleExpandAll,
    onCollapseAll: handleCollapseAll,
    onRefreshAll: handleRefreshAll,
    onRefreshOneWorkspace: handleRefreshOneWorkspace,
    onToggleExpandInFileNav: handleToggleExpandInFileNav,
    onHideFromRightPanels: handleHideFromRightPanels,
    onCreateWorkspaceFile: handleCreateWorkspaceFile,
    onCreateWorkspaceFolder: handleCreateWorkspaceFolder,
    onSetDiffLayout,
    onJumpPatchHunk,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    activePatchSet,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
  }), [
    t, appInfo, selectedFilePath, selectedFileWorkspaceId, fileContent, filePatch, editorLanguage, diffSideBySide,
    selectedDiagnostics, outline, workspaceTrees, recentWorkspaces, allExpanded, workspaceTreeExpandedInFileNav,
    workspaceTreeLoading, workspaceTreeErrors, localSearchQuery, searchResults, dirtyEditorPaths,
    externalFileChange?.path, standardEditorRef, handleOpenFile, handleOpenFileForWorkspace, onOpenFileAtLine,
    handleEditorChange, handleEditorMount, onDiffMount, handleSearch, setLocalSearchQuery,
    handleRefreshWorkspaceTree, handleExpandAll, handleCollapseAll, handleRefreshAll, handleRefreshOneWorkspace,
    handleToggleExpandInFileNav, handleHideFromRightPanels, handleCreateWorkspaceFile,
    handleCreateWorkspaceFolder, onSetDiffLayout, onJumpPatchHunk, onSelectPatchHunk,
    onTogglePatchHunkCollapse, onSetAllPatchHunksCollapsed, activePatchSet, selectedPatchFilePath,
    selectedPatchHunkId, collapsedPatchHunkIds
  ]);
}
