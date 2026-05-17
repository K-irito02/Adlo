import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import {
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconFiles,
  IconFileText,
  IconFoldVertical,
  IconGitBranch,
  IconList,
  IconMoreVertical,
  IconPanelLeftClose,
  IconRefreshCw,
  IconTarget,
  IconUnfoldVertical,
  IconUpload
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useAppStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import { countGitChanges } from "./types";
import type { RightPanelViewProps } from "./types";
import { countReviewedHunks, filterPatchFileSummaries, summarizePatchSet } from "./patchReview";
import { StickyContext } from "./stickyContextView";
import { buildChangeEntries, buildChangeTree, buildFlatChangeNodes, type ChangeFileState, type ChangeTreeNode } from "./changesTree";
import {
  computePreviewDiffMinimapModel,
  type PreviewDiffCollapsedRange,
  computePreviewDiffVisualRanges,
} from "./changePreviewDiffRanges";
import { collectDirectoryPaths, FileTree, type FileTreeContextMenuItem } from "./fileTree";
import { detectEditorLanguage } from "../../workspacePaths";
import { categorizeFile } from "./fileTypeRouter";
import { DiffViewer } from "./DiffViewer";
import { CodeEditor } from "./CodeEditor";
import { LazyMarkdownPreviewWrapper } from "./LazyPreviews";
import type { EditorRef, DiffEditorRef } from "../../types";
import { CodeMirrorEditorRef } from "./editorAdapters";
import { estimateWrapColumn, getMinimapExtension } from "./cmMinimap";
import { getVisibleStartLine, navigateToLine, subscribeToEditor } from "./stickyContext";
import { buildStickyContextEntries, createStickyContextModel, type StickyContextModel } from "./stickyContext";
import { OutlineTree } from "./OutlineTree";
import { buildOutlineFromContent, getDefaultExpandedOutlineIds } from "./outlineModel";

const CHANGES_BRANCH_STORAGE_KEY = "adl-ui:changes-branch";
const FALLBACK_BRANCHES = ["main", "develop", "release/0.1.0", "feature/right-panel"];

function readSelectedBranch(initialBranch: string): string {
  try {
    return window.localStorage.getItem(CHANGES_BRANCH_STORAGE_KEY)?.trim() || initialBranch;
  } catch {
    return initialBranch;
  }
}

function writeSelectedBranch(branch: string) {
  try {
    window.localStorage.setItem(CHANGES_BRANCH_STORAGE_KEY, branch);
  } catch {}
}

function getChangeKindLabel(changeKind: "added" | "modified" | "deleted", t: RightPanelViewProps["t"]) {
  return changeKind === "added" ? t.gitAdded : changeKind === "deleted" ? t.gitDeleted : t.gitModified;
}

function getChangeStatusLabel(status: NonNullable<RightPanelViewProps["changePreview"]>["status"], t: RightPanelViewProps["t"]) {
  if (status === "staged") return t.changesStaged;
  if (status === "untracked") return t.changesUntracked;
  if (status === "conflicted") return t.changesConflicts;
  return t.changesModified;
}

function getPrimaryBadge(node: ChangeTreeNode): { label: string; tone: string } | undefined {
  if (node.patchSummary) {
    if (node.patchSummary.changeKind === "added") {
      return { label: "A", tone: "added" };
    }
    if (node.patchSummary.changeKind === "deleted") {
      return { label: "D", tone: "deleted" };
    }
    return { label: "M", tone: "modified" };
  }
  if (node.primaryState === "conflicted") {
    return { label: "C", tone: "conflicted" };
  }
  if (node.primaryState === "untracked") {
    return { label: "U", tone: "untracked" };
  }
  if (node.primaryState === "staged") {
    return { label: "S", tone: "staged" };
  }
  if (node.primaryState === "modified") {
    return { label: "M", tone: "modified" };
  }
  return undefined;
}

function getEditorView(editorRef: EditorRef | null): EditorView | null {
  if (!editorRef) return null;
  if (editorRef instanceof CodeMirrorEditorRef) {
    return editorRef.getView();
  }
  return null;
}

export function ChangesPanel(props: RightPanelViewProps) {
  const {
    t,
    appInfo,
    activePatchSet,
    latestPatchApplication,
    selectedPatchFilePath,
    selectedChangePreviewPath,
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
    onOpenChangePreview,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onOpenFile,
    onRefreshWorkspaceTree
  } = props;
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.changes);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const changesNavigatorWidth = useUiStore((state) => state.changesNavigatorWidth);
  const setChangesNavigatorWidth = useUiStore((state) => state.setChangesNavigatorWidth);
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
  const fallbackBranch = snapshot?.branch ?? "main";
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [changesMenuOpen, setChangesMenuOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(() => readSelectedBranch(fallbackBranch));
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const branchMenuRef = useRef<HTMLDivElement | null>(null);
  const changesMenuRef = useRef<HTMLDivElement | null>(null);
  const activeCardRef = useRef<Record<string, HTMLElement | null>>({});
  const changesPreviewEditorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const [editorReady, setEditorReady] = useState(0);
  const [changePreviewWrapColumn, setChangePreviewWrapColumn] = useState<number | null>(null);
  const [stickyContextModel, setStickyContextModel] = useState<StickyContextModel | null>(null);
  const [forceExpandUnchangedDiff, setForceExpandUnchangedDiff] = useState(false);
  const [collapsedUnchangedDiffRanges, setCollapsedUnchangedDiffRanges] = useState<PreviewDiffCollapsedRange[]>([]);
  const [pendingOutlineRevealLine, setPendingOutlineRevealLine] = useState<number | null>(null);
  const [changesStatusFilter, setChangesStatusFilter] = useState<Set<ChangeFileState>>(() => new Set());
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
  const activeSummary = filteredPatchSummaries.find((summary) => summary.relativePath === selectedPatchFilePath) ?? filteredPatchSummaries[0];
  const changeEntries = useMemo(() => buildChangeEntries(snapshot, patchSummaries), [patchSummaries, snapshot]);
  const filteredChangeEntries = useMemo(() => {
    if (changesStatusFilter.size === 0 || changesStatusFilter.size === 3) return changeEntries;
    return changeEntries.filter((entry) => entry.states.some((state) => changesStatusFilter.has(state)));
  }, [changeEntries, changesStatusFilter]);
  const treeNodes = useMemo(() => buildChangeTree(filteredChangeEntries), [filteredChangeEntries]);
  const flatNodes = useMemo(() => buildFlatChangeNodes(filteredChangeEntries), [filteredChangeEntries]);
  const directoryPaths = useMemo(() => collectDirectoryPaths(treeNodes), [treeNodes]);
  const hasExpandedDirectories = useMemo(
    () => directoryPaths.some((pathValue) => expandedPaths[pathValue]),
    [directoryPaths, expandedPaths]
  );
  const navigatorSelectedPath = activeSummary?.relativePath ?? selectedPatchFilePath ?? selectedChangePreviewPath;
  const changePreviewLanguage = useMemo(
    () => detectEditorLanguage(changePreview?.path),
    [changePreview?.path]
  );
  const changePreviewDiffRanges = useMemo(
    () => changePreview
      ? computePreviewDiffVisualRanges(changePreview.baseContent, changePreview.currentContent)
      : [],
    [changePreview]
  );
  const collapseUnchangedDiff = !forceExpandUnchangedDiff;
  const changePreviewMinimapModel = useMemo(
    () => changePreview
      ? computePreviewDiffMinimapModel(changePreview.baseContent, changePreview.currentContent, {
        wrapColumn: changePreviewWrapColumn,
        hiddenUnchangedRanges: collapseUnchangedDiff ? collapsedUnchangedDiffRanges : [],
      })
      : undefined,
    [changePreview, changePreviewWrapColumn, collapseUnchangedDiff, collapsedUnchangedDiffRanges]
  );
  const changeOutline = useMemo(
    () => changePreview ? buildOutlineFromContent(changePreview.currentContent, changePreview.path) : [],
    [changePreview]
  );
  const defaultExpandedOutlineIds = useMemo(() => getDefaultExpandedOutlineIds(changeOutline), [changeOutline]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(() => defaultExpandedOutlineIds);
  useEffect(() => {
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);

  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;
  const canToggleNavigatorStructure = changesNavigatorMode === "tree"
    ? directoryPaths.length > 0
    : changesNavigatorMode === "outline"
      ? hasExpandableOutlineItems
      : false;
  const structureToggleExpanded = changesNavigatorMode === "tree"
    ? hasExpandedDirectories
    : changesNavigatorMode === "outline"
      ? hasExpandedOutlineItems
      : false;
  const changePreviewTheme = appInfo?.config.resolvedTheme === "dark" ? "dark" as const : "light" as const;
  const changePreviewLocale = appInfo?.config.language ?? "zh-CN";
  const changePreviewEditorMinimapScopeId = useMemo(
    () => changePreview ? `changes:${changePreview.path}:preview` : "changes:unselected:preview",
    [changePreview]
  );
  const changePreviewDiffMinimapScopeId = useMemo(
    () => changePreview
      ? `changes:${changePreview.path}:diff:${props.diffSideBySide ? "side-by-side" : "inline"}`
      : `changes:unselected:diff:${props.diffSideBySide ? "side-by-side" : "inline"}`,
    [changePreview, props.diffSideBySide]
  );
  const diffExtensions = useMemo(() => [
  ], []);
  const previewEditorExtensions = useMemo(() => [
    ...getMinimapExtension({ scopeId: changePreviewEditorMinimapScopeId }),
  ], [changePreviewEditorMinimapScopeId]);
  const branchOptions = useMemo(() => {
    const options = new Set<string>([fallbackBranch, ...FALLBACK_BRANCHES]);
    return [...options];
  }, [fallbackBranch]);
  const changesMenuItems = [
    {
      id: "line-numbers",
      label: t.fileLineNumbers,
      checked: lineNumbersEnabled,
      action: () => setLineNumbersEnabled((value) => !value)
    },
    {
      id: "word-wrap",
      label: t.fileWordWrap,
      checked: wordWrapEnabled,
      action: () => setWordWrapEnabled((value) => !value)
    },
    { id: "sep-display", separator: true },
    { id: "stage-all", label: t.changesStageAll, disabled: true },
    { id: "unstage-all", label: t.changesUnstageAll, disabled: true },
    { id: "commit", label: t.changesCommit, disabled: true },
    { id: "push", label: t.changesPush, disabled: true },
    { id: "pull", label: t.changesPull, disabled: true },
    { id: "sep-1", separator: true },
    { id: "discard-all", label: t.changesDiscardAll, disabled: true }
  ];

  useEffect(() => {
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch(fallbackBranch);
      writeSelectedBranch(fallbackBranch);
    }
  }, [branchOptions, fallbackBranch, selectedBranch]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!branchMenuRef.current?.contains(target)) {
        setBranchMenuOpen(false);
      }
      if (!changesMenuRef.current?.contains(target)) {
        setChangesMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

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
    activeCardRef.current[activeSummary.relativePath]?.scrollIntoView({ block: "nearest" });
  }, [activeSummary?.relativePath]);

  const handleDiffMount = useCallback((editor: DiffEditorRef | EditorRef) => {
    editorRef.current = editor;
    setEditorReady((v) => v + 1);
  }, []);

  const getModifiedEditor = useCallback((): EditorRef | null => {
    const ref = editorRef.current;
    if (!ref) return null;
    if ("getModifiedEditor" in ref) {
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
    window.addEventListener("resize", scheduleWrapColumnUpdate);
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      layoutDisposable?.dispose();
      window.removeEventListener("resize", scheduleWrapColumnUpdate);
    };
  }, [editorReady, getModifiedEditor, props.diffSideBySide, wordWrapEnabled]);

  const handleRevealPreviewLine = (line: number): boolean => {
    const target = changesPreviewEditorShellRef.current?.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
    if (!target) {
      return false;
    }
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  };

  const handleRevealOutlineLine = (line: number) => {
    if (previewEnabled && changePreview && categorizeFile(changePreview.path) === "markdown" && handleRevealPreviewLine(line)) {
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
  }, [editorReady, forceExpandUnchangedDiff, getModifiedEditor, pendingOutlineRevealLine, previewEnabled, props.diffSideBySide]);

  const refreshStickyContext = useCallback(() => {
    if (!changePreview) {
      setStickyContextModel(null);
      return;
    }

    const editor = getModifiedEditor();
    const visibleStartLine = getVisibleStartLine(editor);
    const scrollTop = editor?.getScrollTop() ?? 0;
    const contextEntries = buildStickyContextEntries({
      content: changePreview.currentContent,
      outline: changeOutline,
      visibleStartLine,
      maxContextRows: 3,
      diffRanges: changePreviewDiffRanges
    });

    setStickyContextModel(createStickyContextModel({
      contextEntries,
      activeLine: visibleStartLine,
      canScrollToTop: scrollTop > 0,
      onNavigateLine: (line) => navigateToLine(getModifiedEditor(), line),
      topLabel: t.stickyContextTop
    }));
  }, [changeOutline, changePreview, changePreviewDiffRanges, getModifiedEditor, t.stickyContextTop]);

  useEffect(() => {
    if (!changePreview) {
      setStickyContextModel(null);
      return;
    }

    refreshStickyContext();
    const editor = getModifiedEditor();
    if (!editor) {
      return;
    }

    const disposable = subscribeToEditor(editor, refreshStickyContext);
    const shell = changesPreviewEditorShellRef.current;
    const observer =
      shell && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => refreshStickyContext())
        : null;
    if (observer && shell) {
      observer.observe(shell);
    }

    window.addEventListener("resize", refreshStickyContext);
    return () => {
      disposable.dispose();
      observer?.disconnect();
      window.removeEventListener("resize", refreshStickyContext);
    };
  }, [changePreview, editorReady, getModifiedEditor, props.diffSideBySide, refreshStickyContext, wordWrapEnabled]);

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setChangesNavigatorWidth,
    minWidth: 180,
    maxWidth: 300
  });

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
    if (changesNavigatorMode === "tree") {
      handleToggleAllDirectories();
      return;
    }
    if (changesNavigatorMode === "outline") {
      handleToggleAllOutlineItems();
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

  const handleSelectNavigatorNode = useCallback((relativePath: string) => {
    const patchSummary = patchSummaries.find((summary) => summary.relativePath === relativePath);
    if (patchSummary) {
      onSelectPatchFile(relativePath, {
        line: patchSummary.hunks[0]?.targetLine,
        hunkId: patchSummary.hunks[0]?.id
      });
      return;
    }
    onOpenChangePreview(relativePath);
  }, [onOpenChangePreview, onSelectPatchFile, patchSummaries]);

  const getContextMenuItems = useCallback(
    (node: ChangeTreeNode): FileTreeContextMenuItem<ChangeTreeNode>[] => {
      if (node.kind !== "file") {
        return [];
      }
      const isDeleted = node.patchSummary?.changeKind === "deleted";
      return [
        {
          id: "open-in-files",
          label: t.changesPreviewOpenInFiles,
          disabled: isDeleted,
          action: (targetNode) => onOpenFile(targetNode.path)
        }
      ];
    },
    [onOpenFile, t.changesPreviewOpenInFiles]
  );

  const renderNavigatorMeta = useCallback((node: ChangeTreeNode) => {
    const primaryBadge = getPrimaryBadge(node);
    return (
      <>
        {primaryBadge ? (
          <span className={`adl-filetree__status-badge adl-filetree__status-badge--${primaryBadge.tone}`}>
            {primaryBadge.label}
          </span>
        ) : null}
        <span className="adl-filetree__count-badge">
          {node.kind === "directory" ? node.fileCount : node.totalHunks > 0 ? `${node.reviewedHunks}/${node.totalHunks}` : "1"}
        </span>
      </>
    );
  }, []);

  return (
    <div className="adl-tool-panel adl-tool-panel--changes">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolChanges}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("changes")}
              aria-label={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>
          <div ref={branchMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.changesSummaryBranch} placement="top">
              <button
                type="button"
                className={`adl-branch-pill adl-branch-pill--button${branchMenuOpen ? " is-open" : ""}`}
                onClick={() => setBranchMenuOpen((value) => !value)}
                aria-label={t.changesSummaryBranch}
                aria-haspopup="menu"
                aria-expanded={branchMenuOpen}
              >
                <IconGitBranch size={12} decorative />
                <span>{selectedBranch}</span>
                <IconChevronDown size={12} decorative />
              </button>
            </TooltipSimple>
            {branchMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {branchOptions.map((branch) => (
                  <TooltipSimple key={branch} content={branch} placement="right">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={branch === selectedBranch}
                      className="adl-menu__item"
                      onClick={() => {
                        setSelectedBranch(branch);
                        writeSelectedBranch(branch);
                        setBranchMenuOpen(false);
                      }}
                    >
                      <span className="adl-menu__label adl-menu__label--branch">{branch}</span>
                    </button>
                  </TooltipSimple>
                ))}
              </div>
            ) : null}
          </div>
          {!activePatchSet ? (
            <TooltipSimple content={t.diffLayoutLabel} placement="top">
              <div className="adl-tool-context__diff-view" role="group" aria-label={t.diffLayoutLabel}>
                <button
                  type="button"
                  className={`adl-tool-context__toggle-btn${!props.diffSideBySide ? " is-active" : ""}`}
                  aria-pressed={!props.diffSideBySide ? "true" : "false"}
                  disabled={!changePreview}
                  onClick={() => props.onSetDiffLayout(false)}
                >
                  {t.diffLayoutInline}
                </button>
                <button
                  type="button"
                  className={`adl-tool-context__toggle-btn${props.diffSideBySide ? " is-active" : ""}`}
                  aria-pressed={props.diffSideBySide ? "true" : "false"}
                  disabled={!changePreview}
                  onClick={() => props.onSetDiffLayout(true)}
                >
                  {t.diffLayoutSideBySide}
                </button>
              </div>
            </TooltipSimple>
          ) : null}
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={previewEnabled ? t.filePreview : t.fileEdit} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn${previewEnabled ? " is-active" : ""}`}
              onClick={() => setPreviewEnabled(!previewEnabled)}
              aria-label={previewEnabled ? t.filePreview : t.fileEdit}
              aria-pressed={previewEnabled ? "true" : "false"}
              disabled={!changePreview}
            >
              <IconEye size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.changesPush} placement="top">
            <button type="button" className="adl-tool-context__iconbtn" disabled aria-label={t.changesPush}>
              <IconUpload size={14} decorative />
            </button>
          </TooltipSimple>
          <div ref={changesMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.changesMoreActions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${changesMenuOpen ? " is-open" : ""}`}
                onClick={() => setChangesMenuOpen((value) => !value)}
                aria-label={t.changesMoreActions}
                aria-haspopup="menu"
                aria-expanded={changesMenuOpen}
              >
                <IconMoreVertical size={14} decorative />
              </button>
            </TooltipSimple>
            {changesMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {changesMenuItems.map((item) =>
                  "separator" in item ? (
                    <div key={item.id} className="adl-menu__sep" role="separator" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                      aria-checked={item.checked === undefined ? undefined : item.checked ? "true" : "false"}
                      className="adl-menu__item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.action?.();
                        if (!item.action) {
                          setChangesMenuOpen(false);
                        }
                      }}
                    >
                      <span>{item.label}</span>
                      {item.checked ? <span className="adl-menu__check">√</span> : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${changesNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={t.toolChanges}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              {changesNavigatorMode === "tree" || changesNavigatorMode === "outline" ? (
                <TooltipSimple content={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll} placement="top">
                  <button
                    type="button"
                    className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                    onClick={handleToggleNavigatorStructure}
                    aria-label={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll}
                    disabled={!canToggleNavigatorStructure}
                  >
                    {structureToggleExpanded ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
                  </button>
                </TooltipSimple>
              ) : (
                <IconGitBranch size={14} decorative />
              )}
              <span className="adl-tool-navigator__context-title">
                {changesNavigatorMode === "outline" ? t.outline : t.toolChanges}
              </span>
            </div>
            <span className="adl-tool-navigator__meta">
              {changesNavigatorMode === "outline" ? changeOutline.length : filteredChangeEntries.length || countGitChanges(snapshot)}
            </span>
            <TooltipSimple content={t.changesRefresh} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => {
                  void onRefreshWorkspaceTree();
                  void useAppStore.getState().fetchGitStatus();
                }}
                aria-label={t.changesRefresh}
              >
                <IconRefreshCw size={14} decorative />
              </button>
            </TooltipSimple>
          </div>
          <div className="adl-tool-navigator__context adl-tool-navigator__context--tabs">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content={t.fileTreeView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === "tree" ? " is-active" : ""}`}
                  aria-pressed={changesNavigatorMode === "tree" ? "true" : "false"}
                  onClick={() => setChangesNavigatorMode("tree")}
                  aria-label={t.fileTreeView}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.changesListView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === "list" ? " is-active" : ""}`}
                  aria-pressed={changesNavigatorMode === "list" ? "true" : "false"}
                  onClick={() => setChangesNavigatorMode("list")}
                  aria-label={t.changesListView}
                >
                  <IconFileText size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.outline} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${changesNavigatorMode === "outline" ? " is-active" : ""}`}
                  aria-pressed={changesNavigatorMode === "outline" ? "true" : "false"}
                  onClick={() => setChangesNavigatorMode("outline")}
                  aria-label={t.outline}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
          {changeEntries.length > 0 && changesNavigatorMode !== "outline" ? (
            <div className="adl-tool-navigator__summary" aria-label={t.toolChanges}>
              <div className="adl-tool-navigator__summary-stats">
                <button
                  type="button"
                  className={`adl-tool-navigator__summary-stat${changesStatusFilter.has("staged") ? " is-active" : ""}`}
                  onClick={() => handleStatusFilterClick("staged")}
                  aria-pressed={changesStatusFilter.has("staged")}
                  aria-label={t.changesStaged}
                >
                  <span className="adl-tool-navigator__summary-label">{t.changesStaged}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">S:</span>
                    {snapshot?.staged.length ?? 0}
                  </strong>
                </button>
                <button
                  type="button"
                  className={`adl-tool-navigator__summary-stat${changesStatusFilter.has("modified") ? " is-active" : ""}`}
                  onClick={() => handleStatusFilterClick("modified")}
                  aria-pressed={changesStatusFilter.has("modified")}
                  aria-label={t.changesModified}
                >
                  <span className="adl-tool-navigator__summary-label">{t.changesModified}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">M:</span>
                    {snapshot?.unstaged.length ?? 0}
                  </strong>
                </button>
                <button
                  type="button"
                  className={`adl-tool-navigator__summary-stat${changesStatusFilter.has("untracked") ? " is-active" : ""}`}
                  onClick={() => handleStatusFilterClick("untracked")}
                  aria-pressed={changesStatusFilter.has("untracked")}
                  aria-label={t.changesUntracked}
                >
                  <span className="adl-tool-navigator__summary-label">{t.changesUntracked}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">U:</span>
                    {snapshot?.untracked.length ?? 0}
                  </strong>
                </button>
              </div>
            </div>
          ) : null}

          {changesNavigatorMode === "tree" && treeNodes.length > 0 ? (
            <FileTree
              nodes={treeNodes}
              selectedFilePath={navigatorSelectedPath}
              expandedPaths={expandedPaths}
              onToggle={toggleChangesTreePath}
              onOpenFile={handleSelectNavigatorNode}
              renderMeta={renderNavigatorMeta}
              getContextMenuItems={getContextMenuItems}
              expandLabel={t.expandDetails}
              collapseLabel={t.collapseDetails}
            />
          ) : null}
          {changesNavigatorMode === "list" && flatNodes.length > 0 ? (
            <FileTree
              nodes={flatNodes}
              selectedFilePath={navigatorSelectedPath}
              expandedPaths={{}}
              onToggle={() => undefined}
              onOpenFile={handleSelectNavigatorNode}
              renderMeta={renderNavigatorMeta}
              getContextMenuItems={getContextMenuItems}
              expandLabel={t.expandDetails}
              collapseLabel={t.collapseDetails}
              flat
            />
          ) : null}
          {changesNavigatorMode === "outline" ? (
            changeOutline.length > 0 ? (
              <OutlineTree
                items={changeOutline}
                onNavigate={(line) => handleRevealOutlineLine(line)}
                expandLabel={t.expandDetails}
                collapseLabel={t.collapseDetails}
                expandedIds={expandedOutlineIds}
                onExpandedIdsChange={setExpandedOutlineIds}
              />
            ) : (
              <p className="adl-empty-hint adl-empty-hint--navigator">{t.noDiagnostics}</p>
            )
          ) : null}
          {filteredChangeEntries.length === 0 && changesNavigatorMode !== "outline" ? <p className="adl-empty-hint adl-empty-hint--navigator">{t.changesEmpty}</p> : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize changes navigator"
            aria-valuemin={180}
            aria-valuemax={300}
            aria-valuenow={changesNavigatorWidth}
          />
        </aside>

        <div className={`adl-tool-primary${activePatchSet ? " adl-tool-primary--scrollable" : ""}`}>
          {activePatchSet ? (
            <div className="adl-tool-primary__scroll adl-tool-primary__scroll--changes">
              {validation ? (
                <div className="adl-banner adl-banner--info">
                  <strong>{validation.status}</strong>
                  <span>{validation.summary}</span>
                  {latestPatchApplication?.rolledBack ? <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span> : null}
                  {latestPatchApplication?.patchSet.status === "applied" ? <span className="adl-chip adl-chip--success">{t.changesApplied}</span> : null}
                </div>
              ) : null}

              <>
                <article className="adl-patch-review-summary">
                  <header className="adl-patch-review-summary__header">
                    <div>
                      <strong>{activePatchSet.title}</strong>
                      <p>{activePatchSet.summary}</p>
                    </div>
                    <span className="adl-chip adl-chip--info">{reviewCounts.total} {t.changesSummaryPatchFiles}</span>
                  </header>

                  <div className="adl-patch-review-summary__stats">
                    <div className="adl-review-stat">
                      <span>{t.batchAcceptAll}</span>
                      <strong>{reviewCounts.accepted}</strong>
                    </div>
                    <div className="adl-review-stat">
                      <span>{t.batchRejectAll}</span>
                      <strong>{reviewCounts.rejected}</strong>
                    </div>
                    <div className="adl-review-stat">
                      <span>{t.approvalPendingCount}</span>
                      <strong>{reviewCounts.pending}</strong>
                    </div>
                  </div>

                  <div className="adl-patch-review-summary__actions">
                    <div className="adl-segmented" role="tablist" aria-label={t.validationSummary}>
                      {(["all", "pending", "accepted", "rejected"] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          aria-pressed={patchReviewFilter === filter ? "true" : "false"}
                          onClick={() => onSetPatchReviewFilter(filter)}
                        >
                          {filter === "all"
                            ? t.auditFilterAll
                            : filter === "pending"
                              ? t.approvalPendingCount
                              : filter === "accepted"
                                ? t.approvalApproved
                                : t.approvalRejected}
                        </button>
                      ))}
                    </div>
                    <div className="adl-patch-review-summary__batch">
                      <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onAcceptAllHunks}>
                        {t.batchAcceptAll}
                      </button>
                      <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onRejectAllHunks}>
                        {t.batchRejectAll}
                      </button>
                    </div>
                  </div>
                </article>

                {filteredPatchSummaries.length > 0 ? (
                  <div className="adl-patch-review-files">
                    {filteredPatchSummaries.map((summary) => {
                      const isActiveFile = summary.relativePath === activeSummary?.relativePath;
                      return (
                        <article
                          key={summary.relativePath}
                          ref={(element) => {
                            activeCardRef.current[summary.relativePath] = element;
                          }}
                          className={`adl-patch-file-card${isActiveFile ? " is-active" : ""}`}
                        >
                          <header className="adl-patch-file-card__header">
                            <button
                              type="button"
                              className="adl-patch-file-card__open"
                              onClick={() =>
                                onSelectPatchFile(summary.relativePath, {
                                  activateTool: true,
                                  line: summary.hunks[0]?.targetLine,
                                  hunkId: summary.hunks[0]?.id
                                })
                              }
                            >
                              <IconFileText size={14} decorative />
                              <span>{summary.relativePath}</span>
                            </button>
                            <div className="adl-patch-file-card__header-meta">
                              <span className={`adl-change-badge adl-change-badge--${summary.changeKind}`}>
                                {getChangeKindLabel(summary.changeKind, t)}
                              </span>
                              <span className="adl-chip adl-chip--info">
                                {summary.acceptedHunks + summary.rejectedHunks}/{summary.totalHunks}
                              </span>
                            </div>
                          </header>

                          <div className="adl-patch-file-card__progress">
                            <span>{t.currentTask}</span>
                            <div className="adl-review-progress" aria-hidden="true">
                              <span style={{ width: `${Math.max(8, Math.round(summary.reviewedRatio * 100))}%` }} />
                            </div>
                          </div>

                          <div className="adl-patch-file-card__hunks">
                            {summary.hunks.map((hunk) => {
                              const isSelected = hunk.id === selectedPatchHunkId;
                              return (
                                <section
                                  key={hunk.id}
                                  className={`adl-patch-hunk-card adl-patch-hunk-card--${hunk.changeKind}${isSelected ? " is-selected" : ""}`}
                                >
                                  <div className="adl-patch-hunk-card__summary">
                                    <button
                                      type="button"
                                      className="adl-patch-hunk-card__toggle"
                                      onClick={() => onTogglePatchHunkCollapse(hunk.id)}
                                      aria-expanded={hunk.isCollapsed ? "false" : "true"}
                                      aria-label={hunk.isCollapsed ? t.expandDetails : t.collapseDetails}
                                    >
                                      {hunk.isCollapsed ? <IconChevronRight size={12} decorative /> : <IconChevronDown size={12} decorative />}
                                    </button>
                                    <button
                                      type="button"
                                      className="adl-patch-hunk-card__jump"
                                      onClick={() =>
                                        onSelectPatchHunk(summary.relativePath, hunk.id, hunk.targetLine, { activateTool: true })
                                      }
                                    >
                                      <div>
                                        <strong>{hunk.preview}</strong>
                                        <small>
                                          -{hunk.oldStart}:{hunk.oldLines} / +{hunk.newStart}:{hunk.newLines}
                                        </small>
                                      </div>
                                      <span className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}>
                                        {hunk.decision === "accepted"
                                          ? t.approvalApproved
                                          : hunk.decision === "rejected"
                                            ? t.approvalRejected
                                            : t.approvalPendingCount}
                                      </span>
                                    </button>
                                    <TooltipSimple content={t.conflictViewDiff} placement="top">
                                      <button
                                        type="button"
                                        className="adl-tool-context__iconbtn"
                                        onClick={() =>
                                          onSelectPatchHunk(summary.relativePath, hunk.id, hunk.targetLine, { activateTool: true })
                                        }
                                        aria-label={t.conflictViewDiff}
                                      >
                                        <IconTarget size={14} decorative />
                                      </button>
                                    </TooltipSimple>
                                  </div>

                                  {!hunk.isCollapsed ? (
                                    <div className="adl-patch-hunk-card__details">
                                      <div className="adl-patch-hunk-card__toolbar">
                                        <button
                                          type="button"
                                          className="adl-btn adl-btn--ghost adl-btn--sm"
                                          onClick={() =>
                                            onSelectPatchHunk(summary.relativePath, hunk.id, hunk.targetLine, { activateTool: true })
                                          }
                                        >
                                          {t.conflictViewDiff}
                                        </button>
                                        <button
                                          type="button"
                                          className="adl-btn adl-btn--ghost adl-btn--sm"
                                          onClick={() => onSetHunkDecision(hunk.id, "accepted")}
                                        >
                                          {t.accept}
                                        </button>
                                        <button
                                          type="button"
                                          className="adl-btn adl-btn--ghost adl-btn--sm"
                                          onClick={() => onSetHunkDecision(hunk.id, "rejected")}
                                        >
                                          {t.reject}
                                        </button>
                                      </div>
                                      <div className="adl-patch-hunk-card__preview">
                                        <pre>{hunk.preview}</pre>
                                      </div>
                                    </div>
                                  ) : null}
                                </section>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="adl-empty-hint">{t.noPatch}</p>
                )}

                <div className="adl-patch-card__footer">
                  <button data-testid="patch-apply" type="button" className="adl-btn adl-btn--primary" onClick={onApplyPatchSet}>
                    {t.applyPatch}
                  </button>
                  <button type="button" className="adl-btn adl-btn--ghost" onClick={onRollbackPatchSet}>
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
                  {latestPatchApplication?.rolledBack ? <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span> : null}
                  {latestPatchApplication?.patchSet.status === "applied" ? <span className="adl-chip adl-chip--success">{t.changesApplied}</span> : null}
                </div>
              ) : null}
              <div
                ref={changesPreviewEditorShellRef}
                className="adl-tool-editor adl-tool-editor--changes"
                data-testid="changes-preview-shell"
              >
                {previewEnabled && categorizeFile(changePreview.path) === "markdown" ? (
                  <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
                    <LazyMarkdownPreviewWrapper content={changePreview.currentContent} theme={changePreviewTheme} />
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
                      extensions={previewEditorExtensions}
                      onMount={handleDiffMount}
                    />
                  </div>
                ) : (
                  <div className="adl-tool-editor__surface">
                    {stickyContextModel ? <StickyContext data-testid="changes-sticky-context" model={stickyContextModel} t={t} /> : null}
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
                      minimapModel={changePreviewMinimapModel}
                      minimapScopeId={changePreviewDiffMinimapScopeId}
                      onCollapsedUnchangedRangesChange={setCollapsedUnchangedDiffRanges}
                    />
                  </div>
                )}
              </div>
            </>
          ) : changePreviewLoading ? null : null}
        </div>
      </div>
    </div>
  );
}
