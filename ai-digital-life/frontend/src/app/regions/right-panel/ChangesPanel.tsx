import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { ensureAdlMonacoThemes, MONACO_THEME_DARK, MONACO_THEME_LIGHT, type MonacoNamespace } from "../../monacoTheme";
import {
  IconChevronDown,
  IconChevronRight,
  IconFiles,
  IconFileText,
  IconFoldVertical,
  IconGitBranch,
  IconMoreVertical,
  IconPanelLeftClose,
  IconTarget,
  IconUnfoldVertical,
  IconUpload
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import { countGitChanges } from "./types";
import type { RightPanelViewProps } from "./types";
import { countReviewedHunks, filterPatchFileSummaries, summarizePatchSet } from "./patchReview";
import { StickyContext } from "./stickyContextView";
import { buildChangeEntries, buildChangeTree, buildFlatChangeNodes, type ChangeTreeNode } from "./changesTree";
import {
  computePreviewDiffVisualRanges,
  type PreviewDiffVisualRange
} from "./changePreviewDiffRanges";
import { collectDirectoryPaths, FileTree, type FileTreeContextMenuItem } from "./fileTree";
import {
  computeInlineMinimapRailWidth,
  DEFAULT_INLINE_MINIMAP_WIDTH,
  getLongestLineColumn,
  INLINE_MINIMAP_MAX_COLUMN
} from "./inlineMinimapLayout";
import { detectEditorLanguage } from "../../workspacePaths";
import {
  type MonacoDecoration,
  type MonacoEditor,
  getMonacoFromWindow,
  createMonacoRange,
  getEditorVisibleStartLine,
  isDiffEditor,
  getMinimapPosition,
  navigateEditorToLine,
  cssColorToHex
} from "./monacoTypes";
import {
  attachMinimapVisualOverlays,
  loadMinimapSettings,
  saveMinimapSettings,
  MINIMAP_DEFAULTS,
  type MinimapSettings
} from "./minimapVisualOverlay";
import { buildStickyContextEntries, createStickyContextModel, type StickyContextModel } from "./stickyContext";

const CHANGES_BRANCH_STORAGE_KEY = "adl-ui:changes-branch";
const FALLBACK_BRANCHES = ["main", "develop", "release/0.1.0", "feature/right-panel"];
const INLINE_MINIMAP_SELECTOR = ".monaco-diff-editor:not(.side-by-side) .editor.modified .minimap";
const INLINE_MINIMAP_CANVAS_SELECTOR = "canvas.minimap-decorations-layer, canvas";
const INLINE_DIFF_BACKGROUND_LAYER_CLASS = "adl-inline-diff-backgrounds";
const INLINE_DIFF_BACKGROUND_BAND_CLASS = "adl-inline-diff-background-band";
const INLINE_DIFF_INSERT_MINIMAP_CLASS = "adl-inline-diff-line--insert-minimap";
const INLINE_DIFF_DELETE_MINIMAP_CLASS = "adl-inline-diff-line--delete-minimap";
const INLINE_MODIFIED_OVERFLOW_GUARD_SELECTOR =
  ".monaco-diff-editor:not(.side-by-side) .editor.modified .overflow-guard";
const INLINE_MODIFIED_SCROLLABLE_SELECTOR =
  ".monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-scrollable-element";

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
  } catch {
    // ignore local preview persistence failures
  }
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

function getInlinePreviewLongestLineColumn(editor: MonacoEditor | null | undefined, content: string): number {
  const model = editor?.getModel?.();
  const lineCount = model?.getLineCount() ?? 0;
  if (!model?.getLineMaxColumn || lineCount <= 0) {
    return getLongestLineColumn(content);
  }

  let longestLineColumn = 0;
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    longestLineColumn = Math.max(longestLineColumn, model.getLineMaxColumn(lineNumber) - 1);
    if (longestLineColumn >= INLINE_MINIMAP_MAX_COLUMN) {
      return INLINE_MINIMAP_MAX_COLUMN;
    }
  }

  return longestLineColumn;
}

