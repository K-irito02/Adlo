import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconClipboardList,
  IconCopy,
  IconFiles,
  IconFolderOpen,
  IconPencil,
  IconTrash,
  IconUpload,
} from '../../../icons';
import { useAppStore } from '../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { StoreState } from '../../../stores/StoreState';
import { useUiStore } from '../../../stores/ui-store';
import {
  joinPathSegments,
  normalizeWorkspaceRelativePath,
  detectEditorLanguage,
} from '../../../utils/workspacePaths';
import type { ChangesPanelProps } from '../types';
import type { WorkspaceTreeNode, ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import {
  countReviewedHunks,
  filterPatchFileSummaries,
  summarizePatchFile,
  summarizePatchSet,
} from '../../../features/patch-review';
import { PatchReviewSummary, PatchFileCard } from '../../../features/patch-review';
import { DiffToolbar } from '../DiffToolbar';
import { StickyContext } from '../editor-support/stickyContextView';
import { useStickyContext, useEditorOptions } from '../hooks';
import {
  buildChangeEntries,
  buildChangeTree,
  buildFlatChangeNodes,
  type ChangeFileState,
  type ChangeTreeNode,
} from '../changesTree';
import {
  type PreviewDiffCollapsedRange,
  computePreviewDiffVisualRanges,
} from '../../../features/diff-viewer';
import { collectDirectoryPaths, type FileTreeContextMenuItem } from '../../../features/file-tree';
import { categorizeFile } from '../fileTypeRouter';
import { DiffViewer } from '../../../features/diff-viewer';
import { CodeEditor } from '../../../features/editor';
import { LazyMarkdownPreviewWrapper } from '../../../features/preview';
import type { EditorRef, DiffEditorRef } from '../../../stores/types';
import { estimateWrapColumn } from '../editor-support/cmWrapColumn';
import { navigateToLine } from '../editor-support/stickyContext';
import { buildOutlineFromContent, getDefaultExpandedOutlineIds } from '../../../features/outline';
import {
  readSelectedBranch,
  writeSelectedBranch,
  getPrimaryBadge,
  getEditorView,
} from '../ChangesPanel/utils';
import { ChangesEmptyState } from './ChangesEmptyState';
import { ChangesToolbar } from './ChangesToolbar';
import { ChangesConfirmDialogs } from './ChangesConfirmDialogs';
import { RenameDialog } from '../../../components/RenameDialog';
import { ChangesTreePanel } from './ChangesTreePanel';

const FALLBACK_BRANCHES = ['main', 'develop', 'release/0.1.0', 'feature/right-panel'];

export function ChangesPanel(props: ChangesPanelProps) {
  const {
    t,
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
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.changes);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const changesNavigatorWidth = useAppStore((state) => state.changesNavigatorWidth);
  const changesNavigatorMode = useUiStore((state) => state.changesNavigatorMode);
  const setChangesNavigatorMode = useUiStore((state) => state.setChangesNavigatorMode);
  const previewEnabled = useUiStore((state) => state.changesPreviewEnabled);
  const setPreviewEnabled = useUiStore((state) => state.setChangesPreviewEnabled);
  const expandedPaths = useUiStore((state) => state.expandedChangesTreePaths);
  const toggleChangesTreePath = useUiStore((state) => state.toggleChangesTreePath);
  const setChangesTreePathExpanded = useUiStore((state) => state.setChangesTreePathExpanded);
  const expandChangesTreePathChain = useUiStore((state) => state.expandChangesTreePathChain);
  const collapseAllChangesTreePaths = useUiStore((state) => state.collapseAllChangesTreePaths);
  const snapshot = props.gitSnapshot ?? appInfo?.currentWorkspace?.gitSnapshot;
  const workspaceChangesTreeLoading = useAppStore(
    useShallow((state: StoreState) => state.workspaceChangesTreeLoading)
  );
  const workspaceChangesTreeErrors = useAppStore(
    useShallow((state: StoreState) => state.workspaceChangesTreeErrors)
  );
  const pinWorkspace = useAppStore((s) => s.pinWorkspace);
  const unpinWorkspace = useAppStore((s) => s.unpinWorkspace);
  const onPinWorkspace = useCallback(
    (workspaceId: string) => void pinWorkspace(workspaceId),
    [pinWorkspace]
  );
  const onUnpinWorkspace = useCallback(
    (workspaceId: string) => void unpinWorkspace(workspaceId),
    [unpinWorkspace]
  );
  const fallbackBranch = snapshot?.branch ?? 'main';
  const [selectedBranch, setSelectedBranch] = useState(() => readSelectedBranch(fallbackBranch));
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const activeCardRef = useRef<Record<string, HTMLElement | null>>({});
  const changesPreviewEditorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const changesDiffViewerRef = useRef<HTMLDivElement | null>(null);
  const [editorReady, setEditorReady] = useState(0);
  const [_changePreviewWrapColumn, setChangePreviewWrapColumn] = useState<number | null>(null);
  const [forceExpandUnchangedDiff, setForceExpandUnchangedDiff] = useState(false);
  const [_collapsedUnchangedDiffRanges, setCollapsedUnchangedDiffRanges] = useState<
    PreviewDiffCollapsedRange[]
  >([]);
  const [pendingOutlineRevealLine, setPendingOutlineRevealLine] = useState<number | null>(null);
  const [changesStatusFilter, setChangesStatusFilter] = useState<Set<ChangeFileState>>(
    () => new Set()
  );
  const validation = latestPatchApplication?.validation;
  const reviewCounts = useMemo(() => countReviewedHunks(activePatchSet), [activePatchSet]);
  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds]
  );
  const filteredPatchSummaries = useMemo(
    () => filterPatchFileSummaries(patchSummaries, patchReviewFilter),
    [patchSummaries, patchReviewFilter]
  );
  const activeSummary =
    filteredPatchSummaries.find((summary) => summary.relativePath === selectedPatchFilePath) ??
    filteredPatchSummaries[0];
  const changeEntries = useMemo(
    () => buildChangeEntries(snapshot, patchSummaries),
    [patchSummaries, snapshot]
  );
  const filteredChangeEntries = useMemo(() => {
    if (changesStatusFilter.size === 0 || changesStatusFilter.size === 3) return changeEntries;
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
  const navigatorSelectedPath =
    activeSummary?.relativePath ?? selectedPatchFilePath ?? selectedChangePreviewPath;
  const changePreviewLanguage = useMemo(
    () => detectEditorLanguage(changePreview?.path),
    [changePreview?.path]
  );
  const changePreviewDiffRanges = useMemo(
    () =>
      changePreview
        ? computePreviewDiffVisualRanges(changePreview.baseContent, changePreview.currentContent)
        : [],
    [changePreview]
  );
  const collapseUnchangedDiff = !forceExpandUnchangedDiff;
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
  const changePreviewTheme =
    appInfo?.config.resolvedTheme === 'dark' ? ('dark' as const) : ('light' as const);
  const changePreviewLocale = appInfo?.config.language ?? 'zh-CN';
  const diffExtensions = useMemo(() => [], []);
  const branchOptions = useMemo(() => {
    const options = new Set<string>([fallbackBranch, ...FALLBACK_BRANCHES]);
    return [...options];
  }, [fallbackBranch]);
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
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch(fallbackBranch);
      writeSelectedBranch(fallbackBranch);
    }
  }, [branchOptions, fallbackBranch, selectedBranch]);

  useEffect(() => {
    if (!navigatorSelectedPath) {
      return;
    }
    expandChangesTreePathChain(navigatorSelectedPath);
  }, [expandChangesTreePathChain, navigatorSelectedPath]);

  useEffect(() => {
    setForceExpandUnchangedDiff(false);
    setCollapsedUnchangedDiffRanges([]);
    setPendingOutlineRevealLine(null);
  }, [changePreview?.path, selectedChangePreviewPath, selectedPatchFilePath]);

  useEffect(() => {
    if (!activeSummary?.relativePath) {
      return;
    }
    activeCardRef.current[activeSummary.relativePath]?.scrollIntoView({ block: 'nearest' });
  }, [activeSummary?.relativePath]);

  const handleDiffMount = useCallback((editor: DiffEditorRef | EditorRef) => {
    editorRef.current = editor;
    setEditorReady((v) => v + 1);
  }, []);

  const getModifiedEditor = useCallback((): EditorRef | null => {
    const ref = editorRef.current;
    if (!ref) return null;
    if ('getModifiedEditor' in ref) {
      return (ref as DiffEditorRef).getModifiedEditor();
    }
    return ref as EditorRef;
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateWrapColumn = () => {
      const view = getEditorView(getModifiedEditor());
      setChangePreviewWrapColumn(wordWrapEnabled && view ? estimateWrapColumn(view) : null);
    };
    const scheduleWrapColumnUpdate = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateWrapColumn();
      });
    };

    scheduleWrapColumnUpdate();
    const editor = getModifiedEditor();
    if (!editor) {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      return;
    }

    const layoutDisposable = editor.onDidLayoutChange?.(scheduleWrapColumnUpdate);
    window.addEventListener('resize', scheduleWrapColumnUpdate);
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      layoutDisposable?.dispose();
      window.removeEventListener('resize', scheduleWrapColumnUpdate);
    };
  }, [editorReady, getModifiedEditor, props.diffSideBySide, wordWrapEnabled]);

  const handleRevealPreviewLine = (line: number): boolean => {
    const target = changesPreviewEditorShellRef.current?.querySelector<HTMLElement>(
      `[data-source-line="${line}"]`
    );
    if (!target) {
      return false;
    }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return true;
  };

  const handleRevealOutlineLine = (line: number) => {
    if (
      previewEnabled &&
      changePreview &&
      categorizeFile(changePreview.path) === 'markdown' &&
      handleRevealPreviewLine(line)
    ) {
      return;
    }
    if (previewEnabled) {
      navigateToLine(getModifiedEditor(), line);
      return;
    }
    if (!forceExpandUnchangedDiff) {
      setPendingOutlineRevealLine(line);
      setForceExpandUnchangedDiff(true);
      return;
    }
    navigateToLine(getModifiedEditor(), line);
  };
  useEffect(() => {
    if (pendingOutlineRevealLine === null || previewEnabled || !forceExpandUnchangedDiff) {
      return;
    }
    navigateToLine(getModifiedEditor(), pendingOutlineRevealLine);
    setPendingOutlineRevealLine(null);
  }, [
    editorReady,
    forceExpandUnchangedDiff,
    getModifiedEditor,
    pendingOutlineRevealLine,
    previewEnabled,
    props.diffSideBySide,
  ]);

  const changePreviewContent = changePreview?.currentContent ?? '';

  const stickyContextModel = useStickyContext({
    selectedFilePath: changePreview?.path,
    content: changePreviewContent,
    outline: changeOutline,
    getStickySourceEditor: getModifiedEditor,
    wordWrapEnabled,
    diffSideBySide: props.diffSideBySide,
    editorSurfaceRef: changesPreviewEditorShellRef,
    stickyDiffRanges: changePreviewDiffRanges,
    t,
  });

  const changesEditorOptions = useEditorOptions();

  const activeFilePatchFromSet = useMemo(() => {
    if (!activePatchSet || !selectedPatchFilePath) return undefined;
    return activePatchSet.filePatches.find((p) => p.relativePath === selectedPatchFilePath);
  }, [activePatchSet, selectedPatchFilePath]);

  const activePatchFileSummary = useMemo(
    () =>
      activeFilePatchFromSet
        ? summarizePatchFile(activeFilePatchFromSet, collapsedPatchHunkIds)
        : undefined,
    [activeFilePatchFromSet, collapsedPatchHunkIds]
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
      if (!changesRenamingPath) return;
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
    if (!changesDeleteConfirmPath) return;
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
            if (!rootPath) return;
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
            if (!rootPath) return;
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
            if (!sourcePath || !operation) return;
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
    const primaryBadge = getPrimaryBadge(changeNode);
    return (
      <>
        {primaryBadge ? (
          <span
            className={`adl-filetree__status-badge adl-filetree__status-badge--${primaryBadge.tone}`}
          >
            {primaryBadge.label}
          </span>
        ) : null}
        <span className="adl-filetree__count-badge">
          {changeNode.kind === 'directory'
            ? changeNode.fileCount
            : changeNode.totalHunks > 0
              ? `${changeNode.reviewedHunks}/${changeNode.totalHunks}`
              : '1'}
        </span>
      </>
    );
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
        : '文件树';

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

  const dirtyPathsSet = useMemo(
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

  const handleSelectBranch = useCallback((branch: string) => {
    setSelectedBranch(branch);
    writeSelectedBranch(branch);
  }, []);

  const handleRefreshAllChanges = useCallback(() => {
    visibleWorkspaces.forEach((ws) => {
      useAppStore.getState().refreshGitSnapshot(ws.id, ws.path);
    });
  }, [visibleWorkspaces]);

  return (
    <div className="adl-tool-panel adl-tool-panel--changes">
      <ChangesToolbar
        placement="top"
        t={t}
        navigatorCollapsed={navigatorCollapsed}
        onToggleNavigator={() => toggleNavigator('changes')}
        branchOptions={branchOptions}
        selectedBranch={selectedBranch}
        onSelectBranch={handleSelectBranch}
        hasActivePatchSet={!!activePatchSet}
        diffSideBySide={props.diffSideBySide}
        onSetDiffLayout={props.onSetDiffLayout}
        hasChangePreview={!!changePreview}
        previewEnabled={previewEnabled}
        onTogglePreview={() => setPreviewEnabled(!previewEnabled)}
        changesMenuItems={changesMenuItems}
      />

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': `${changesNavigatorWidth}px` } as React.CSSProperties}
      >
        <ChangesTreePanel
          t={t}
          visibleWorkspaces={visibleWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceChangesExpanded={workspaceChangesExpanded}
          changeCounts={changeCounts}
          changesTreeData={changesTreeData}
          workspaceChangesTreeLoading={workspaceChangesTreeLoading}
          workspaceChangesTreeErrors={workspaceChangesTreeErrors}
          navigatorSelectedPath={navigatorSelectedPath}
          selectedChangePreviewWorkspaceId={selectedChangePreviewWorkspaceId}
          expandedPathsByWs={expandedPathsByWs}
          dirtyPathsSet={dirtyPathsSet}
          externalChangePath={props.externalChangePath}
          onToggleExpand={handleToggleExpand}
          onRefreshOne={handleRefreshOneWorkspace}
          onPinWorkspace={onPinWorkspace}
          onUnpinWorkspace={onUnpinWorkspace}
          onHideFromRightPanels={onHideFromRightPanels}
          onToggleFileTreePath={handleToggleFileTreePath}
          onOpenChangePreview={handleSelectNavigatorNode}
          onReorderWorkspaces={handleReorderWorkspaces}
          getContextMenuItems={getContextMenuItems}
          contextMenuPersistRef={changesContextMenuPersistRef}
          clearMenuHighlightRef={changesClearMenuHighlightRef}
          renderMeta={renderNavigatorMeta}
          onToggleAllDirectories={handleToggleAllDirectories}
          hasExpandedDirectories={hasExpandedDirectories}
          changesNavigatorMode={changesNavigatorMode}
          onChangeNavigatorMode={setChangesNavigatorMode}
          allChangesExpanded={allChangesExpanded}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          totalChangeCount={totalChangeCount}
          hasChangeEntries={totalChangeCount > 0}
          snapshot={snapshot}
          totalChangesStats={totalChangesStats}
          canToggleNavigatorStructure={canToggleNavigatorStructure}
          structureToggleExpanded={structureToggleExpanded}
          onToggleStructure={handleToggleNavigatorStructure}
          changesNavigatorTitle={changesNavigatorTitle}
          changeOutline={changeOutline}
          expandedOutlineIds={expandedOutlineIds}
          onExpandedOutlineIdsChange={setExpandedOutlineIds}
          handleRevealOutlineLine={handleRevealOutlineLine}
          changesStatusFilter={changesStatusFilter}
          onStatusFilterClick={handleStatusFilterClick}
          changeEntries={changeEntries}
          onRefreshAll={handleRefreshAllChanges}
          hasVisibleWorkspaces={visibleWorkspaces.length > 0}
        />

        <div className={`adl-tool-primary${activePatchSet ? ' adl-tool-primary--scrollable' : ''}`}>
          {activePatchSet ? (
            <div className="adl-tool-primary__scroll adl-tool-primary__scroll--changes">
              {validation ? (
                <div className="adl-banner adl-banner--info">
                  <strong>{validation.status}</strong>
                  <span>{validation.summary}</span>
                  {latestPatchApplication?.rolledBack ? (
                    <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span>
                  ) : null}
                  {latestPatchApplication?.patchSet.status === 'applied' ? (
                    <span className="adl-chip adl-chip--success">{t.changesApplied}</span>
                  ) : null}
                </div>
              ) : null}

              <>
                <PatchReviewSummary
                  activePatchSet={activePatchSet}
                  reviewCounts={reviewCounts}
                  patchReviewFilter={patchReviewFilter}
                  onSetPatchReviewFilter={onSetPatchReviewFilter}
                  onAcceptAllHunks={onAcceptAllHunks}
                  onRejectAllHunks={onRejectAllHunks}
                  t={t}
                />

                {filteredPatchSummaries.length > 0 ? (
                  <div className="adl-patch-review-files">
                    {filteredPatchSummaries.map((summary) => (
                      <PatchFileCard
                        key={summary.relativePath}
                        summary={summary}
                        activeSummary={activeSummary}
                        activeCardRef={activeCardRef}
                        selectedPatchHunkId={selectedPatchHunkId}
                        t={t}
                        onSelectPatchFile={onSelectPatchFile}
                        onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
                        onSelectPatchHunk={onSelectPatchHunk}
                        onSetHunkDecision={onSetHunkDecision}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="adl-empty-hint">{t.noPatch}</p>
                )}

                <div className="adl-patch-card__footer">
                  {activeFilePatchFromSet && activePatchFileSummary ? (
                    <div className="adl-tool-editor" ref={changesDiffViewerRef}>
                      <DiffToolbar
                        diffSideBySide={props.diffSideBySide}
                        lineNumbersEnabled={changesEditorOptions.lineNumbersEnabled}
                        wordWrapEnabled={changesEditorOptions.wordWrapEnabled}
                        agentAnnotationsEnabled={changesEditorOptions.agentAnnotationsEnabled}
                        hasCollapsedHunks={
                          !!activePatchFileSummary.hunks.some((h) => h.isCollapsed)
                        }
                        activePatchRelativePath={selectedPatchFilePath}
                        onSetDiffLayout={props.onSetDiffLayout}
                        onToggleLineNumbers={() =>
                          changesEditorOptions.setLineNumbersEnabled((v) => !v)
                        }
                        onToggleWordWrap={() => changesEditorOptions.setWordWrapEnabled((v) => !v)}
                        onToggleAgentAnnotations={() =>
                          changesEditorOptions.setAgentAnnotationsEnabled((v) => !v)
                        }
                        onJumpPatchHunk={props.onJumpPatchHunk}
                        onSetAllPatchHunksCollapsed={props.onSetAllPatchHunksCollapsed}
                        t={t}
                      />
                      <div className="adl-diff-hunk-strip" aria-label={t.patchReview as string}>
                        <div className="adl-diff-hunk-strip__header">
                          <div>
                            <strong>{activePatchFileSummary.relativePath}</strong>
                            <small>
                              {activePatchFileSummary.totalHunks}
                              {' · '}
                              {activePatchFileSummary.acceptedHunks +
                                activePatchFileSummary.rejectedHunks}
                              {'/'}
                              {activePatchFileSummary.totalHunks}
                            </small>
                          </div>
                        </div>
                        <div className="adl-diff-hunk-strip__list">
                          {activePatchFileSummary.hunks.map((hunk, index) => (
                            <div
                              key={hunk.id}
                              className={`adl-diff-hunk-pill adl-diff-hunk-pill--${hunk.changeKind}${selectedPatchHunkId === hunk.id ? ' is-active' : ''}`}
                            >
                              <button
                                type="button"
                                className="adl-diff-hunk-pill__main"
                                onClick={() =>
                                  onSelectPatchHunk(
                                    activeFilePatchFromSet.relativePath,
                                    hunk.id,
                                    hunk.targetLine,
                                    { activateTool: false }
                                  )
                                }
                              >
                                <span className="adl-diff-hunk-pill__index">{index + 1}</span>
                                <span className="adl-diff-hunk-pill__body">
                                  <strong>{hunk.preview}</strong>
                                  <small>
                                    {hunk.newStart || hunk.oldStart}
                                    {hunk.isCollapsed ? ` · ${t.expandDetails}` : ''}
                                  </small>
                                </span>
                                <span
                                  className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}
                                >
                                  {hunk.decision === 'accepted'
                                    ? t.approvalApproved
                                    : hunk.decision === 'rejected'
                                      ? t.approvalRejected
                                      : t.approvalPendingCount}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="adl-diff-hunk-pill__toggle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onTogglePatchHunkCollapse(hunk.id);
                                }}
                                aria-label={
                                  (hunk.isCollapsed ? t.expandDetails : t.collapseDetails) as string
                                }
                              >
                                {hunk.isCollapsed ? (
                                  <IconChevronRight size={12} decorative />
                                ) : (
                                  <IconChevronDown size={12} decorative />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="adl-tool-editor__surface">
                        <DiffViewer
                          original={activeFilePatchFromSet.beforeContent}
                          modified={activeFilePatchFromSet.afterContent}
                          language={changePreviewLanguage}
                          theme={changePreviewTheme}
                          locale={changePreviewLocale}
                          sideBySide={props.diffSideBySide}
                          collapseUnchanged={false}
                          fileKey={selectedPatchFilePath}
                          readOnly={changesEditorOptions.diffOptions.readOnly}
                          lineNumbers={changesEditorOptions.diffOptions.lineNumbers}
                          wordWrap={changesEditorOptions.diffOptions.wordWrap}
                          onMount={handleDiffMount}
                          extensions={diffExtensions}
                        />
                      </div>
                    </div>
                  ) : null}
                  <button
                    data-testid="patch-apply"
                    type="button"
                    className="adl-btn adl-btn--primary"
                    onClick={onApplyPatchSet}
                  >
                    {t.applyPatch}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost"
                    onClick={onRollbackPatchSet}
                  >
                    {t.rollbackPatch}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost"
                    onClick={() => onSetAllPatchHunksCollapsed(false, activeSummary?.relativePath)}
                  >
                    {t.fileExpandAll}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--ghost"
                    onClick={() => onSetAllPatchHunksCollapsed(true, activeSummary?.relativePath)}
                  >
                    {t.fileCollapseAll}
                  </button>
                </div>
              </>
            </div>
          ) : changePreview ? (
            <>
              {validation ? (
                <div className="adl-banner adl-banner--info">
                  <strong>{validation.status}</strong>
                  <span>{validation.summary}</span>
                  {latestPatchApplication?.rolledBack ? (
                    <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span>
                  ) : null}
                  {latestPatchApplication?.patchSet.status === 'applied' ? (
                    <span className="adl-chip adl-chip--success">{t.changesApplied}</span>
                  ) : null}
                </div>
              ) : null}
              <div
                ref={changesPreviewEditorShellRef}
                className="adl-tool-editor adl-tool-editor--changes"
                data-testid="changes-preview-shell"
              >
                {previewEnabled && categorizeFile(changePreview.path) === 'markdown' ? (
                  <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
                    <LazyMarkdownPreviewWrapper
                      content={changePreview.currentContent}
                      theme={changePreviewTheme}
                    />
                  </div>
                ) : previewEnabled ? (
                  <div className="adl-tool-editor__surface">
                    <CodeEditor
                      value={changePreview.currentContent}
                      language={changePreviewLanguage}
                      theme={changePreviewTheme}
                      locale={changePreviewLocale}
                      readOnly={true}
                      lineNumbers={lineNumbersEnabled}
                      wordWrap={wordWrapEnabled}
                      onMount={handleDiffMount}
                    />
                  </div>
                ) : (
                  <div className="adl-tool-editor__surface">
                    {stickyContextModel ? (
                      <StickyContext
                        data-testid="changes-sticky-context"
                        model={stickyContextModel}
                        t={t}
                      />
                    ) : null}
                    <DiffViewer
                      original={changePreview.baseContent}
                      modified={changePreview.currentContent}
                      language={changePreviewLanguage}
                      theme={changePreviewTheme}
                      locale={changePreviewLocale}
                      sideBySide={props.diffSideBySide}
                      collapseUnchanged={collapseUnchangedDiff}
                      readOnly={true}
                      lineNumbers={lineNumbersEnabled}
                      wordWrap={wordWrapEnabled}
                      onMount={handleDiffMount}
                      extensions={diffExtensions}
                      onCollapsedUnchangedRangesChange={setCollapsedUnchangedDiffRanges}
                    />
                  </div>
                )}
              </div>
            </>
          ) : changePreviewLoading ? null : totalChangeCount === 0 ? (
            <ChangesEmptyState hasWorkspaces={visibleWorkspaces.length > 0} />
          ) : null}
        </div>
      </div>
      <ChangesConfirmDialogs
        changesDeleteConfirmPath={changesDeleteConfirmPath}
        onDeleteConfirm={handleChangesDeleteConfirm}
        onDeleteCancel={handleChangesDeleteCancel}
        t={t}
      />
      {changesRenameDialogOpen && changesRenamingPath ? (
        <RenameDialog
          open={changesRenameDialogOpen}
          initialValue={changesRenamingPath.split('/').pop() || ''}
          title="重命名"
          itemInfo={`当前路径: ${changesRenamingPath}`}
          placeholder="输入新名称"
          onConfirm={handleChangesRenameConfirm}
          onCancel={handleChangesRenameCancel}
        />
      ) : null}
    </div>
  );
}
