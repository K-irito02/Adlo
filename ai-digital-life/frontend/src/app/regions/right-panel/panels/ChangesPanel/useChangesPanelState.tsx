import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  IconClipboardList,
  IconCopy,
  IconFiles,
  IconFolderOpen,
  IconPencil,
  IconTrash,
  IconUpload,
} from '../../../../icons';
import { useAppStore } from '../../../../stores/slicedStore';
import { joinPathSegments, normalizeWorkspaceRelativePath } from '../../../../utils/workspacePaths';
import type { ChangesPanelProps } from '../../types';
import type { WorkspaceTreeNode, ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { useTCopy } from '../../../../i18n/useTCopy';
import {
  buildChangeEntries,
  buildChangeTree,
  buildFlatChangeNodes,
  type ChangeFileState,
  type ChangeTreeNode,
} from '../../changesTree';
import {
  collectDirectoryPaths,
  type FileTreeContextMenuItem,
} from '../../../../features/file-tree';
import type { EditorRef, DiffEditorRef } from '../../../../stores/types';
import {
  buildOutlineFromContent,
  getDefaultExpandedOutlineIds,
} from '../../../../features/outline';
import { getPrimaryBadge } from '../../ChangesPanel/utils';
import { summarizePatchSet } from '../../../../features/patch-review';
import { categorizeFile } from '../../fileTypeRouter';
import { type EditorView } from '@codemirror/view';
import { getChunks, uncollapseUnchanged } from '@codemirror/merge';
import { useChangesPanelStore } from '../useChangesPanelStore';

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

  const findCollapsedSectionStart = useCallback(
    (view: EditorView, targetLine: number): number | null => {
      const margin = 3;
      const minSize = 4;
      const chunks = getChunks(view.state)?.chunks ?? [];
      let prevLine = 1;
      for (let i = 0; ; i++) {
        const chunk = i < chunks.length ? chunks[i] : null;
        const collapseFrom = i > 0 ? prevLine + margin : 1;
        const collapseTo = chunk
          ? Math.max(view.state.doc.lineAt(chunk.fromB).number - 1 - margin, collapseFrom)
          : view.state.doc.lines;
        const lineCount = collapseTo - collapseFrom + 1;
        if (lineCount >= minSize && collapseFrom <= targetLine && targetLine <= collapseTo) {
          return view.state.doc.line(collapseFrom).from;
        }
        if (!chunk) {
          break;
        }
        prevLine = view.state.doc.lineAt(Math.min(view.state.doc.length, chunk.toB)).number;
      }
      return null;
    },
    []
  );

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
    [getModifiedEditor, findCollapsedSectionStart, changePreview, previewEnabled]
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

  const getContextMenuItems = useCallback(
    (node: ChangeTreeNode): FileTreeContextMenuItem<ChangeTreeNode>[] => {
      if (node.kind !== 'file') {
        return [];
      }
      const isDeleted = node.patchSummary?.changeKind === 'deleted';
      const store = useAppStore.getState();
      const hasClipboard = store.clipboardOperation !== null;
      return [
        {
          id: 'open-in-files',
          label: t.fileContextOpenWith as string,
          icon: <IconFiles size={14} />,
          disabled: isDeleted,
          action: (targetNode) => onOpenFile(targetNode.path),
        },
        { id: 'sep0', separator: true },
        {
          id: 'reveal',
          label: t.fileContextReveal as string,
          icon: <IconFolderOpen size={14} />,
          disabled: isDeleted,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const appInfo = store.appInfo;
            const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
            if (!rootPath) {
              return;
            }
            const fullPath = joinPathSegments(rootPath, targetNode.path);
            await window.digitalLife.workspace.revealInFileManager(fullPath);
          },
        },
        { id: 'sep1', separator: true },
        {
          id: 'copy-full-path',
          label: t.fileContextCopyFullPath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const appInfo = store.appInfo;
            const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
            if (!rootPath) {
              return;
            }
            const fullPath = joinPathSegments(rootPath, targetNode.path);
            await copyToClipboard(fullPath);
          },
        },
        {
          id: 'copy-relative-path',
          label: t.fileContextCopyRelativePath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            await copyToClipboard(targetNode.path);
          },
        },
        { id: 'sep2', separator: true },
        {
          id: 'cut',
          label: t.fileContextCut as string,
          icon: <IconClipboardList size={14} />,
          action: (targetNode) => {
            store.setClipboard('cut', targetNode.path, targetNode.kind);
          },
        },
        {
          id: 'copy-op',
          label: t.fileContextCopy as string,
          icon: <IconCopy size={14} />,
          action: (targetNode) => {
            store.setClipboard('copy', targetNode.path, targetNode.kind);
          },
        },
        {
          id: 'paste',
          label: t.fileContextPaste as string,
          icon: <IconUpload size={14} />,
          disabled: !hasClipboard,
          action: async (targetNode) => {
            const sourcePath = store.clipboardSourcePath;
            const operation = store.clipboardOperation;
            if (!sourcePath || !operation) {
              return;
            }
            const targetDir =
              targetNode.kind === 'directory'
                ? targetNode.path
                : targetNode.path.substring(0, targetNode.path.lastIndexOf('/') + 1);
            const sourceName = sourcePath.split('/').pop() || sourcePath;
            const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
            if (operation === 'copy') {
              await store.duplicateWorkspaceFile(sourcePath, newPath);
            } else if (operation === 'cut') {
              if (sourcePath === newPath) {
                store.clearClipboard();
                return;
              }
              await store.moveWorkspaceFile(sourcePath, newPath);
            }
            store.clearClipboard();
          },
        },
        { id: 'sep3', separator: true },
        {
          id: 'rename',
          label: t.fileContextRename as string,
          icon: <IconPencil size={14} />,
          disabled: isDeleted,
          action: (targetNode) => {
            changesContextMenuPersistRef.current = true;
            setChangesRenamingPath(targetNode.path);
            setChangesRenameDialogOpen(true);
          },
        },
        {
          id: 'delete',
          label: t.fileContextDelete as string,
          icon: <IconTrash size={14} />,
          danger: true,
          disabled: isDeleted,
          action: (targetNode) => {
            changesContextMenuPersistRef.current = true;
            setChangesDeleteConfirmPath(targetNode.path);
          },
        },
      ];
    },
    [onOpenFile, t, copyToClipboard]
  );

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