function readInlineMinimapWidth(root: ParentNode, editor: MonacoEditor | null | undefined, content: string): number | null {
  const minimapLayout = editor?.getLayoutInfo().minimap;
  if (minimapLayout?.minimapWidth && minimapLayout.minimapCharWidth) {
    return computeInlineMinimapRailWidth({
      configuredWidth: minimapLayout.minimapWidth,
      minimapCharWidth: minimapLayout.minimapCharWidth,
      longestLineColumn: getInlinePreviewLongestLineColumn(editor, content),
      maxColumn: INLINE_MINIMAP_MAX_COLUMN
    });
  }

  const minimap = root.querySelector<HTMLElement>(INLINE_MINIMAP_SELECTOR);
  if (!minimap) return null;

  const canvasWidths = Array.from(minimap.querySelectorAll<HTMLCanvasElement>(INLINE_MINIMAP_CANVAS_SELECTOR))
    .map((canvas) => canvas.getBoundingClientRect().width)
    .filter((width) => width > 0);
  const fallbackWidth = minimap.getBoundingClientRect().width;
  const candidateWidth = canvasWidths.length > 0 ? Math.max(...canvasWidths) : fallbackWidth;
  if (candidateWidth <= 0) return null;
  return Math.ceil(candidateWidth);
}

function syncInlineMinimapWidth(root: HTMLElement | null, editor: MonacoEditor | null | undefined, content: string) {
  if (!root) return;
  const nextWidth = readInlineMinimapWidth(root, editor, content) ?? DEFAULT_INLINE_MINIMAP_WIDTH;
  root.style.setProperty("--adl-editor-minimap-width", `${nextWidth}px`);
}

function syncInlineHorizontalScroll(root: HTMLElement | null, editor: MonacoEditor | null | undefined) {
  if (!root) return;
  const scrollLeft = Math.max(0, Math.ceil(editor?.getScrollLeft?.() ?? 0));
  root.style.setProperty("--adl-editor-scroll-left", `${scrollLeft}px`);
}

function syncInlinePreviewLayout(root: HTMLElement | null, editor: MonacoEditor | null | undefined, content: string) {
  syncInlineMinimapWidth(root, editor, content);
  syncInlineHorizontalScroll(root, editor);
}

function getRenderablePreviewDiffRanges(ranges: PreviewDiffVisualRange[]): PreviewDiffVisualRange[] {
  const insertLines = new Set<number>();
  ranges
    .filter((range) => range.type === "insert")
    .forEach((range) => {
      for (let line = range.startLine; line <= range.endLine; line += 1) {
        insertLines.add(line);
      }
    });

  return ranges.filter((range) => {
    if (range.startLine < 1 || range.endLine < range.startLine) return false;
    if (range.type === "delete") {
      for (let line = range.startLine; line <= range.endLine; line += 1) {
        if (insertLines.has(line)) return false;
      }
    }
    return true;
  });
}

function getPreviewDecorationClassName(range: PreviewDiffVisualRange, sideBySide: boolean): string {
  const minimapClassName = range.type === "delete" ? INLINE_DIFF_DELETE_MINIMAP_CLASS : INLINE_DIFF_INSERT_MINIMAP_CLASS;
  if (!sideBySide) {
    return `adl-inline-diff-line ${minimapClassName}`;
  }
  return `adl-inline-diff-line adl-inline-diff-line--${range.type} adl-inline-diff-line--${range.tone} ${minimapClassName}`;
}

function removeInlineDiffBackgrounds(root: ParentNode | null) {
  root
    ?.querySelectorAll<HTMLElement>(`.${INLINE_DIFF_BACKGROUND_LAYER_CLASS}`)
    .forEach((element) => element.remove());
}

function getEditorLineHeight(editor: MonacoEditor, lineNumber: number, lineCount: number): number {
  const currentTop = editor.getTopForLineNumber?.(lineNumber);
  const nextTop = lineNumber < lineCount ? editor.getTopForLineNumber?.(lineNumber + 1) : undefined;
  if (typeof currentTop === "number" && typeof nextTop === "number" && nextTop > currentTop) {
    return nextTop - currentTop;
  }

  const domLineHeight = editor.getDomNode?.()?.querySelector<HTMLElement>(".view-line")?.getBoundingClientRect().height ?? 0;
  return domLineHeight > 0 ? domLineHeight : 19;
}

