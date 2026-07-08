import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { ChangesPanelProps } from '@regions/right-panel/types';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { useTCopy } from '@app/i18n/useTCopy';
import {
  buildChangeEntries,
  buildChangeTree,
  type ChangeTreeNode,
} from '@regions/right-panel/changesTree';
import { collectDirectoryPaths } from '@features/file-tree';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { buildOutlineFromContent, getDefaultExpandedOutlineIds } from '@features/outline';
import { getPrimaryBadge } from '@regions/right-panel/ChangesPanel/utils';
import { summarizePatchSet } from '@features/patch-review';
import { useChangesPanelStore } from '../useChangesPanelStore';
import { useFileContextMenuItems } from '@regions/right-panel/hooks/useFileContextMenuItems';
import {
  isNodeDeleted,
  computeChangesMenuItems,
  computeVisibleWorkspaces,
  computeChangesTreeData,
  computeChangeCounts,
  computeTotalChangesStats,
  computeExpandedPathsByWs,
  computeDirtyPathsSet,
  computeHasExpandedDirectories,
  revealOutlineLine,
  selectNavigatorNode,
  toggleAllDirectories,
  toggleAllOutlineItems,
  toggleWorkspaceExpand,
  refreshOneWorkspace,
  refreshAllChanges,
} from './useChangesPanelStateUtils';
import { useChangesPanelFilters } from './useChangesPanelFilters';
import { useChangesPanelSort } from './useChangesPanelSort';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import { useChangesPanelDialogs } from './useChangesPanelDialogs';
import { joinPathSegments } from '@app/utils/workspacePaths';
import type { ChangesMenuItem } from '../ChangesTopToolbar';

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
    expandedPaths,
    toggleNavigator,
    changesNavigatorWidth,
    setPreviewEnabled,
    toggleChangesTreePath,
    setChangesTreePathExpanded,
    expandChangesTreePathChain,
    collapseAllChangesTreePaths,
    workspaceChangesTreeLoading,
    workspaceChangesTreeErrors,
    onPinWorkspace,
    onUnpinWorkspace,
  } = useChangesPanelStore();
  const showGitVisualization = useAppStore((s) => s.showGitVisualization);
  const setShowGitVisualization = useAppStore((s) => s.setShowGitVisualization);
  const snapshot = props.gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot;
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const editorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const changesPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds]
  );
  const changeEntries = useMemo(
    () => buildChangeEntries(snapshot, patchSummaries),
    [patchSummaries, snapshot]
  );
  const { changesStatusFilter, filteredChangeEntries, onStatusFilterClick } =
    useChangesPanelFilters(changeEntries);
  const treeNodes = useMemo(() => buildChangeTree(filteredChangeEntries), [filteredChangeEntries]);
  const directoryPaths = useMemo(() => collectDirectoryPaths(treeNodes), [treeNodes]);
  const hasExpandedDirectories = useMemo(
    () => computeHasExpandedDirectories(directoryPaths, expandedPaths),
    [directoryPaths, expandedPaths]
  );
  const navigatorSelectedPath = selectedPatchFilePath ?? selectedChangePreviewPath;
  const changeOutline = useMemo(
    () =>
      changePreview
        ? buildOutlineFromContent(changePreview.currentContent, changePreview.path)
        : [],
    [changePreview]
  );
  const defaultExpandedOutlineIds = useMemo(
    () => getDefaultExpandedOutlineIds(changeOutline),
    [changeOutline]
  );
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(
    () => defaultExpandedOutlineIds
  );
  useEffect(() => {
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);
  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, []);

  const navigatorRelativePath = selectedPatchFilePath ?? selectedChangePreviewPath;

  const navigatorAbsolutePath = useMemo(() => {
    if (!navigatorRelativePath) {
      return undefined;
    }
    const wsPath =
      props.appInfo?.currentWorkspace?.rootPath ?? props.appInfo?.currentWorkspace?.path;
    if (!wsPath) {
      return undefined;
    }
    return joinPathSegments(wsPath, navigatorRelativePath);
  }, [navigatorRelativePath, props.appInfo]);

  const baseMenuItems = useMemo(
    () =>
      computeChangesMenuItems(
        t,
        lineNumbersEnabled,
        wordWrapEnabled,
        () => setLineNumbersEnabled((v) => !v),
        () => setWordWrapEnabled((v) => !v)
      ),
    [t, lineNumbersEnabled, wordWrapEnabled]
  );

  const changesMenuItems = useMemo(() => {
    if (!navigatorRelativePath) {
      return baseMenuItems;
    }
    const copyItems: ChangesMenuItem[] = [
      {
        id: 'copy-relative',
        label: t.fileCopyRelativePath,
        disabled: false,
        action: () => void copyToClipboard(navigatorRelativePath),
      },
      {
        id: 'copy-full',
        label: t.fileCopyFullPath,
        disabled: !navigatorAbsolutePath,
        action: () =>
          navigatorAbsolutePath ? void copyToClipboard(navigatorAbsolutePath) : undefined,
      },
      { id: 'sep-path', separator: true },
    ];
    return [...copyItems, ...baseMenuItems];
  }, [baseMenuItems, t, navigatorRelativePath, navigatorAbsolutePath, copyToClipboard]);

  useEffect(() => {
    if (!navigatorSelectedPath) {
      return;
    }
    expandChangesTreePathChain(navigatorSelectedPath);
  }, [expandChangesTreePathChain, navigatorSelectedPath]);

  const handleDiffMount = useCallback((editor: DiffEditorRef | EditorRef) => {
    editorRef.current = editor;
  }, []);

  const getModifiedEditor = useCallback((): EditorRef | null => {
    const ref = editorRef.current;
    if (!ref) {
      return null;
    }
    if ('getModifiedEditor' in ref) {
      return (ref as DiffEditorRef).getModifiedEditor();
    }
    return ref as EditorRef;
  }, []);

  const handleRevealOutlineLine = useCallback(
    (line: number) => {
      revealOutlineLine(
        line,
        changePreview,
        previewEnabled,
        editorRef,
        changesPreviewContainerRef,
        getModifiedEditor
      );
    },
    [getModifiedEditor, changePreview, previewEnabled]
  );

  const handleToggleAllDirectories = useCallback(() => {
    toggleAllDirectories(
      directoryPaths,
      hasExpandedDirectories,
      collapseAllChangesTreePaths,
      setChangesTreePathExpanded
    );
  }, [
    directoryPaths,
    hasExpandedDirectories,
    collapseAllChangesTreePaths,
    setChangesTreePathExpanded,
  ]);

  const handleToggleAllOutlineItems = useCallback(() => {
    toggleAllOutlineItems(
      hasExpandableOutlineItems,
      hasExpandedOutlineItems,
      defaultExpandedOutlineIds,
      setExpandedOutlineIds
    );
  }, [hasExpandableOutlineItems, hasExpandedOutlineItems, defaultExpandedOutlineIds]);

  const onSelectNavigatorNode = useCallback(
    (workspacePath: string, relativePath: string) => {
      const s = useAppStore.getState();
      selectNavigatorNode(
        workspacePath,
        relativePath,
        collapsedPatchHunkIds,
        onSelectPatchFile,
        s.activePatchSets,
        s.activePatchSet,
        s.openChangePreviewForWorkspace
      );
    },
    [collapsedPatchHunkIds, onSelectPatchFile]
  );

  const {
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    setChangesRenamingPath,
    setChangesRenameDialogOpen,
    setChangesDeleteConfirmPath,
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
    includeOpenInFiles: true,
    onOpenFile,
    isNodeDeleted,
    showMenuForDirectories: false,
    showClipboard: false,
    showGitActions: true,
  });

  const renderNavigatorMeta = useCallback((node: WorkspaceTreeNode) => {
    const cn = node as ChangeTreeNode;
    return (
      <span className="adl-filetree__count-badge">
        {cn.kind === 'directory'
          ? cn.fileCount
          : cn.totalHunks > 0
            ? `${cn.reviewedHunks}/${cn.totalHunks}`
            : '1'}
      </span>
    );
  }, []);

  const renderNavigatorCount = useCallback((node: WorkspaceTreeNode) => {
    const cn = node as ChangeTreeNode;
    const badge = getPrimaryBadge(cn);
    return badge ? (
      <span className={`adl-filetree__status-badge adl-filetree__status-badge--${badge.tone}`}>
        {badge.label}
      </span>
    ) : null;
  }, []);

  const activeWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;

  const visibleWorkspaces = useMemo(
    () => computeVisibleWorkspaces(recentWorkspaces),
    [recentWorkspaces]
  );
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
    handleToggleAllOutlineItems
  );
  const changesTreeData = useMemo(
    () =>
      computeChangesTreeData(
        workspaceChangesExpanded,
        gitSnapshots,
        activePatchSets,
        collapsedPatchHunkIds,
        changesNavigatorMode,
        changesStatusFilter
      ),
    [
      workspaceChangesExpanded,
      gitSnapshots,
      activePatchSets,
      collapsedPatchHunkIds,
      changesNavigatorMode,
      changesStatusFilter,
    ]
  );
  const changeCounts = useMemo(
    () => computeChangeCounts(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots]
  );
  const totalChangeCount = useMemo(
    () => Object.values(changeCounts).reduce((s, c) => s + c, 0),
    [changeCounts]
  );
  const totalChangesStats = useMemo(
    () => computeTotalChangesStats(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots]
  );
  const expandedPathsByWs = useMemo(
    () => computeExpandedPathsByWs(workspaceChangesExpanded, expandedPaths),
    [workspaceChangesExpanded, expandedPaths]
  );
  const dirtyPathsSet = useMemo(
    () => computeDirtyPathsSet(props.dirtyEditorPaths),
    [props.dirtyEditorPaths]
  );

  const onToggleExpand = useCallback(
    (workspaceId: string) => {
      toggleWorkspaceExpand(workspaceId, recentWorkspaces, (id, p) =>
        useAppStore.getState().expandWorkspaceChangesInFileNav(id, p)
      );
    },
    [recentWorkspaces]
  );

  const onRefreshOne = useCallback(
    (workspaceId: string) => {
      refreshOneWorkspace(workspaceId, recentWorkspaces, (id, p) =>
        useAppStore.getState().refreshGitSnapshot(id, p)
      );
    },
    [recentWorkspaces]
  );

  const handleToggleFileTreePath = useCallback(
    (_wsId: string, path: string) => {
      toggleChangesTreePath(path);
    },
    [toggleChangesTreePath]
  );

  const handleReorderWorkspaces = useCallback((input: ReorderWorkspacesInput) => {
    useAppStore.getState().reorderWorkspaces(input);
  }, []);

  const onRefreshAll = useCallback(() => {
    refreshAllChanges(visibleWorkspaces, (id, p) =>
      useAppStore.getState().refreshGitSnapshot(id, p)
    );
  }, [visibleWorkspaces]);

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
    expandedPaths,
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
    onPinWorkspace,
    onUnpinWorkspace,
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
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
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
    expandedPathsByWs,
    dirtyPathsSet,
    handleToggleExpand: onToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleRefreshOneWorkspace: onRefreshOne,
    handleToggleFileTreePath,
    handleReorderWorkspaces,
    handleRefreshAllChanges: onRefreshAll,
  };
}
