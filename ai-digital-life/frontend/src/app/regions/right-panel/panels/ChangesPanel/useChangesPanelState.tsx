import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { normalizeWorkspaceRelativePath } from '@app/utils/workspacePaths';
import type { ChangesPanelProps } from '../../types';
import type { WorkspaceTreeNode, ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { useTCopy } from '@app/i18n/useTCopy';
import {
  buildChangeEntries,
  buildChangeTree,
  buildFlatChangeNodes,
  type ChangeFileState,
  type ChangeTreeNode,
} from '../../changesTree';
import { collectDirectoryPaths } from '@features/file-tree';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { buildOutlineFromContent, getDefaultExpandedOutlineIds } from '@features/outline';
import { getPrimaryBadge } from '../../ChangesPanel/utils';
import { summarizePatchSet } from '@features/patch-review';
import { categorizeFile } from '../../fileTypeRouter';
import { type EditorView } from '@codemirror/view';
import { uncollapseUnchanged } from '@codemirror/merge';
import { useChangesPanelStore } from '../useChangesPanelStore';
import { useFileContextMenuItems } from '../../hooks/useFileContextMenuItems';
import { findCollapsedSectionStart, isNodeDeleted } from './useChangesPanelStateUtils';

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
  } = useChangesPanelStore();
  const snapshot = props.gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot;
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const editorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const changesPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const [changesStatusFilter, setChangesStatusFilter] = useState<Set<ChangeFileState>>(
    () => new Set()
  );
  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds]
  );
  const changeEntries = useMemo(
    () => buildChangeEntries(snapshot, patchSummaries),
    [patchSummaries, snapshot]
  );
  const filteredChangeEntries = useMemo(() => {
    if (changesStatusFilter.size === 0 || changesStatusFilter.size === 3) {
      return changeEntries;
    }
    return changeEntries.filter((entry) =>
      entry.states.some((state) => changesStatusFilter.has(state))
    );
  }, [changeEntries, changesStatusFilter]);
  const treeNodes = useMemo(() => buildChangeTree(filteredChangeEntries), [filteredChangeEntries]);
  const directoryPaths = useMemo(() => collectDirectoryPaths(treeNodes), [treeNodes]);
  const hasExpandedDirectories = useMemo(
    () => directoryPaths.some((pathValue) => expandedPaths[pathValue]),
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

  const changesMenuItems = useMemo(
    () => [
      {
        id: 'line-numbers',
        label: t.fileLineNumbers,
        checked: lineNumbersEnabled,
        action: () => setLineNumbersEnabled((value) => !value),
      },
      {
        id: 'word-wrap',
        label: t.fileWordWrap,
        checked: wordWrapEnabled,
        action: () => setWordWrapEnabled((value) => !value),
      },
      { id: 'sep-display', separator: true },
      { id: 'stage-all', label: t.changesStageAll, disabled: true },
      { id: 'unstage-all', label: t.changesUnstageAll, disabled: true },
      { id: 'commit', label: t.changesCommit, disabled: true },
      { id: 'push', label: t.changesPush, disabled: true },
      { id: 'pull', label: t.changesPull, disabled: true },
      { id: 'sep-1', separator: true },
      { id: 'discard-all', label: t.changesDiscardAll, disabled: true },
    ],
    [t, lineNumbersEnabled, wordWrapEnabled]
  );

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
      if (changePreview && categorizeFile(changePreview.path) === 'markdown' && previewEnabled) {
        const container = changesPreviewContainerRef.current;
        if (container) {
          const heading = container.querySelector(
            `[data-source-line="${line}"]`
          ) as HTMLElement | null;
          if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }
      const editor = getModifiedEditor();
      if (editor) {
        const view = editor.getView?.() as EditorView | undefined;
        if (view) {
          const collapseFrom = findCollapsedSectionStart(view, line);
          if (collapseFrom !== null) {
            view.dispatch({ effects: uncollapseUnchanged.of(collapseFrom) });
          }
        }
        const diffRef = editorRef.current;
        if (diffRef && 'getOriginalEditor' in diffRef) {
          const originalEditor = (diffRef as DiffEditorRef).getOriginalEditor();
          const originalView = originalEditor?.getView?.() as EditorView | undefined;
          if (originalView) {
            const originalCollapseFrom = findCollapsedSectionStart(originalView, line);
            if (originalCollapseFrom !== null) {
              originalView.dispatch({ effects: uncollapseUnchanged.of(originalCollapseFrom) });
            }
          }
        }
        editor.revealLineInCenter?.(line);
        editor.setPosition?.({ lineNumber: line, column: 1 });
        editor.focus?.();
      }
    },
    [getModifiedEditor, changePreview, previewEnabled]
  );

  const handleToggleAllDirectories = () => {
    if (!directoryPaths.length) {
      return;
    }
    if (hasExpandedDirectories) {
      collapseAllChangesTreePaths();
      return;
    }
    directoryPaths.forEach((pathValue) => setChangesTreePathExpanded(pathValue, true));
  };
  const handleToggleAllOutlineItems = () => {
    if (!hasExpandableOutlineItems) {
      return;
    }
    setExpandedOutlineIds(hasExpandedOutlineItems ? new Set() : new Set(defaultExpandedOutlineIds));
  };
  const handleToggleNavigatorStructure = () => {
    if (changesNavigatorMode === 'tree' || changesNavigatorMode === 'list') {
      if (allChangesExpanded) {
        handleCollapseAll();
      } else {
        handleExpandAll();
      }
      return;
    }
    if (changesNavigatorMode === 'outline') {
      handleToggleAllOutlineItems();
      return;
    }
  };

  const handleStatusFilterClick = useCallback((filter: ChangeFileState) => {
    setChangesStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  const handleSelectNavigatorNode = useCallback(
    (workspacePath: string, relativePath: string) => {
      const s = useAppStore.getState();
      const patchSet = s.activePatchSets[workspacePath] ?? s.activePatchSet;
      const summaries = patchSet ? summarizePatchSet(patchSet, collapsedPatchHunkIds) : [];
      const patchSummary = summaries.find((summary) => summary.relativePath === relativePath);
      if (patchSummary) {
        onSelectPatchFile(relativePath, {
          line: patchSummary.hunks[0]?.targetLine,
          hunkId: patchSummary.hunks[0]?.id,
        });
        return;
      }
      s.openChangePreviewForWorkspace(workspacePath, relativePath);
    },
    [collapsedPatchHunkIds, onSelectPatchFile]
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, []);

  const [changesRenameDialogOpen, setChangesRenameDialogOpen] = useState(false);
  const [changesRenamingPath, setChangesRenamingPath] = useState<string | null>(null);
  const [changesDeleteConfirmPath, setChangesDeleteConfirmPath] = useState<string | null>(null);
  const changesContextMenuPersistRef = useRef(false);
  const changesClearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const handleChangesRenameConfirm = useCallback(
    async (newName: string) => {
      if (!changesRenamingPath) {
        return;
      }
      const path = changesRenamingPath;
      setChangesRenamingPath(null);
      setChangesRenameDialogOpen(false);
      changesClearMenuHighlightRef.current?.();
      await useAppStore.getState().renameWorkspaceFile(path, newName);
    },
    [changesRenamingPath]
  );

  const handleChangesRenameCancel = useCallback(() => {
    setChangesRenamingPath(null);
    setChangesRenameDialogOpen(false);
    changesClearMenuHighlightRef.current?.();
  }, []);

  const handleChangesDeleteConfirm = useCallback(async () => {
    if (!changesDeleteConfirmPath) {
      return;
    }
    const path = changesDeleteConfirmPath;
    setChangesDeleteConfirmPath(null);
    changesClearMenuHighlightRef.current?.();
    await useAppStore.getState().deleteWorkspaceFile(path);
  }, [changesDeleteConfirmPath]);

  const handleChangesDeleteCancel = useCallback(() => {
    setChangesDeleteConfirmPath(null);
    changesClearMenuHighlightRef.current?.();
  }, []);

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
  });

  const renderNavigatorMeta = useCallback((node: WorkspaceTreeNode) => {
    const changeNode = node as ChangeTreeNode;
    return (
      <span className="adl-filetree__count-badge">
        {changeNode.kind === 'directory'
          ? changeNode.fileCount
          : changeNode.totalHunks > 0
            ? `${changeNode.reviewedHunks}/${changeNode.totalHunks}`
            : '1'}
      </span>
    );
  }, []);

  const renderNavigatorCount = useCallback((node: WorkspaceTreeNode) => {
    const changeNode = node as ChangeTreeNode;
    const primaryBadge = getPrimaryBadge(changeNode);
    return primaryBadge ? (
      <span
        className={`adl-filetree__status-badge adl-filetree__status-badge--${primaryBadge.tone}`}
      >
        {primaryBadge.label}
      </span>
    ) : null;
  }, []);

  const activeWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const allChangesExpanded =
    visibleWorkspaces.length > 0 && visibleWorkspaces.every((w) => workspaceChangesExpanded[w.id]);

  const canToggleNavigatorStructure =
    changesNavigatorMode === 'tree'
      ? visibleWorkspaces.length > 0
      : changesNavigatorMode === 'list'
        ? visibleWorkspaces.length > 0
        : changesNavigatorMode === 'outline'
          ? hasExpandableOutlineItems
          : false;
  const structureToggleExpanded =
    changesNavigatorMode === 'tree'
      ? allChangesExpanded
      : changesNavigatorMode === 'list'
        ? allChangesExpanded
        : changesNavigatorMode === 'outline'
          ? hasExpandedOutlineItems
          : false;

  const changesNavigatorTitle =
    changesNavigatorMode === 'outline'
      ? t.outline
      : changesNavigatorMode === 'list'
        ? t.changesListView
        : t.changesFileTree;

  const changesTreeData = useMemo(() => {
    const result: Record<string, ChangeTreeNode[]> = {};
    for (const wsId of Object.keys(workspaceChangesExpanded)) {
      if (workspaceChangesExpanded[wsId]) {
        const snapshot = gitSnapshots[wsId];
        const patchSet = activePatchSets[wsId];
        const patchSummaries = patchSet ? summarizePatchSet(patchSet, collapsedPatchHunkIds) : [];
        const entries = snapshot ? buildChangeEntries(snapshot, patchSummaries) : [];
        const filtered =
          changesStatusFilter.size > 0 && changesStatusFilter.size < 3
            ? entries.filter((entry) =>
                entry.states.some((state) => changesStatusFilter.has(state))
              )
            : entries;
        if (changesNavigatorMode === 'tree') {
          result[wsId] = buildChangeTree(filtered);
        } else {
          result[wsId] = buildFlatChangeNodes(filtered);
        }
      }
    }
    return result;
  }, [
    workspaceChangesExpanded,
    gitSnapshots,
    activePatchSets,
    collapsedPatchHunkIds,
    changesNavigatorMode,
    changesStatusFilter,
  ]);

  const changeCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const ws of visibleWorkspaces) {
      const snapshot = gitSnapshots[ws.id];
      if (snapshot) {
        result[ws.id] =
          snapshot.staged.length +
          snapshot.unstaged.length +
          snapshot.untracked.length +
          snapshot.conflicts.length;
      } else {
        result[ws.id] = 0;
      }
    }
    return result;
  }, [visibleWorkspaces, gitSnapshots]);

  const totalChangeCount = useMemo(() => {
    return Object.values(changeCounts).reduce((sum, count) => sum + count, 0);
  }, [changeCounts]);

  const totalChangesStats = useMemo(() => {
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;
    for (const ws of visibleWorkspaces) {
      const snapshot = gitSnapshots[ws.id];
      if (snapshot) {
        staged += snapshot.staged.length;
        unstaged += snapshot.unstaged.length;
        untracked += snapshot.untracked.length;
      }
    }
    return { staged, unstaged, untracked };
  }, [visibleWorkspaces, gitSnapshots]);

  const expandedPathsByWs = useMemo(() => {
    const result: Record<string, Record<string, boolean>> = {};
    for (const wsId of Object.keys(workspaceChangesExpanded)) {
      result[wsId] = expandedPaths;
    }
    return result;
  }, [workspaceChangesExpanded, expandedPaths]);

  const dirtyPathsSet: Set<string> = useMemo(
    () => new Set(props.dirtyEditorPaths.map((p) => normalizeWorkspaceRelativePath(p))),
    [props.dirtyEditorPaths]
  );

  const handleToggleExpand = useCallback((workspaceId: string) => {
    const state = useAppStore.getState();
    const ws = state.recentWorkspaces.find((w) => w.id === workspaceId);
    if (ws) {
      state.expandWorkspaceChangesInFileNav(workspaceId, ws.path);
    }
  }, []);

  const handleExpandAll = useCallback(() => {
    useAppStore.getState().expandAllWorkspaceChanges();
  }, []);

  const handleCollapseAll = useCallback(() => {
    useAppStore.getState().collapseAllWorkspaceChanges();
  }, []);

  const handleRefreshOneWorkspace = useCallback((workspaceId: string) => {
    const state = useAppStore.getState();
    const ws = state.recentWorkspaces.find((w) => w.id === workspaceId);
    if (ws) {
      state.refreshGitSnapshot(workspaceId, ws.path);
    }
  }, []);

  const handleToggleFileTreePath = useCallback(
    (workspaceId: string, path: string) => {
      toggleChangesTreePath(path);
    },
    [toggleChangesTreePath]
  );

  const handleReorderWorkspaces = useCallback((input: ReorderWorkspacesInput) => {
    useAppStore.getState().reorderWorkspaces(input);
  }, []);

  const handleRefreshAllChanges = useCallback(() => {
    visibleWorkspaces.forEach((ws) => {
      useAppStore.getState().refreshGitSnapshot(ws.id, ws.path);
    });
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
    handleStatusFilterClick,
    handleSelectNavigatorNode,
    changesRenameDialogOpen,
    changesRenamingPath,
    changesDeleteConfirmPath,
    changesContextMenuPersistRef,
    changesClearMenuHighlightRef,
    handleChangesRenameConfirm,
    handleChangesRenameCancel,
    handleChangesDeleteConfirm,
    handleChangesDeleteCancel,
    getContextMenuItems,
    renderNavigatorMeta,
    renderNavigatorCount,
    activeWorkspaceId,
    visibleWorkspaces,
    allChangesExpanded,
    canToggleNavigatorStructure,
    structureToggleExpanded,
    changesNavigatorTitle,
    changesTreeData,
    changeCounts,
    totalChangeCount,
    totalChangesStats,
    expandedPathsByWs,
    dirtyPathsSet,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleRefreshOneWorkspace,
    handleToggleFileTreePath,
    handleReorderWorkspaces,
    handleRefreshAllChanges,
  };
}