function syncInlineDiffBackgrounds(
  root: HTMLElement | null,
  editor: MonacoEditor | null | undefined,
  ranges: PreviewDiffVisualRange[]
) {
  if (!root || !editor || ranges.length === 0) {
    removeInlineDiffBackgrounds(root);
    return;
  }

  const guard = root.querySelector<HTMLElement>(INLINE_MODIFIED_OVERFLOW_GUARD_SELECTOR);
  const scrollable = root.querySelector<HTMLElement>(INLINE_MODIFIED_SCROLLABLE_SELECTOR);
  const minimap = root.querySelector<HTMLElement>(INLINE_MINIMAP_SELECTOR);
  const model = editor.getModel?.();
  const lineCount = model?.getLineCount() ?? 0;
  if (!guard || !scrollable || lineCount <= 0 || !editor.getTopForLineNumber) {
    removeInlineDiffBackgrounds(root);
    return;
  }

  let layer = guard.querySelector<HTMLElement>(`:scope > .${INLINE_DIFF_BACKGROUND_LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = INLINE_DIFF_BACKGROUND_LAYER_CLASS;
    layer.setAttribute("aria-hidden", "true");
    guard.insertBefore(layer, guard.firstChild);
  }

  const guardRect = guard.getBoundingClientRect();
  const scrollableRect = scrollable.getBoundingClientRect();
  const minimapRect = minimap?.getBoundingClientRect();
  const layerLeft = Math.max(0, Math.floor(scrollableRect.left - guardRect.left));
  const layerTop = Math.max(0, Math.floor(scrollableRect.top - guardRect.top));
  const minimapLeft = minimapRect && minimapRect.width > 0 ? minimapRect.left : guardRect.right;
  const layerRight = Math.max(0, Math.floor(guardRect.right - minimapLeft) - 1);

  layer.style.left = `${layerLeft}px`;
  layer.style.top = `${layerTop}px`;
  layer.style.right = `${layerRight}px`;

  const scrollTop = editor.getScrollTop();
  const visibleRanges = editor.getVisibleRanges?.() ?? [];
  const visibleStartLine = Math.max(1, visibleRanges[0]?.startLineNumber ?? 1);
  const visibleEndLine = Math.min(lineCount, visibleRanges[visibleRanges.length - 1]?.endLineNumber ?? lineCount);
  const fragment = document.createDocumentFragment();

  getRenderablePreviewDiffRanges(ranges).forEach((range) => {
    const startLine = Math.max(range.startLine, visibleStartLine);
    const endLine = Math.min(range.endLine, visibleEndLine, lineCount);
    if (endLine < startLine) return;

    const top = Math.floor(editor.getTopForLineNumber?.(startLine) ?? 0) - scrollTop;
    const nextTop = endLine < lineCount ? editor.getTopForLineNumber?.(endLine + 1) : undefined;
    const fallbackHeight = getEditorLineHeight(editor, startLine, lineCount) * (endLine - startLine + 1);
    const bottom = typeof nextTop === "number" ? nextTop - scrollTop : top + fallbackHeight;
    const height = Math.max(1, Math.ceil(bottom - top));

    const band = document.createElement("div");
    band.className = `${INLINE_DIFF_BACKGROUND_BAND_CLASS} ${INLINE_DIFF_BACKGROUND_BAND_CLASS}--${range.type} ${INLINE_DIFF_BACKGROUND_BAND_CLASS}--${range.tone}`;
    band.style.top = `${top}px`;
    band.style.height = `${height}px`;
    fragment.appendChild(band);
  });

  layer.replaceChildren(fragment);
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
    onSetPatchReviewFilter
  } = props;
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.changes);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const changesNavigatorWidth = useUiStore((state) => state.changesNavigatorWidth);
  const setChangesNavigatorWidth = useUiStore((state) => state.setChangesNavigatorWidth);
  const changesNavigatorMode = useUiStore((state) => state.changesNavigatorMode);
  const setChangesNavigatorMode = useUiStore((state) => state.setChangesNavigatorMode);
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
  const changesPreviewEditorSurfaceRef = useRef<HTMLDivElement | null>(null);
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
  const treeNodes = useMemo(() => buildChangeTree(changeEntries), [changeEntries]);
  const flatNodes = useMemo(() => buildFlatChangeNodes(changeEntries), [changeEntries]);
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
  const changePreviewTheme = appInfo?.config.resolvedTheme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT;
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
    if (!activeSummary?.relativePath) {
      return;
    }
    activeCardRef.current[activeSummary.relativePath]?.scrollIntoView({ block: "nearest" });
  }, [activeSummary?.relativePath]);

  const handleMonacoBeforeMount = useCallback((monaco: unknown) => {
    const namespace = monaco as MonacoNamespace;
    (window as typeof window & { monaco?: unknown }).monaco = monaco;
    ensureAdlMonacoThemes(namespace);
  }, []);

  const diffEditorRef = useRef<unknown>(null);
  const minimapTimerRef = useRef<number | null>(null);
  const previewDecorationIdsRef = useRef<string[]>([]);
  const [diffEditorReady, setDiffEditorReady] = useState(0);
  const [minimapSettings, setMinimapSettings] = useState<MinimapSettings>(loadMinimapSettings);
  const [stickyContextModel, setStickyContextModel] = useState<StickyContextModel | null>(null);
  const minimapSettingsRef = useRef(minimapSettings);
  minimapSettingsRef.current = minimapSettings;
  const diffRangesRef = useRef<import("./changePreviewDiffRanges").PreviewDiffVisualRange[]>([]);

  const applyMinimapToDiffEditor = useCallback((de: unknown, _reason: string) => {
    if (!isDiffEditor(de)) return false;
    try {
      const inlineScrollbarOpts = {
        vertical: "hidden" as const,
        horizontal: "auto" as const,
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 10
      };
      const s = minimapSettingsRef.current;
      const minimapOpts = {
        enabled: true,
        side: "right" as const,
        size: s.size,
        showSlider: s.showSlider,
        renderCharacters: s.renderCharacters,
        maxColumn: INLINE_MINIMAP_MAX_COLUMN,
        scale: s.scale
      };
      de.updateOptions({
        minimap: minimapOpts,
        scrollbar: inlineScrollbarOpts
      });
      const modifiedEditor = de.getModifiedEditor();
      if (modifiedEditor) {
        modifiedEditor.updateOptions({
          minimap: minimapOpts,
          scrollbar: inlineScrollbarOpts
        });
      }
      const originalEditor = de.getOriginalEditor();
      if (originalEditor) {
        originalEditor.updateOptions({
          minimap: { enabled: false },
          scrollbar: inlineScrollbarOpts
        });
      }
      return true;
    } catch (_e) {
      return false;
    }
  }, []);

  const handleDiffEditorMount = useCallback((diffEditor: unknown) => {
    if (!isDiffEditor(diffEditor)) return;
    diffEditorRef.current = diffEditor;
    setDiffEditorReady((v) => v + 1);
    applyMinimapToDiffEditor(diffEditor, "onMount");

    const triggerRelayout = () => {
      const shell = changesPreviewEditorShellRef.current;
      if (!shell) return;
      const surface = shell.querySelector(".adl-tool-editor__surface") as HTMLElement;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      try {
        diffEditor.layout({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      } catch (_e) { /* ignore */ }
      applyMinimapToDiffEditor(diffEditorRef.current, "relayout");
      requestAnimationFrame(() =>
        {
          const currentDiffEditor = diffEditorRef.current;
          const modifiedEditor = isDiffEditor(currentDiffEditor) ? currentDiffEditor.getModifiedEditor() : null;
          syncInlinePreviewLayout(
            changesPreviewEditorShellRef.current,
            modifiedEditor,
            changePreview?.currentContent ?? ""
          );
        }
      );
    };

    requestAnimationFrame(triggerRelayout);

    const disposable = diffEditor.onDidUpdateDiff(() => {
      if (minimapTimerRef.current !== null) cancelAnimationFrame(minimapTimerRef.current);
      minimapTimerRef.current = requestAnimationFrame(triggerRelayout);
    });

    return () => {
      disposable.dispose();
      if (minimapTimerRef.current !== null) cancelAnimationFrame(minimapTimerRef.current);
    };
  }, [applyMinimapToDiffEditor, changePreview?.currentContent]);

  const diffEditorOptions = useMemo(() => ({
    automaticLayout: true,
    readOnly: true,
    renderSideBySide: props.diffSideBySide,
    renderSideBySideInlineBreakpoint: 1,
    useInlineViewWhenSpaceIsLimited: false,
    renderIndicators: false,
    renderMarginRevertIcon: false,
    wordWrap: wordWrapEnabled ? "on" as const : "off" as const,
    diffWordWrap: wordWrapEnabled ? "on" as const : "off" as const,
    lineNumbers: lineNumbersEnabled ? "on" as const : "off" as const,
    lineNumbersMinChars: 6,
    lineDecorationsWidth: 0,
    folding: false,
    showFoldingControls: "never" as const,
    glyphMargin: false,
    minimap: {
      enabled: true,
      side: "right" as const,
      size: minimapSettings.size,
      showSlider: minimapSettings.showSlider,
      renderCharacters: minimapSettings.renderCharacters,
      maxColumn: INLINE_MINIMAP_MAX_COLUMN,
      scale: minimapSettings.scale
    },
    scrollbar: {
      vertical: "hidden" as const,
      horizontal: "auto" as const,
      verticalScrollbarSize: 0,
      horizontalScrollbarSize: 10
    },
    scrollBeyondLastLine: false,
    scrollBeyondLastColumn: 0,
    renderOverviewRuler: false,
    stickyScroll: { enabled: false },
    renderLineHighlight: "line" as const,
    renderWhitespace: "selection" as const,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false
    },
    bracketPairColorization: { enabled: true }
  }), [props.diffSideBySide, wordWrapEnabled, lineNumbersEnabled]);

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    const modifiedEditor = isDiffEditor(diffEditor) ? diffEditor.getModifiedEditor() : null;
    const monaco = getMonacoFromWindow();

    diffRangesRef.current = changePreviewDiffRanges;

    if (!modifiedEditor || !monaco || !changePreview) {
      if (modifiedEditor && previewDecorationIdsRef.current.length > 0) {
        previewDecorationIdsRef.current = modifiedEditor.deltaDecorations(previewDecorationIdsRef.current, []);
      }
      return;
    }

    const minimapPosition = getMinimapPosition(monaco);
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    const insertColor = cssColorToHex(
      computedStyle.getPropertyValue("--minimap-diff-insert-bg").trim() || "rgba(22, 163, 74, 0.5)"
    );
    const deleteColor = cssColorToHex(
      computedStyle.getPropertyValue("--minimap-diff-remove-bg").trim() || "rgba(239, 68, 68, 0.5)"
    );

    const decorations: MonacoDecoration[] = getRenderablePreviewDiffRanges(changePreviewDiffRanges)
      .map((range: PreviewDiffVisualRange) => {
        const isDelete = range.type === "delete";
        const color = isDelete ? deleteColor : insertColor;
        return {
          range: createMonacoRange(monaco, range.startLine, 1, range.endLine, 1),
          options: {
            isWholeLine: true,
            className: getPreviewDecorationClassName(range, props.diffSideBySide),
            zIndex: 100 + (isDelete ? 1 : 0),
            minimap: {
              position: minimapPosition,
              color: color,
            }
          }
        };
      });

    const rafId = requestAnimationFrame(() => {
      const currentDiffEditor = diffEditorRef.current;
      const currentModifiedEditor = isDiffEditor(currentDiffEditor) ? currentDiffEditor.getModifiedEditor() : null;
      if (!currentModifiedEditor) return;
      previewDecorationIdsRef.current = currentModifiedEditor.deltaDecorations(previewDecorationIdsRef.current, decorations);
    });

    return () => {
      cancelAnimationFrame(rafId);
      const activeDiffEditor = diffEditorRef.current;
      const activeModifiedEditor = isDiffEditor(activeDiffEditor) ? activeDiffEditor.getModifiedEditor() : null;
      if (activeModifiedEditor && previewDecorationIdsRef.current.length > 0) {
        previewDecorationIdsRef.current = activeModifiedEditor.deltaDecorations(previewDecorationIdsRef.current, []);
      }
    };
  }, [changePreview, changePreviewDiffRanges, diffEditorReady, props.diffSideBySide]);

  useEffect(() => {
    if (!diffEditorRef.current) return;
    applyMinimapToDiffEditor(diffEditorRef.current, "inlinePreviewReady");
  }, [changePreview?.path, props.diffSideBySide, applyMinimapToDiffEditor]);

  useEffect(() => {
    if (!diffEditorRef.current) return;
    const refreshMinimapAfterOptionChange = () => {
      const currentDiffEditor = diffEditorRef.current;
      const modifiedEditor = isDiffEditor(currentDiffEditor) ? currentDiffEditor.getModifiedEditor() : null;
      applyMinimapToDiffEditor(currentDiffEditor, "displayOptionChange");
      syncInlinePreviewLayout(
        changesPreviewEditorShellRef.current,
        modifiedEditor,
        changePreview?.currentContent ?? ""
      );
    };

    const rafId = requestAnimationFrame(refreshMinimapAfterOptionChange);
    return () => cancelAnimationFrame(rafId);
  }, [changePreview?.currentContent, changePreview?.path, lineNumbersEnabled, props.diffSideBySide, wordWrapEnabled, applyMinimapToDiffEditor]);

  useEffect(() => {
    const currentDiffEditor = diffEditorRef.current;
    const modifiedEditor = isDiffEditor(currentDiffEditor) ? currentDiffEditor.getModifiedEditor() : null;
    syncInlinePreviewLayout(
      changesPreviewEditorShellRef.current,
      modifiedEditor,
      changePreview?.currentContent ?? ""
    );
  }, [changePreview?.currentContent, changePreview?.path, diffEditorReady, props.diffSideBySide, minimapSettings]);

  const getModifiedEditor = useCallback(() => {
    const de = diffEditorRef.current;
    return isDiffEditor(de) ? de.getModifiedEditor() : null;
  }, []);

  const refreshStickyContext = useCallback(() => {
    if (!changePreview) {
      setStickyContextModel(null);
      return;
    }

    const editor = getModifiedEditor();
    const visibleStartLine = getEditorVisibleStartLine(editor) ?? editor?.getSelection?.()?.startLineNumber ?? 1;
    const contextEntries = buildStickyContextEntries({
      content: changePreview.currentContent,
      outline: [],
      visibleStartLine,
      maxContextRows: 3,
      diffRanges: changePreviewDiffRanges
    });

    setStickyContextModel(createStickyContextModel({
      contextEntries,
      activeLine: visibleStartLine,
      canScrollToTop: visibleStartLine > 1,
      onNavigateLine: (line) => navigateEditorToLine(getModifiedEditor(), line),
      topLabel: t.stickyContextTop
    }));
  }, [changePreview, changePreviewDiffRanges, getModifiedEditor, t.stickyContextTop]);

  const reapplyDiffDecorations = useCallback(() => {
    const diffEditor = diffEditorRef.current;
    const modifiedEditor = isDiffEditor(diffEditor) ? diffEditor.getModifiedEditor() : null;
    const monaco = getMonacoFromWindow();
    const ranges = diffRangesRef.current;

    if (!modifiedEditor || !monaco || !changePreview) {
      return;
    }

    const minimapPosition = getMinimapPosition(monaco);
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    const insertColor = cssColorToHex(
      computedStyle.getPropertyValue("--minimap-diff-insert-bg").trim() || "rgba(22, 163, 74, 0.5)"
    );
    const deleteColor = cssColorToHex(
      computedStyle.getPropertyValue("--minimap-diff-remove-bg").trim() || "rgba(239, 68, 68, 0.5)"
    );

    const decorations: MonacoDecoration[] = getRenderablePreviewDiffRanges(ranges)
      .map((range: PreviewDiffVisualRange) => {
        const isDelete = range.type === "delete";
        const color = isDelete ? deleteColor : insertColor;
        return {
          range: createMonacoRange(monaco, range.startLine, 1, range.endLine, 1),
          options: {
            isWholeLine: true,
            className: getPreviewDecorationClassName(range, props.diffSideBySide),
            zIndex: 100 + (isDelete ? 1 : 0),
            minimap: {
              position: minimapPosition,
              color: color,
            }
          }
        };
      });

    previewDecorationIdsRef.current = modifiedEditor.deltaDecorations(previewDecorationIdsRef.current, decorations);
  }, [changePreview, props.diffSideBySide]);

  const applyMinimapSettings = useCallback((settings: MinimapSettings) => {
    const de = diffEditorRef.current;
    if (!isDiffEditor(de)) return;
    const minimapOpts = {
      enabled: true,
      side: "right" as const,
      size: settings.size,
      showSlider: settings.showSlider,
      renderCharacters: settings.renderCharacters,
      maxColumn: INLINE_MINIMAP_MAX_COLUMN,
      scale: settings.scale
    };
    try {
      de.updateOptions({ minimap: minimapOpts });
      const modifiedEditor = de.getModifiedEditor();
      if (modifiedEditor) modifiedEditor.updateOptions({ minimap: minimapOpts });
      
      // Reapply diff decorations after minimap rebuilds
      reapplyDiffDecorations();
    } catch {
      /* editor disposed */
    }
  }, [reapplyDiffDecorations]);

  const handleMinimapSettingsChange = useCallback((settings: MinimapSettings) => {
    const prev = minimapSettingsRef.current;
    setMinimapSettings(settings);
    saveMinimapSettings(settings);
    // sliderIntensity is a custom CSS variable, NOT a Monaco option.
    // Calling updateOptions when only sliderIntensity changed causes Monaco
    // to re-render the minimap, which destroys and rebuilds the minimap canvas,
    // making all content (code text + diff colors) vanish.
    const monacoOptionsChanged =
      prev.size !== settings.size ||
      prev.showSlider !== settings.showSlider ||
      prev.renderCharacters !== settings.renderCharacters ||
      prev.scale !== settings.scale;
    if (monacoOptionsChanged) {
      applyMinimapSettings(settings);
    }
  }, [applyMinimapSettings]);

  useEffect(() => {
    const shell = changesPreviewEditorSurfaceRef.current;
    if (!shell) return;

    const controller = attachMinimapVisualOverlays(shell, {
      getScrollState: () => {
        const editor = getModifiedEditor();
        if (!editor) return null;
        return {
          scrollTop: editor.getScrollTop(),
          scrollHeight: editor.getScrollHeight(),
          clientHeight: editor.getLayoutInfo().height,
        };
      },
      setScrollTop: (value) => {
        getModifiedEditor()?.setScrollPosition({ scrollTop: value });
      },
      onSettingsChange: handleMinimapSettingsChange,
      getSettings: () => minimapSettingsRef.current,
      getLineCount: () => getModifiedEditor()?.getModel?.()?.getLineCount() ?? null,
    });

    const editor = getModifiedEditor();
    syncInlineHorizontalScroll(changesPreviewEditorShellRef.current, editor);
    const scrollDisposable = editor?.onDidScrollChange?.(() => {
      syncInlineHorizontalScroll(changesPreviewEditorShellRef.current, editor);
      controller.refresh();
    });

    return () => {
      scrollDisposable?.dispose();
      controller.dispose();
    };
  }, [changePreview?.path, diffEditorReady, getModifiedEditor, handleMinimapSettingsChange]);

  useEffect(() => {
    const shell = changesPreviewEditorSurfaceRef.current;
    const editor = getModifiedEditor();
    if (!shell || !changePreview || props.diffSideBySide || !editor) {
      removeInlineDiffBackgrounds(shell);
      return;
    }

    let rafId = 0;
    const scheduleRefresh = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        syncInlineDiffBackgrounds(shell, editor, diffRangesRef.current);
      });
    };

    scheduleRefresh();
    const disposables = [
      editor.onDidScrollChange?.(scheduleRefresh),
      editor.onDidChangeHiddenAreas?.(scheduleRefresh),
      editor.onDidLayoutChange?.(scheduleRefresh)
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleRefresh)
        : null;
    observer?.observe(shell);
    window.addEventListener("resize", scheduleRefresh);

    return () => {
      window.cancelAnimationFrame(rafId);
      disposables.forEach((disposable) => disposable.dispose());
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRefresh);
      removeInlineDiffBackgrounds(shell);
    };
  }, [
    changePreview,
    changePreviewDiffRanges,
    diffEditorReady,
    getModifiedEditor,
    lineNumbersEnabled,
    minimapSettings,
    props.diffSideBySide,
    wordWrapEnabled
  ]);

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

    const disposables = [
      editor.onDidScrollChange?.(refreshStickyContext),
      editor.onDidChangeHiddenAreas?.(refreshStickyContext),
      editor.onDidLayoutChange?.(refreshStickyContext)
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const shell = changesPreviewEditorSurfaceRef.current;
    const observer =
      shell && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => refreshStickyContext())
        : null;
    if (observer && shell) {
      observer.observe(shell);
    }

    window.addEventListener("resize", refreshStickyContext);
    return () => {
      disposables.forEach((disposable) => disposable.dispose());
      observer?.disconnect();
      window.removeEventListener("resize", refreshStickyContext);
    };
  }, [changePreview, diffEditorReady, getModifiedEditor, props.diffSideBySide, refreshStickyContext, wordWrapEnabled]);

  const handleNavigatorResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = changesNavigatorWidth;
    const body = document.body;
    body.classList.add("adl-is-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setChangesNavigatorWidth(startWidth + delta);
    };

    const handleUp = () => {
      body.classList.remove("adl-is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

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

  const handleSelectNavigatorNode = (relativePath: string) => {
    const patchSummary = patchSummaries.find((summary) => summary.relativePath === relativePath);
    if (patchSummary) {
      onSelectPatchFile(relativePath, {
        line: patchSummary.hunks[0]?.targetLine,
        hunkId: patchSummary.hunks[0]?.id
      });
      return;
    }
    onOpenChangePreview(relativePath);
  };

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
          action: (targetNode) => props.onOpenFile(targetNode.path)
        }
      ];
    },
    [props, t.changesPreviewOpenInFiles]
  );

  const renderNavigatorMeta = (node: ChangeTreeNode) => {
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
  };

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
              {changesNavigatorMode === "tree" ? (
                <TooltipSimple content={hasExpandedDirectories ? t.fileCollapseAll : t.fileExpandAll} placement="top">
                  <button
                    type="button"
                    className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                    onClick={handleToggleAllDirectories}
                    aria-label={hasExpandedDirectories ? t.fileCollapseAll : t.fileExpandAll}
                  >
                    {hasExpandedDirectories ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
                  </button>
                </TooltipSimple>
              ) : (
                <IconGitBranch size={14} decorative />
              )}
              <span className="adl-tool-navigator__context-title">{t.toolChanges}</span>
            </div>
            <span className="adl-tool-navigator__meta">{changeEntries.length || countGitChanges(snapshot)}</span>
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
            </div>
          </div>
          {changeEntries.length > 0 ? (
            <div className="adl-tool-navigator__summary" aria-label={t.toolChanges}>
              <div className="adl-tool-navigator__summary-stats">
                <div className="adl-tool-navigator__summary-stat">
                  <span className="adl-tool-navigator__summary-label">{t.changesStaged}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">S:</span>
                    {snapshot?.staged.length ?? 0}
                  </strong>
                </div>
                <div className="adl-tool-navigator__summary-stat">
                  <span className="adl-tool-navigator__summary-label">{t.changesModified}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">M:</span>
                    {snapshot?.unstaged.length ?? 0}
                  </strong>
                </div>
                <div className="adl-tool-navigator__summary-stat">
                  <span className="adl-tool-navigator__summary-label">{t.changesUntracked}</span>
                  <strong className="adl-tool-navigator__summary-value">
                    <span className="adl-tool-navigator__summary-code" aria-hidden="true">U:</span>
                    {snapshot?.untracked.length ?? 0}
                  </strong>
                </div>
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
            />
          ) : null}
          {changeEntries.length === 0 ? <p className="adl-empty-hint adl-empty-hint--navigator">{t.changesEmpty}</p> : null}
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
                <div ref={changesPreviewEditorSurfaceRef} className="adl-tool-editor__surface">
                  {stickyContextModel ? <StickyContext data-testid="changes-sticky-context" model={stickyContextModel} t={t} /> : null}
                  <DiffEditor
                    height="100%"
                    theme={changePreviewTheme}
                    beforeMount={handleMonacoBeforeMount}
                    language={changePreviewLanguage}
                    original={changePreview.baseContent}
                    modified={changePreview.currentContent}
                    options={diffEditorOptions}
                    onMount={handleDiffEditorMount}
                  />
                </div>
              </div>
            </>
          ) : changePreviewLoading ? null : null}
        </div>
      </div>
    </div>
  );
}
