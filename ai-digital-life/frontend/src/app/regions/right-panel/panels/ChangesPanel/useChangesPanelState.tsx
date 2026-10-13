import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { ChangesPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@app/i18n/useTCopy';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { useChangesPanelStore } from '../useChangesPanelStore';
import { useFileContextMenuItems } from '@regions/right-panel/hooks/useFileContextMenuItems';
import { isNodeDeleted } from './useChangesPanelStateUtils';
import { useChangesPanelSort } from './useChangesPanelSort';
import { useChangesPanelDialogs } from './useChangesPanelDialogs';
import { useChangesFilters } from './useChangesFilters';
import { useChangesActions } from './useChangesActions';
import { useChangesPanelMenuItems } from './useChangesPanelMenuItems';
import { useChangesPanelRenderers } from './useChangesPanelRenderers';

export function useChangesPanelState(props: ChangesPanelProps) {
  const { t, formatT } = useTCopy();
  const {
    appInfo,
    activePatchSet,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedChangePreviewPath,
    selectedChangePreviewWorkspaceId,
    changePreview,
    changePreviewLoading,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    onSetHunkDecision,
    onApplyPatchSet,
    onRollbackPatchSet,
    onAcceptAllHunks,
    onRejectAllHunks,
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onOpenFile,
    recentWorkspaces,
    workspaceChangesExpanded,
    gitSnapshots,
    activePatchSets,
    onHideFromRightPanels,
  } = props;
  const {
    navigatorCollapsed,
    previewEnabled,
    expandedChangesTreePaths,
    toggleNavigator,
    changesNavigatorWidth,
    setPreviewEnabled,
    toggleChangesTreePath,
    setChangesTreePathExpanded,
    expandChangesTreePathChain,
    collapseAllChangesTreePaths,
    workspaceChangesTreeLoading,
    workspaceChangesTreeErrors,
  } = useChangesPanelStore();
  const showGitVisualization = useAppStore((s) => s.showGitVisualization);
  const setShowGitVisualization = useAppStore((s) => s.setShowGitVisualization);
  const changesTreeRefreshing = useAppStore((s) => s.changesTreeRefreshing);
  const refreshingAllChanges = useAppStore((s) => s.refreshingAllChanges);
  const changesTreeClickedPath = useAppStore((s) => s.changesTreeClickedPath);
  const changesTreeClickedWorkspaceId = useAppStore((s) => s.changesTreeClickedWorkspaceId);
  const snapshot = props.gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot;
  // diff 显示开关上提 store（`adl:changes.lineNumbers` / `adl:changes.wordWrap`，Task 23）
  const lineNumbersEnabled = useAppStore((s) => s.changesLineNumbers);
  const wordWrapEnabled = useAppStore((s) => s.changesWordWrap);
  const setLineNumbersEnabled = useAppStore((s) => s.setChangesLineNumbers);
  const setWordWrapEnabled = useAppStore((s) => s.setChangesWordWrap);
  const editorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const changesPreviewContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    patchSummaries,
    changeEntries,
    filteredChangeEntries,
    changesStatusFilter,
    onStatusFilterClick,
    treeNodes,
    directoryPaths,
    hasExpandedDirectories,
    navigatorSelectedPath,
    changeOutline,
    defaultExpandedOutlineIds,
    expandedOutlineIds,
    setExpandedOutlineIds,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    navigatorRelativePath,
    navigatorAbsolutePath,
    activeWorkspaceId,
    visibleWorkspaces,
    changesTreeData,
    changeCounts,
    totalChangeCount,
    totalChangesStats,
    dirtyPathsSet,
  } = useChangesFilters({
    activePatchSet,
    collapsedPatchHunkIds,
    snapshot,
    changePreview,
    selectedPatchFilePath,
    selectedChangePreviewPath,
    appInfo,
    recentWorkspaces,
    workspaceChangesExpanded,
    gitSnapshots,
    activePatchSets,
    expandedChangesTreePaths,
    dirtyEditorPaths: props.dirtyEditorPaths,
  });

  const {
    copyToClipboard,
    handleDiffMount,
    handleRevealOutlineLine,
    handleToggleAllDirectories,
    handleToggleAllOutlineItems,
    onSelectNavigatorNode,
    onToggleExpand,
    onRefreshOne,
    handleToggleFileTreePath,
    onRefreshAll,
  } = useChangesActions({
    editorRef,
    changesPreviewContainerRef,
    changePreview,
    previewEnabled,
    directoryPaths,
    hasExpandedDirectories,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    defaultExpandedOutlineIds,
    setExpandedOutlineIds,
    collapsedPatchHunkIds,
    onSelectPatchFile,
    recentWorkspaces,
    visibleWorkspaces,
    activeWorkspaceId,
    collapseAllChangesTreePaths,
    setChangesTreePathExpanded,
    toggleChangesTreePath,
  });

  const { changesMenuItems } = useChangesPanelMenuItems({
    t,
    lineNumbersEnabled,
    wordWrapEnabled,
    setLineNumbersEnabled,
    setWordWrapEnabled,
    navigatorRelativePath,
    navigatorAbsolutePath,
    copyToClipboard,
  });

  useEffect(() => {
    if (!navigatorSelectedPath) {
      return;
    }
    const workspaceId = selectedChangePreviewWorkspaceId ?? activeWorkspaceId;
    if (!workspaceId) {
      return;
    }
    expandChangesTreePathChain(workspaceId, navigatorSelectedPath);
  }, [
    expandChangesTreePathChain,
    navigatorSelectedPath,
    selectedChangePreviewWorkspaceId,
    activeWorkspaceId,
  ]);

  const {
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesDiscardConfirm,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    setChangesRenamingPath,
    setChangesRenameDialogOpen,
    setChangesRenamingWorkspacePath,
    setChangesDeleteConfirmPath,
    setChangesDeleteWorkspacePath,
    requestChangesDiscardConfirm,
    onChangesDiscardConfirm,
    onChangesDiscardCancel,
    onChangesRenameConfirm,
    onChangesRenameCancel,
    onChangesDeleteConfirm,
    onChangesDeleteCancel,
  } = useChangesPanelDialogs();

  const { getContextMenuItems } = useFileContextMenuItems({
    t,
    copyToClipboard,
    contextMenuPersistRef: changesContextMenuPersistRef,
    setRenamingPath: setChangesRenamingPath,
    setRenameDialogOpen: setChangesRenameDialogOpen,
    setDeleteConfirmPath: setChangesDeleteConfirmPath,
    onOpenFile,
    isNodeDeleted,
    // 事项2：变更树目录同样出右键菜单（与文件面板对齐）。
    showMenuForDirectories: true,
    // 事项2追加："在文件中打开（open-in-files）"不需要，右键菜单不再提供
    // （DiffEditorSection 的"在文件中打开"按钮保留）。文件面板本就没有该项。
    includeOpenInFiles: false,
    showClipboard: false,
    showGitActions: true,
  });

  const { renderNavigatorMeta, renderNavigatorCount } = useChangesPanelRenderers();

  const handleChangesNodeClicked = useCallback(
    (workspaceId: string, path: string, kind: 'directory' | 'file') => {
      useAppStore.getState().setChangesTreeClickedNode(workspaceId, path, kind);
    },
    [],
  );

  const handleChangesWorkspaceRootClick = useCallback((workspaceId: string) => {
    useAppStore.getState().setChangesTreeClickedWorkspaceRoot(workspaceId);
  }, []);

  const handleChangesClearSelection = useCallback(() => {
    useAppStore.getState().clearChangesTreeClickedNode();
  }, []);

  const {
    changesNavigatorMode,
    setChangesNavigatorMode,
    allChangesExpanded,
    canToggleNavigatorStructure,
    structureToggleExpanded,
    changesNavigatorTitle,
    handleToggleNavigatorStructure,
    handleExpandAll,
    handleCollapseAll,
  } = useChangesPanelSort(
    visibleWorkspaces,
    workspaceChangesExpanded,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    t,
    handleToggleAllOutlineItems,
  );

  return {
    t,
    formatT,
    appInfo,
    activePatchSet,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedChangePreviewPath,
    selectedChangePreviewWorkspaceId,
    changePreview,
    changePreviewLoading,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    onSetHunkDecision,
    onApplyPatchSet,
    onRollbackPatchSet,
    onAcceptAllHunks,
    onRejectAllHunks,
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onOpenFile,
    onHideFromRightPanels,
    navigatorCollapsed,
    changesNavigatorMode,
    previewEnabled,
    expandedChangesTreePaths,
    toggleNavigator,
    changesNavigatorWidth,
    setChangesNavigatorMode,
    setPreviewEnabled,
    toggleChangesTreePath,
    setChangesTreePathExpanded,
    expandChangesTreePathChain,
    collapseAllChangesTreePaths,
    workspaceChangesTreeLoading,
    workspaceChangesTreeErrors,
    changesTreeRefreshing,
    refreshingAllChanges,
    changesTreeClickedPath,
    changesTreeClickedWorkspaceId,
    handleChangesNodeClicked,
    handleChangesWorkspaceRootClick,
    handleChangesClearSelection,
    snapshot,
    lineNumbersEnabled,
    wordWrapEnabled,
    editorRef,
    changesPreviewContainerRef,
    changesStatusFilter,
    patchSummaries,
    changeEntries,
    filteredChangeEntries,
    treeNodes,
    directoryPaths,
    hasExpandedDirectories,
    navigatorSelectedPath,
    changeOutline,
    defaultExpandedOutlineIds,
    expandedOutlineIds,
    setExpandedOutlineIds,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    changesMenuItems,
    handleDiffMount,
    handleRevealOutlineLine,
    handleToggleAllDirectories,
    handleToggleAllOutlineItems,
    handleToggleNavigatorStructure,
    handleStatusFilterClick: onStatusFilterClick,
    handleSelectNavigatorNode: onSelectNavigatorNode,
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesDiscardConfirm,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    setChangesRenamingWorkspacePath,
    setChangesDeleteWorkspacePath,
    requestChangesDiscardConfirm,
    onChangesDiscardConfirm,
    onChangesDiscardCancel,
    handleChangesRenameConfirm: onChangesRenameConfirm,
    handleChangesRenameCancel: onChangesRenameCancel,
    handleChangesDeleteConfirm: onChangesDeleteConfirm,
    handleChangesDeleteCancel: onChangesDeleteCancel,
    getContextMenuItems,
    renderNavigatorMeta,
    renderNavigatorCount,
    activeWorkspaceId,
    visibleWorkspaces,
    allChangesExpanded,
    canToggleNavigatorStructure,
    structureToggleExpanded,
    showGitVisualization,
    onToggleGitVisualization: () => setShowGitVisualization(!showGitVisualization),
    changesNavigatorTitle,
    changesTreeData,
    changeCounts,
    totalChangeCount,
    totalChangesStats,
    dirtyPathsSet,
    handleToggleExpand: onToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleRefreshOneWorkspace: onRefreshOne,
    handleToggleFileTreePath,
    handleRefreshAllChanges: onRefreshAll,
  };
}
