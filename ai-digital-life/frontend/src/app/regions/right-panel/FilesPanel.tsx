import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { ensureAdlMonacoThemes, MONACO_THEME_DARK, MONACO_THEME_LIGHT, type MonacoNamespace } from "../../monacoTheme";
import type { MonacoEditorRef } from "../../types";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconFilePlus,
  IconFoldVertical,
  IconFolderPlus,
  IconHash,
  IconPanelLeftClose,
  IconMoreVertical,
  IconRefreshCw,
  IconReplace,
  IconReturn,
  IconSearch,
  IconUnfoldVertical
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import { normalizeWorkspaceRelativePath } from "../../workspacePaths";
import { StickyContext } from "./stickyContextView";
import { collectDirectoryPaths, FileTree } from "./fileTree";
import {
  getEditorVisibleStartLine,
  navigateEditorToLine,
  isDiffEditor,
  type MonacoEditor,
  getMinimapPosition,
  cssColorToHex
} from "./monacoTypes";
import {
  attachMinimapVisualOverlays,
  loadMinimapSettings,
  saveMinimapSettings,
  MINIMAP_DEFAULTS,
  type MinimapSettings
} from "./minimapVisualOverlay";
import {
  derivePatchHunkChangeKind,
  getPatchHunkTargetLine,
  summarizePatchFile
} from "./patchReview";
import type { PreviewDiffVisualRange } from "./changePreviewDiffRanges";
import { buildStickyContextEntries, createStickyContextModel, type StickyContextModel } from "./stickyContext";
import type { RightPanelViewProps } from "./types";

type FilesNavigatorMode = "tree" | "search" | "outline";

const FOLDING_CONTROL_SELECTOR =
  ".codicon-folding-manual-collapsed, .codicon-folding-manual-expanded, .codicon-folding-expanded, .codicon-folding-collapsed";

type DisposableLike = {
  dispose: () => void;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchPattern(query: string, options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean }) {
  if (!query) {
    return undefined;
  }
  const source = options.useRegex ? query : escapeRegExp(query);
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? "g" : "gi");
  } catch {
    return undefined;
  }
}

function buildDefaultCreationPath(selectedFilePath: string | undefined, fallbackName: string): string {
  const normalized = normalizeWorkspaceRelativePath(selectedFilePath ?? "");
  if (!normalized) {
    return fallbackName;
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return fallbackName;
  }
  return `${segments.slice(0, -1).join("/")}/${fallbackName}`;
}

function normalizeCreationPath(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    return undefined;
  }
  const normalized = normalizeWorkspaceRelativePath(trimmed);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }
  return segments.join("/");
}

function buildMonacoEditorOptions(options: {
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  sideBySideDiff?: boolean;
  hideUnchangedRegions?: boolean;
  minimapSettings?: MinimapSettings;
}) {
  const ms = options.minimapSettings ?? MINIMAP_DEFAULTS;
  const baseOptions = {
    readOnly: options.readOnly,
    lineNumbers: options.lineNumbersEnabled ? "on" : "off",
    lineNumbersMinChars: 4,
    lineDecorationsWidth: 12,
    minimap: {
      enabled: true,
      side: "right",
      size: ms.size,
      showSlider: ms.showSlider,
      renderCharacters: ms.renderCharacters,
      maxColumn: 80,
      scale: ms.scale
    },
    scrollbar: {
      vertical: "hidden",
      horizontal: "auto",
      verticalScrollbarSize: 0,
      horizontalScrollbarSize: 10
    },
    scrollBeyondLastLine: false,
    stickyScroll: { enabled: false },
    wordWrap: options.wordWrapEnabled ? "on" : "off",
    folding: true,
    showFoldingControls: "mouseover",
    glyphMargin: false,
    renderLineHighlight: "line",
    renderWhitespace: "selection",
    bracketPairColorization: { enabled: true },
    renderSideBySide: options.sideBySideDiff,
    hideUnchangedRegions: options.hideUnchangedRegions
      ? {
          enabled: true,
          contextLineCount: 3,
          minimumLineCount: 3,
          revealLineCount: 3
        }
      : { enabled: false }
  } as const;

  if (options.sideBySideDiff === undefined) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    renderIndicators: false,
    renderMarginRevertIcon: false
  } as const;
}

function buildStickyDiffRangesFromHunks(
  hunks: NonNullable<ReturnType<typeof summarizePatchFile>>["hunks"]
): PreviewDiffVisualRange[] {
  return hunks.flatMap((hunk) => {
    const anchorLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
    const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
    if (hunk.changeKind === "added") {
      return [{
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "insert" as const,
        tone: "strong" as const,
        contentColumns: 1
      }];
    }
    if (hunk.changeKind === "deleted") {
      return [{
        startLine: anchorLine,
        endLine: anchorLine,
        type: "delete" as const,
        tone: "base" as const,
        contentColumns: 1
      }];
    }
    return [
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "insert" as const,
        tone: "strong" as const,
        contentColumns: 1
      },
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "delete" as const,
        tone: "base" as const,
        contentColumns: 1
      }
    ];
  });
}

function stripNativeFoldingTitles(root: ParentNode | null | undefined) {
  if (!root || !("querySelectorAll" in root)) return;
  root.querySelectorAll<HTMLElement>(FOLDING_CONTROL_SELECTOR).forEach((control) => {
    control.removeAttribute("title");
    control.removeAttribute("aria-label");
  });
}

function resolveLineNumberFromMargin(editorRoot: HTMLElement, control: HTMLElement): number | undefined {
  const controlRect = control.getBoundingClientRect();
  const lineNumberNodes = Array.from(
    editorRoot.querySelectorAll<HTMLElement>(".margin-view-overlays .line-numbers")
  );

  let bestMatch: { lineNumber: number; distance: number } | undefined;
  lineNumberNodes.forEach((node) => {
    const text = node.textContent?.trim() ?? "";
    const lineNumber = Number.parseInt(text, 10);
    if (!Number.isFinite(lineNumber)) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const verticallyAligned = controlRect.bottom >= rect.top - 1 && controlRect.top <= rect.bottom + 1;
    if (!verticallyAligned) {
      return;
    }
    const distance = Math.abs(rect.top - controlRect.top);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { lineNumber, distance };
    }
  });

  return bestMatch?.lineNumber;
}

export function FilesPanel(props: RightPanelViewProps) {
  const {
    t,
    appInfo,
    selectedFilePath,
    fileContent,
    externalChangePath,
    editorLanguage,
    diffSideBySide,
    filePatch,
    diagnostics,
    editorHint,
    outline,
    workspaceTree,
    searchQuery,
    searchResults,
    dirtyEditorPaths,
    onOpenFile,
    onOpenFileAtLine,
    onEditorChange,
    onEditorMount,
    onDiffMount,
    onSearch,
    onSearchChange,
    onRefreshWorkspaceTree,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    onSetDiffLayout
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<FilesNavigatorMode>("tree");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [createTarget, setCreateTarget] = useState<"file" | "folder" | null>(null);
  const [createPathValue, setCreatePathValue] = useState("");
  const [wordWrapEnabled, setWordWrapEnabled] = useState(false);
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [agentAnnotationsEnabled, setAgentAnnotationsEnabled] = useState(true);
  const [minimapSettings, setMinimapSettings] = useState<MinimapSettings>(loadMinimapSettings);
  const minimapSettingsRef = useRef(minimapSettings);
  minimapSettingsRef.current = minimapSettings;
  const [collapsePreviewActive, setCollapsePreviewActive] = useState(false);
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.files);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const filesNavigatorWidth = useUiStore((state) => state.filesNavigatorWidth);
  const expandedPaths = useUiStore((state) => state.expandedFileTreePaths);
  const setFilesNavigatorWidth = useUiStore((state) => state.setFilesNavigatorWidth);
  const setFileTreePathExpanded = useUiStore((state) => state.setFileTreePathExpanded);
  const toggleFileTreePath = useUiStore((state) => state.toggleFileTreePath);
  const expandFileTreePathChain = useUiStore((state) => state.expandFileTreePathChain);
  const collapseAllFileTreePaths = useUiStore((state) => state.collapseAllFileTreePaths);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const [fileHistory, setFileHistory] = useState<string[]>([]);
  const [fileHistoryIndex, setFileHistoryIndex] = useState(-1);
  const fileHistoryNavRef = useRef(false);
  const agentDecorationIdsRef = useRef<string[]>([]);
  const agentDecorationsEnabledRef = useRef(agentAnnotationsEnabled);
  agentDecorationsEnabledRef.current = agentAnnotationsEnabled;
  const dirtyPaths = useMemo(
    () => new Set(dirtyEditorPaths.map((pathValue) => normalizeWorkspaceRelativePath(pathValue))),
    [dirtyEditorPaths]
  );
  const directoryPaths = useMemo(() => collectDirectoryPaths(workspaceTree), [workspaceTree]);
  const hasExpandedDirectories = useMemo(
    () => directoryPaths.some((pathValue) => expandedPaths[pathValue]),
    [directoryPaths, expandedPaths]
  );
  const selectedAbsolutePath = useMemo(() => {
    const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
    if (!rootPath || !selectedFilePath) {
      return undefined;
    }
    const separator = rootPath.includes("\\") ? "\\" : "/";
    const normalizedRelative = selectedFilePath.split("/").join(separator);
    return `${rootPath}${rootPath.endsWith(separator) ? "" : separator}${normalizedRelative}`;
  }, [appInfo?.currentWorkspace?.path, appInfo?.currentWorkspace?.rootPath, selectedFilePath]);
  const monacoTheme = appInfo?.config.resolvedTheme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT;
  const [monacoNamespace, setMonacoNamespace] = useState<MonacoNamespace | null>(null);
  const monacoNamespaceRef = useRef(monacoNamespace);
  monacoNamespaceRef.current = monacoNamespace;
  const foldingTooltipControllerDisposablesRef = useRef<DisposableLike[]>([]);
  const fileDiffEditorRef = useRef<unknown>(null);
  const [stickyContextModel, setStickyContextModel] = useState<StickyContextModel | null>(null);
  const [stickyEditorReady, setStickyEditorReady] = useState(0);
  const activeFilePatch = useMemo(() => {
    if (!props.activePatchSet || !props.selectedPatchFilePath) return undefined;
    return props.activePatchSet.filePatches.find((candidate) => candidate.relativePath === props.selectedPatchFilePath);
  }, [props.activePatchSet, props.selectedPatchFilePath]);
  const activeFilePatchSummary = useMemo(
    () => (activeFilePatch ? summarizePatchFile(activeFilePatch, props.collapsedPatchHunkIds) : undefined),
    [activeFilePatch, props.collapsedPatchHunkIds]
  );
  const stickyDiffRanges = useMemo(
    () => (activeFilePatchSummary ? buildStickyDiffRangesFromHunks(activeFilePatchSummary.hunks) : undefined),
    [activeFilePatchSummary]
  );
  const getStickySourceEditor = useCallback((): MonacoEditor | null => {
    if (filePatch && filePatch.relativePath === selectedFilePath) {
      const diffEditor = fileDiffEditorRef.current;
      return isDiffEditor(diffEditor) ? diffEditor.getModifiedEditor() : null;
    }
    return props.standardEditorRef.current as unknown as MonacoEditor | null;
  }, [filePatch, props.standardEditorRef, selectedFilePath]);

  const applyAgentDecorations = useCallback(() => {
    const editor = props.standardEditorRef.current as any;
    if (!editor?.deltaDecorations) return;

    if (!agentDecorationsEnabledRef.current || !activeFilePatch || !selectedFilePath) {
      agentDecorationIdsRef.current = editor.deltaDecorations(agentDecorationIdsRef.current, []);
      return;
    }

    // Read minimap colors from CSS variables (same approach as ChangesPanel)
    const minimapPosition = getMinimapPosition(monacoNamespaceRef.current ?? undefined);
    const rootDpr = document.documentElement;
    const cs = getComputedStyle(rootDpr);
    const insertColor = cssColorToHex(
      cs.getPropertyValue("--minimap-diff-insert-bg").trim() || "rgba(22, 163, 74, 0.5)"
    );
    const deleteColor = cssColorToHex(
      cs.getPropertyValue("--minimap-diff-remove-bg").trim() || "rgba(239, 68, 68, 0.5)"
    );

    const decorations = activeFilePatch.hunks.map((hunk) => {
      const decisionTone =
        hunk.decision === "accepted" ? "accepted" : hunk.decision === "rejected" ? "rejected" : "pending";
      const changeKind = derivePatchHunkChangeKind(hunk);
      const startLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
      const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
      const endLine = startLine + lineSpan - 1;
      const hover = [
        { value: `**Agent 变更**` },
        { value: `- 文件: \`${hunk.relativePath}\`` },
        { value: `- hunk: \`${hunk.id}\`` },
        { value: `- 类型: \`${changeKind}\`` },
        { value: `- 决策: \`${hunk.decision}\`` }
      ];

      // Deleted/removed lines use the delete (red) minimap color;
      // added and modified lines use the insert (green) minimap color.
      const minimapColor = changeKind === "deleted" ? deleteColor : insertColor;

      return {
        range: {
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          className: `adl-agent-deco adl-agent-deco--${changeKind} adl-agent-deco--${decisionTone}${props.selectedPatchHunkId === hunk.id ? " adl-agent-deco--selected" : ""}`,
          linesDecorationsClassName: `adl-agent-gutter adl-agent-gutter--${changeKind} adl-agent-gutter--${decisionTone}${props.selectedPatchHunkId === hunk.id ? " adl-agent-gutter--selected" : ""}`,
          hoverMessage: hover as any,
          minimap: {
            position: minimapPosition,
            color: minimapColor,
          }
        }
      };
    });

    agentDecorationIdsRef.current = editor.deltaDecorations(agentDecorationIdsRef.current, decorations);
  }, [activeFilePatch, props.selectedPatchHunkId, props.standardEditorRef, selectedFilePath]);

  useEffect(() => {
    if (filePatch && filePatch.relativePath === selectedFilePath) {
      const editor = props.standardEditorRef.current as any;
      if (editor?.deltaDecorations) {
        agentDecorationIdsRef.current = editor.deltaDecorations(agentDecorationIdsRef.current, []);
      }
      return;
    }

    applyAgentDecorations();
    return () => {
      const editor = props.standardEditorRef.current as any;
      if (!editor?.deltaDecorations) return;
      agentDecorationIdsRef.current = editor.deltaDecorations(agentDecorationIdsRef.current, []);
    };
  }, [applyAgentDecorations, filePatch, props.standardEditorRef, selectedFilePath]);

  const ensureMonacoThemes = useCallback((monaco: MonacoNamespace) => {
    ensureAdlMonacoThemes(monaco);
  }, []);

  const formatFoldingHint = useCallback(
    (isCollapsed: boolean, endLineNumber: number) =>
      (isCollapsed ? t.foldingExpandToLine : t.foldingCollapseToLine).replace("{line}", String(endLineNumber)),
    [t]
  );

  const syncFoldingControlTooltip = useCallback((foldingControl: HTMLElement, content: string) => {
    foldingControl.setAttribute("title", content);
    foldingControl.removeAttribute("aria-label");
  }, []);

  const resolveFoldingRegion = useCallback(async (editorInstance: any, lineNumber: number) => {
    const controller = editorInstance?.getContribution?.("editor.contrib.folding");
    const foldingModelPromise = controller?.getFoldingModel?.();
    if (!foldingModelPromise) {
      return undefined;
    }
    const foldingModel = await foldingModelPromise;
    const region = foldingModel?.getRegionAtLine?.(lineNumber);
    if (!region || region.startLineNumber !== lineNumber) {
      return undefined;
    }
    return {
      endLineNumber: region.endLineNumber as number,
      isCollapsed: Boolean(region.isCollapsed)
    };
  }, []);

  const createFoldingTooltipController = useCallback(
    (editorInstance: any): DisposableLike | undefined => {
      const editorRoot = editorInstance?.getDomNode?.() as HTMLElement | null | undefined;
      if (!editorRoot) {
        return undefined;
      }

      let disposed = false;

      const resolveLineNumber = (control: HTMLElement, mouseEvent: MouseEvent) => {
        const pointInMargin = editorInstance?.getTargetAtClientPoint?.(mouseEvent.clientX, mouseEvent.clientY);
        const pointInContent = editorInstance?.getTargetAtClientPoint?.(mouseEvent.clientX + 24, mouseEvent.clientY);
        return (
          (pointInMargin?.position?.lineNumber as number | undefined) ??
          (pointInMargin?.range?.startLineNumber as number | undefined) ??
          (pointInMargin?.range?.endLineNumber as number | undefined) ??
          (pointInContent?.position?.lineNumber as number | undefined) ??
          (pointInContent?.range?.startLineNumber as number | undefined) ??
          (pointInContent?.range?.endLineNumber as number | undefined) ??
          resolveLineNumberFromMargin(editorRoot, control)
        );
      };

      const resolveLineNumberFromControlRect = (control: HTMLElement) => {
        const rect = control.getBoundingClientRect();
        const pointNearContent = editorInstance?.getTargetAtClientPoint?.(rect.right + 24, rect.top + rect.height / 2);
        return (
          (pointNearContent?.position?.lineNumber as number | undefined) ??
          (pointNearContent?.range?.startLineNumber as number | undefined) ??
          (pointNearContent?.range?.endLineNumber as number | undefined) ??
          resolveLineNumberFromMargin(editorRoot, control)
        );
      };

      const syncVisibleControlTooltips = async (preferredControl?: HTMLElement, preferredEvent?: MouseEvent) => {
        const controls = Array.from(editorRoot.querySelectorAll<HTMLElement>(FOLDING_CONTROL_SELECTOR));
        const orderedControls = preferredControl
          ? [preferredControl, ...controls.filter((control) => control !== preferredControl)]
          : controls;
        await Promise.all(
          orderedControls.map(async (control) => {
            const lineNumber =
              control === preferredControl && preferredEvent
                ? resolveLineNumber(control, preferredEvent)
                : resolveLineNumberFromControlRect(control);
            if (!lineNumber) {
              return;
            }
            const region = await resolveFoldingRegion(editorInstance, lineNumber);
            if (!region || disposed) {
              return;
            }
            const content = formatFoldingHint(region.isCollapsed, region.endLineNumber);
            syncFoldingControlTooltip(control, content);
          })
        );
      };

      const mutationObserver =
        typeof MutationObserver === "undefined"
          ? undefined
          : new MutationObserver(() => {
              stripNativeFoldingTitles(editorRoot);
              void syncVisibleControlTooltips();
            });

      stripNativeFoldingTitles(editorRoot);
      void syncVisibleControlTooltips();
      mutationObserver?.observe(editorRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"]
      });

      const handlePointerOver = (event: Event) => {
        const target = event.target as HTMLElement | null;
        const foldingControl = target?.closest?.(FOLDING_CONTROL_SELECTOR) as HTMLElement | null;
        if (!foldingControl) {
          return;
        }
        void syncVisibleControlTooltips(foldingControl, event as MouseEvent);
      };

      editorRoot.addEventListener("mouseover", handlePointerOver, true);

      const subscriptions: DisposableLike[] = [];
      const pushDisposable = (subscription: { dispose: () => void } | undefined) => {
        if (subscription) {
          subscriptions.push(subscription);
        }
      };
      pushDisposable(
        editorInstance?.onDidScrollChange?.(() => {
          void syncVisibleControlTooltips();
        })
      );
      pushDisposable(
        editorInstance?.onDidChangeModelContent?.(() => {
          void syncVisibleControlTooltips();
        })
      );

      return {
        dispose: () => {
          disposed = true;
          subscriptions.forEach((subscription) => subscription.dispose());
          editorRoot.removeEventListener("mouseover", handlePointerOver, true);
          mutationObserver?.disconnect();
        }
      };
    },
    [formatFoldingHint, resolveFoldingRegion, syncFoldingControlTooltip]
  );

  const replaceFoldingHintBindings = useCallback(
    (editorLike: any) => {
      foldingTooltipControllerDisposablesRef.current.forEach((subscription) => subscription.dispose());
      foldingTooltipControllerDisposablesRef.current = [];

      if (!editorLike) {
        return;
      }

      const editors = [editorLike.getModifiedEditor?.(), editorLike.getOriginalEditor?.()].filter(Boolean);
      const scopedEditors = editors.length > 0 ? editors : [editorLike];
      foldingTooltipControllerDisposablesRef.current = scopedEditors.flatMap((editorInstance) => {
        const controller = createFoldingTooltipController(editorInstance);
        return controller ? [controller] : [];
      });
    },
    [createFoldingTooltipController]
  );

  const handleMonacoBeforeMount = useCallback(
    (monaco: unknown) => {
      const namespace = monaco as MonacoNamespace;
      setMonacoNamespace((current) => (current === namespace ? current : namespace));
      (window as typeof window & { monaco?: unknown }).monaco = monaco;
      ensureMonacoThemes(namespace);
    },
    [ensureMonacoThemes]
  );

  useEffect(() => {
    if (selectedFilePath) {
      expandFileTreePathChain(selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath]);

  useEffect(() => {
    if (!activeFilePatch || !props.selectedPatchHunkId) {
      return;
    }
    const selectedHunk = activeFilePatch.hunks.find((candidate) => candidate.id === props.selectedPatchHunkId);
    if (!selectedHunk) {
      return;
    }
    const line = getPatchHunkTargetLine(selectedHunk);
    const editor = getStickySourceEditor();
    editor?.revealLinesInCenter?.(line, line + Math.max(selectedHunk.newLines, 1));
    navigateEditorToLine(editor, line);
  }, [activeFilePatch, getStickySourceEditor, props.selectedPatchHunkId]);

  useEffect(() => {
    if (!monacoNamespace) return;
    ensureMonacoThemes(monacoNamespace);
    monacoNamespace.editor?.setTheme?.(monacoTheme);
  }, [ensureMonacoThemes, monacoNamespace, monacoTheme]);

  useEffect(
    () => () => {
      foldingTooltipControllerDisposablesRef.current.forEach((subscription) => subscription.dispose());
      foldingTooltipControllerDisposablesRef.current = [];
    },
    []
  );

  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    if (fileHistoryNavRef.current) {
      fileHistoryNavRef.current = false;
      return;
    }
    setFileHistory((current) => {
      const nextBase = fileHistoryIndex >= 0 ? current.slice(0, fileHistoryIndex + 1) : current;
      if (nextBase[nextBase.length - 1] === selectedFilePath) {
        return current;
      }
      const nextHistory = [...nextBase, selectedFilePath];
      setFileHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }, [expandFileTreePathChain, fileHistoryIndex, selectedFilePath]);

  useEffect(() => {
    if (!fileMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [fileMenuOpen]);

  useEffect(() => {
    if (navigatorMode === "search") {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [navigatorMode]);

  useEffect(() => {
    if (!createTarget) {
      return;
    }
    window.setTimeout(() => {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }, 0);
  }, [createTarget]);

  const navigatorTitle =
    navigatorMode === "tree" ? t.toolFiles : navigatorMode === "search" ? t.searchResults : t.outline;
  const searchPattern = useMemo(
    () => buildSearchPattern(searchQuery, { matchCase, wholeWord: matchWholeWord, useRegex }),
    [matchCase, matchWholeWord, searchQuery, useRegex]
  );
  const filteredSearchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return searchResults;
    }
    if (!searchPattern) {
      return [];
    }
    return searchResults.filter((result) => {
      const localPattern = new RegExp(searchPattern.source, searchPattern.flags);
      return localPattern.test(`${result.path}\n${result.preview}`);
    });
  }, [searchPattern, searchQuery, searchResults]);
  const handleCopyPath = async (value?: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore clipboard failures in preview mode
    }
    setFileMenuOpen(false);
  };
  const handleReplaceInCurrentFile = () => {
    if (!fileContent || !searchPattern || !replaceOpen) {
      return;
    }
    const nextValue = fileContent.replace(searchPattern, replaceQuery);
    onEditorChange(nextValue);
  };
  const canGoBack = fileHistoryIndex > 0;
  const canGoForward = fileHistoryIndex >= 0 && fileHistoryIndex < fileHistory.length - 1;
  const handleNavigateHistory = (direction: "back" | "forward") => {
    const nextIndex = direction === "back" ? fileHistoryIndex - 1 : fileHistoryIndex + 1;
    const nextPath = fileHistory[nextIndex];
    if (!nextPath) {
      return;
    }
    fileHistoryNavRef.current = true;
    setFileHistoryIndex(nextIndex);
    onOpenFile(nextPath);
  };

  const handleRevealLine = (line: number) => {
    navigateEditorToLine(getStickySourceEditor(), line);
  };
  const handleJumpPatchHunk = (direction: "previous" | "next") => {
    props.onJumpPatchHunk(direction);
  };
  const handleSelectPatchHunk = (hunkId: string, line: number) => {
    if (!activeFilePatch) return;
    props.onSelectPatchHunk(activeFilePatch.relativePath, hunkId, line, { activateTool: false });
  };
  const hasCollapsedHunks = !!activeFilePatchSummary?.hunks.some((hunk) => hunk.isCollapsed);
  const handleTogglePatchHunk = (event: React.MouseEvent<HTMLButtonElement>, hunkId: string) => {
    event.stopPropagation();
    props.onTogglePatchHunkCollapse(hunkId);
  };
  const handleToggleAllDirectories = () => {
    if (!hasExpandedDirectories) {
      directoryPaths.forEach((pathValue) => setFileTreePathExpanded(pathValue, true));
      return;
    }
    collapseAllFileTreePaths();
  };
  const handleRefreshNavigator = async () => {
    await onRefreshWorkspaceTree();
  };
  const handleStartCreate = (target: "file" | "folder") => {
    setCreateTarget(target);
    setCreatePathValue(
      buildDefaultCreationPath(selectedFilePath, target === "file" ? "untitled.md" : "new-folder")
    );
  };
  const handleCancelCreate = () => {
    setCreateTarget(null);
    setCreatePathValue("");
  };
  const handleSubmitCreate = async () => {
    if (!createTarget) {
      return;
    }
    const relativePath = normalizeCreationPath(createPathValue);
    if (!relativePath) {
      return;
    }
    if (createTarget === "file") {
      const createdPath = await onCreateWorkspaceFile(relativePath);
      if (!createdPath) {
        return;
      }
      expandFileTreePathChain(createdPath);
    } else {
      const createdPath = await onCreateWorkspaceFolder(relativePath);
      if (!createdPath) {
        return;
      }
      expandFileTreePathChain(createdPath);
      setFileTreePathExpanded(createdPath, true);
    }
    handleCancelCreate();
  };
  const handleNavigatorResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = filesNavigatorWidth;
    const body = document.body;
    body.classList.add("adl-is-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setFilesNavigatorWidth(startWidth + delta);
    };

    const handleUp = () => {
      body.classList.remove("adl-is-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };
  const fileMenuItems = [
    { id: "save", label: t.fileSave, shortcut: "Ctrl+S", disabled: true },
    { id: "discard", label: t.fileDiscardChanges, disabled: true },
    { id: "sep-1", separator: true },
    {
      id: "copy-relative",
      label: t.fileCopyRelativePath,
      shortcut: "Ctrl+K Shift+C",
      disabled: !selectedFilePath,
      action: () => void handleCopyPath(selectedFilePath)
    },
    {
      id: "copy-absolute",
      label: t.fileCopyAbsolutePath,
      shortcut: "Ctrl+K Shift+A",
      disabled: !selectedAbsolutePath,
      action: () => void handleCopyPath(selectedAbsolutePath)
    },
    {
      id: "diff-view",
      label: t.fileDiffView,
      disabled: !filePatch || filePatch.relativePath !== selectedFilePath
    },
    { id: "sep-2", separator: true },
    {
      id: "line-numbers",
      label: `${t.fileLineNumbers} ${lineNumbersEnabled ? "✓" : ""}`.trim(),
      action: () => setLineNumbersEnabled((value) => !value)
    },
    {
      id: "word-wrap",
      label: `${t.fileWordWrap} ${wordWrapEnabled ? "✓" : ""}`.trim(),
      shortcut: t.fileWordWrapShortcut,
      action: () => setWordWrapEnabled((value) => !value)
    },
    {
      id: "agent-annotations",
      label: `${t.agentChangeAnnotations} ${agentAnnotationsEnabled ? "✓" : ""}`.trim(),
      disabled: !activeFilePatch,
      action: () => setAgentAnnotationsEnabled((value) => !value)
    }
  ];

  const handleStandardEditorMount = useCallback(
    (editor: MonacoEditorRef, monaco: unknown) => {
      replaceFoldingHintBindings(editor as any);
      onEditorMount(editor, monaco);
      setStickyEditorReady((value) => value + 1);
    },
    [onEditorMount, replaceFoldingHintBindings]
  );

  const handleDiffEditorMount = useCallback(
    (editor: MonacoEditorRef) => {
      fileDiffEditorRef.current = editor;
      replaceFoldingHintBindings(editor as any);
      onDiffMount(editor);
      setStickyEditorReady((value) => value + 1);
    },
    [onDiffMount, replaceFoldingHintBindings]
  );

  const refreshStickyContext = useCallback(() => {
    if (!selectedFilePath) {
      setStickyContextModel(null);
      return;
    }

    const editor = getStickySourceEditor();
    const visibleStartLine = getEditorVisibleStartLine(editor) ?? editor?.getSelection?.()?.startLineNumber ?? 1;
    const content = filePatch && filePatch.relativePath === selectedFilePath
      ? filePatch.afterContent
      : fileContent ?? "";
    const contextEntries = buildStickyContextEntries({
      content,
      outline,
      visibleStartLine,
      maxContextRows: 3,
      diffRanges: filePatch && filePatch.relativePath === selectedFilePath ? stickyDiffRanges : undefined
    });

    setStickyContextModel(createStickyContextModel({
      contextEntries,
      activeLine: visibleStartLine,
      canScrollToTop: visibleStartLine > 1,
      onNavigateLine: (line) => navigateEditorToLine(getStickySourceEditor(), line),
      topLabel: t.stickyContextTop
    }));
  }, [
    fileContent,
    filePatch,
    getStickySourceEditor,
    outline,
    selectedFilePath,
    stickyDiffRanges,
    t.stickyContextTop
  ]);

  useEffect(() => {
    if (!selectedFilePath) {
      setStickyContextModel(null);
      return;
    }

    refreshStickyContext();
    const editor = getStickySourceEditor();
    if (!editor) {
      return;
    }

    const disposables = [
      editor.onDidScrollChange?.(refreshStickyContext),
      editor.onDidChangeHiddenAreas?.(refreshStickyContext),
      editor.onDidLayoutChange?.(refreshStickyContext)
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const shell = editorSurfaceRef.current;
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
  }, [getStickySourceEditor, refreshStickyContext, selectedFilePath, stickyEditorReady, wordWrapEnabled, diffSideBySide]);

  useEffect(() => {
    const root = editorSurfaceRef.current;
    if (!root || !selectedFilePath) {
      return;
    }

    type EditorLike = {
      getScrollTop(): number;
      getScrollHeight(): number;
      getLayoutInfo(): { height: number };
      setScrollPosition(position: { scrollTop: number }): void;
      updateOptions(options: unknown): void;
      onDidScrollChange?(listener: () => void): { dispose(): void };
      getModel?(): { getLineCount(): number } | null;
    };

    const getEditor = (): EditorLike | null => {
      if (filePatch && filePatch.relativePath === selectedFilePath) {
        const diffEditor = fileDiffEditorRef.current;
        if (isDiffEditor(diffEditor)) {
          return diffEditor.getModifiedEditor() as unknown as EditorLike;
        }
        return null;
      }
      return props.standardEditorRef.current as unknown as EditorLike | null;
    };

    const applyMinimapSettings = (settings: MinimapSettings) => {
      if (filePatch && filePatch.relativePath === selectedFilePath) {
        const diffEditor = fileDiffEditorRef.current;
        if (!isDiffEditor(diffEditor)) return;
        const minimapOpts = {
          enabled: true,
          side: "right" as const,
          size: settings.size,
          showSlider: settings.showSlider,
          renderCharacters: settings.renderCharacters,
          maxColumn: 80,
          scale: settings.scale
        };
        try {
          diffEditor.updateOptions({ minimap: minimapOpts });
          const modifiedEditor = diffEditor.getModifiedEditor();
          if (modifiedEditor) modifiedEditor.updateOptions({ minimap: minimapOpts });
        } catch {
          /* editor disposed */
        }
      } else {
        const editor = props.standardEditorRef.current as unknown as EditorLike | null;
        if (!editor) return;
        try {
          editor.updateOptions({
            minimap: {
              enabled: true,
              side: "right" as const,
              size: settings.size,
              showSlider: settings.showSlider,
              renderCharacters: settings.renderCharacters,
              maxColumn: 80,
              scale: settings.scale
            }
          });
        } catch {
          /* editor disposed */
        }
      }
    };

    const controller = attachMinimapVisualOverlays(root, {
      getScrollState: () => {
        const ed = getEditor();
        if (!ed) return null;
        return {
          scrollTop: ed.getScrollTop(),
          scrollHeight: ed.getScrollHeight(),
          clientHeight: ed.getLayoutInfo().height
        };
      },
      setScrollTop: (value) => {
        getEditor()?.setScrollPosition({ scrollTop: value });
      },
      onSettingsChange: (settings) => {
        const prev = minimapSettingsRef.current;
        setMinimapSettings(settings);
        saveMinimapSettings(settings);
        const monacoOptionsChanged =
          prev.size !== settings.size ||
          prev.showSlider !== settings.showSlider ||
          prev.renderCharacters !== settings.renderCharacters ||
          prev.scale !== settings.scale;
        if (monacoOptionsChanged) {
          applyMinimapSettings(settings);
        }
      },
      getSettings: () => minimapSettingsRef.current,
      getLineCount: () => getEditor()?.getModel?.()?.getLineCount() ?? null,
    });

    const scrollDisposable = getEditor()?.onDidScrollChange?.(() => controller.refresh());

    return () => {
      scrollDisposable?.dispose();
      controller.dispose();
    };
  }, [selectedFilePath, filePatch?.relativePath, props.standardEditorRef]);

  return (
    <div className="adl-tool-panel adl-tool-panel--files">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.fileExplorerContext}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("files")}
              aria-label={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft}
              onMouseEnter={() => setCollapsePreviewActive(true)}
              onMouseLeave={() => setCollapsePreviewActive(false)}
              onFocus={() => setCollapsePreviewActive(true)}
              onBlur={() => setCollapsePreviewActive(false)}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>

          <TooltipSimple content={navigatorMode === "search" ? t.browserBack : t.search} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => setNavigatorMode((current) => (current === "search" ? "tree" : "search"))}
              aria-label={navigatorMode === "search" ? t.browserBack : t.search}
            >
              {navigatorMode === "search" ? <IconReturn size={14} decorative /> : <IconSearch size={14} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserBack} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => handleNavigateHistory("back")}
              aria-label={t.browserBack}
              disabled={!canGoBack}
            >
              <IconArrowLeft size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.browserForward} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => handleNavigateHistory("forward")}
              aria-label={t.browserForward}
              disabled={!canGoForward}
            >
              <IconArrowRight size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <div ref={fileMenuRef} className="adl-menu adl-file-context__menu">
            <TooltipSimple content={t.fileMoreActions} placement="top">
              <button
                type="button"
                className={`adl-tool-context__iconbtn${fileMenuOpen ? " is-open" : ""}`}
                onClick={() => setFileMenuOpen((value) => !value)}
                aria-label={t.fileMoreActions}
                aria-haspopup="menu"
                aria-expanded={fileMenuOpen ? "true" : "false"}
              >
                <IconMoreVertical size={14} decorative />
              </button>
            </TooltipSimple>
            {fileMenuOpen ? (
              <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
                {fileMenuItems.map((item) =>
                  "separator" in item ? (
                    <div key={item.id} className="adl-menu__sep" role="separator" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={
                        item.id === "line-numbers"
                          ? lineNumbersEnabled
                            ? "true"
                            : "false"
                          : item.id === "word-wrap"
                            ? wordWrapEnabled
                              ? "true"
                              : "false"
                            : item.id === "agent-annotations"
                              ? agentAnnotationsEnabled
                                ? "true"
                                : "false"
                              : undefined
                      }
                      className="adl-menu__item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.action?.();
                        if (!item.action) {
                          setFileMenuOpen(false);
                        }
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? <span className="adl-menu__shortcut">{item.shortcut}</span> : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}${collapsePreviewActive && !navigatorCollapsed ? " is-collapse-preview" : ""}`}
        style={{ "--adl-files-nav-width": `${filesNavigatorWidth}px` } as React.CSSProperties}
      >
        <div className="adl-files-collapse-preview" aria-hidden="true" />
        <aside className="adl-tool-navigator" aria-label={navigatorTitle}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
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
              <span className="adl-tool-navigator__context-title">{appInfo?.currentWorkspace?.name ?? t.toolFiles}</span>
            </div>

            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
              <TooltipSimple content={t.fileRefresh} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => void handleRefreshNavigator()}
                  aria-label={t.fileRefresh}
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.fileNewFile} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => handleStartCreate("file")}
                  aria-label={t.fileNewFile}
                >
                  <IconFilePlus size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.fileNewFolder} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={() => handleStartCreate("folder")}
                  aria-label={t.fileNewFolder}
                >
                  <IconFolderPlus size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>

          {createTarget ? (
            <div className="adl-tool-navigator__createbar">
              <input
                ref={createInputRef}
                type="text"
                className="adl-tool-navigator__createinput"
                value={createPathValue}
                onChange={(event) => setCreatePathValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSubmitCreate();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    handleCancelCreate();
                  }
                }}
                aria-label={createTarget === "file" ? t.fileNewFile : t.fileNewFolder}
              />
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--sm"
                onClick={() => void handleSubmitCreate()}
                disabled={!normalizeCreationPath(createPathValue)}
              >
                {createTarget === "file" ? t.fileNewFile : t.fileNewFolder}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--sm"
                onClick={handleCancelCreate}
              >
                {t.cancel}
              </button>
            </div>
          ) : null}

          {navigatorMode === "tree" ? (
            <>
              {workspaceTree.length > 0 ? (
                <FileTree
                  nodes={workspaceTree}
                  selectedFilePath={selectedFilePath}
                  expandedPaths={expandedPaths}
                  dirtyPaths={dirtyPaths}
                  externalChangePath={externalChangePath}
                  onToggle={toggleFileTreePath}
                  onOpenFile={onOpenFile}
                />
              ) : (
                null
              )}
            </>
          ) : null}

          {navigatorMode === "search" ? (
            <div className="adl-search-panel">
              <div className="adl-search-panel__controls">
                <label className="adl-search-panel__field adl-search-panel__field--with-actions">
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => onSearchChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onSearch(searchQuery);
                      }
                    }}
                    placeholder={t.searchPanelSearch}
                    aria-label={t.searchPanelSearch}
                  />
                  <div className="adl-search-panel__toggles" role="toolbar" aria-label="Search options">
                    <TooltipSimple content={t.searchPanelMatchCase} placement="top">
                      <button
                        type="button"
                        className={`adl-search-panel__modebtn${matchCase ? " is-active" : ""}`}
                        aria-pressed={matchCase ? "true" : "false"}
                        onClick={() => setMatchCase((value) => !value)}
                        aria-label={t.searchPanelMatchCase}
                      >
                        Aa
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.searchPanelMatchWholeWord} placement="top">
                      <button
                        type="button"
                        className={`adl-search-panel__modebtn${matchWholeWord ? " is-active" : ""}`}
                        aria-pressed={matchWholeWord ? "true" : "false"}
                        onClick={() => setMatchWholeWord((value) => !value)}
                        aria-label={t.searchPanelMatchWholeWord}
                      >
                        ab
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.searchPanelUseRegex} placement="top">
                      <button
                        type="button"
                        className={`adl-search-panel__modebtn${useRegex ? " is-active" : ""}`}
                        aria-pressed={useRegex ? "true" : "false"}
                        onClick={() => setUseRegex((value) => !value)}
                        aria-label={t.searchPanelUseRegex}
                      >
                        .*
                      </button>
                    </TooltipSimple>
                  </div>
                </label>
                <button
                  type="button"
                  className={`adl-search-panel__toggle${replaceOpen ? " is-open" : ""}`}
                  onClick={() => setReplaceOpen((value) => !value)}
                  aria-label={t.searchPanelToggleReplace}
                  aria-expanded={replaceOpen ? "true" : "false"}
                >
                  <IconChevronDown size={12} decorative />
                </button>
              </div>

              {replaceOpen ? (
                <div className="adl-search-panel__controls">
                  <label className="adl-search-panel__field">
                    <input
                      type="text"
                      value={replaceQuery}
                      onChange={(event) => setReplaceQuery(event.target.value)}
                      placeholder={t.searchPanelReplace}
                      aria-label={t.searchPanelReplace}
                    />
                  </label>
                  <TooltipSimple content={t.searchPanelReplaceAction} placement="top">
                    <button
                      type="button"
                      className="adl-search-panel__replacebtn"
                      onClick={handleReplaceInCurrentFile}
                      disabled={!replaceQuery || !searchQuery || !fileContent}
                      aria-label={t.searchPanelReplaceAction}
                    >
                      <IconReplace size={14} decorative />
                    </button>
                  </TooltipSimple>
                </div>
              ) : null}

              {filteredSearchResults.length > 0 ? (
                <ul className="adl-tool-list adl-tool-list--search-results">
                  {filteredSearchResults.map((result) => (
                    <li key={`${result.path}:${result.line}`}>
                      <button
                        type="button"
                        className="adl-tool-list__item"
                        onClick={() => onOpenFileAtLine(result.path, result.line)}
                      >
                        <span className="adl-tool-list__title">{result.path}</span>
                        <small>{result.preview}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="adl-empty-hint">{t.searchPlaceholder}</p>
              )}
            </div>
          ) : null}

          {navigatorMode === "outline" ? (
            outline.length > 0 ? (
              <ul className="adl-tool-list">
                {outline.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="adl-tool-list__item" onClick={() => handleRevealLine(item.line)}>
                      <span className="adl-tool-list__title">{item.label}</span>
                      <small>{item.kind} · {item.line}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adl-empty-hint">{t.noDiagnostics}</p>
            )
          ) : null}
          <div
            className="adl-tool-navigator__resize-handle"
            onPointerDown={handleNavigatorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file navigator"
            aria-valuemin={180}
            aria-valuemax={420}
            aria-valuenow={filesNavigatorWidth}
          />
        </aside>

        <div className="adl-tool-primary">
          {editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null}

          <div ref={editorShellRef} className="adl-tool-editor" data-testid="editor-shell">
            {!selectedFilePath ? (
              null
            ) : filePatch && filePatch.relativePath === selectedFilePath ? (
              <>
                <div className="adl-diff-toolbar" role="group" aria-label={t.diffLayoutLabel}>
                  <div className="adl-diff-toolbar__group">
                    <span className="adl-diff-toolbar__label">{t.diffLayoutLabel}</span>
                    <div className="adl-segmented">
                      <button
                        type="button"
                        aria-pressed={!diffSideBySide ? "true" : "false"}
                        onClick={() => onSetDiffLayout(false)}
                      >
                        {t.diffLayoutInline}
                      </button>
                      <button type="button" aria-pressed={diffSideBySide ? "true" : "false"} onClick={() => onSetDiffLayout(true)}>
                        {t.diffLayoutSideBySide}
                      </button>
                    </div>
                  </div>
                  <div className="adl-diff-toolbar__group">
                    <button
                      type="button"
                      className={`adl-diff-toolbar__toggle${lineNumbersEnabled ? " is-active" : ""}`}
                      onClick={() => setLineNumbersEnabled((value) => !value)}
                    >
                      <IconHash size={12} decorative />
                      <span>{t.fileLineNumbers}</span>
                    </button>
                    <button
                      type="button"
                      className={`adl-diff-toolbar__toggle${wordWrapEnabled ? " is-active" : ""}`}
                      onClick={() => setWordWrapEnabled((value) => !value)}
                    >
                      <span>{t.fileWordWrap}</span>
                    </button>
                    <button
                      type="button"
                      className={`adl-diff-toolbar__toggle${agentAnnotationsEnabled ? " is-active" : ""}`}
                      onClick={() => setAgentAnnotationsEnabled((value) => !value)}
                    >
                      <span>{t.agentChangeAnnotations}</span>
                    </button>
                  </div>
                  <div className="adl-diff-toolbar__group">
                    <button type="button" className="adl-diff-toolbar__nav" onClick={() => handleJumpPatchHunk("previous")}>
                      {t.patchPreviousChange}
                    </button>
                    <button type="button" className="adl-diff-toolbar__nav" onClick={() => handleJumpPatchHunk("next")}>
                      {t.patchNextChange}
                    </button>
                    <button
                      type="button"
                      className="adl-diff-toolbar__nav"
                      onClick={() => props.onSetAllPatchHunksCollapsed(!hasCollapsedHunks, activeFilePatch?.relativePath)}
                    >
                      {hasCollapsedHunks ? t.fileExpandAll : t.fileCollapseAll}
                    </button>
                  </div>
                </div>
                {activeFilePatchSummary ? (
                  <div className="adl-diff-hunk-strip" aria-label={t.patchReview}>
                    <div className="adl-diff-hunk-strip__header">
                      <div>
                        <strong>{activeFilePatchSummary.relativePath}</strong>
                        <small>
                          {activeFilePatchSummary.totalHunks} · {activeFilePatchSummary.acceptedHunks + activeFilePatchSummary.rejectedHunks}/
                          {activeFilePatchSummary.totalHunks}
                        </small>
                      </div>
                    </div>
                    <div className="adl-diff-hunk-strip__list">
                      {activeFilePatchSummary.hunks.map((hunk, index) => (
                        <div
                          key={hunk.id}
                          className={`adl-diff-hunk-pill adl-diff-hunk-pill--${hunk.changeKind}${props.selectedPatchHunkId === hunk.id ? " is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className="adl-diff-hunk-pill__main"
                            onClick={() => handleSelectPatchHunk(hunk.id, hunk.targetLine)}
                          >
                            <span className="adl-diff-hunk-pill__index">{index + 1}</span>
                            <span className="adl-diff-hunk-pill__body">
                              <strong>{hunk.preview}</strong>
                              <small>
                                {hunk.newStart || hunk.oldStart}
                                {hunk.isCollapsed ? ` · ${t.expandDetails}` : ""}
                              </small>
                            </span>
                            <span className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}>
                              {hunk.decision === "accepted"
                                ? t.approvalApproved
                                : hunk.decision === "rejected"
                                  ? t.approvalRejected
                                  : t.approvalPendingCount}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="adl-diff-hunk-pill__toggle"
                            onClick={(event) => handleTogglePatchHunk(event, hunk.id)}
                            aria-label={hunk.isCollapsed ? t.expandDetails : t.collapseDetails}
                          >
                            {hunk.isCollapsed ? <IconChevronRight size={12} decorative /> : <IconChevronDown size={12} decorative />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
                  {stickyContextModel ? <StickyContext data-testid="files-sticky-context" model={stickyContextModel} t={t} /> : null}
                  <DiffEditor
                    theme={monacoTheme}
                    beforeMount={handleMonacoBeforeMount}
                    language={editorLanguage}
                    original={filePatch.beforeContent}
                    modified={filePatch.afterContent}
                    options={buildMonacoEditorOptions({
                      readOnly: true,
                      lineNumbersEnabled,
                      wordWrapEnabled,
                      sideBySideDiff: diffSideBySide,
                      hideUnchangedRegions: hasCollapsedHunks,
                      minimapSettings
                    })}
                    onMount={(editor) => handleDiffEditorMount(editor as unknown as MonacoEditorRef)}
                  />
                </div>
              </>
            ) : (
              <>
                <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
                  {stickyContextModel ? <StickyContext data-testid="files-sticky-context" model={stickyContextModel} t={t} /> : null}
                  <Editor
                    theme={monacoTheme}
                    beforeMount={handleMonacoBeforeMount}
                    language={editorLanguage}
                    value={fileContent ?? ""}
                    options={buildMonacoEditorOptions({
                      readOnly: false,
                      lineNumbersEnabled,
                      wordWrapEnabled,
                      minimapSettings
                    })}
                    onChange={(value) => onEditorChange(value)}
                    onMount={(editor, monaco) => handleStandardEditorMount(editor as unknown as MonacoEditorRef, monaco)}
                  />
                </div>
              </>
            )}
          </div>

          {diagnostics.length ? (
            <div className="adl-tool-diagnostics">
              <h5>{t.diagnostics}</h5>
              <ul>
                {diagnostics.map((diagnostic) => (
                  <li key={diagnostic.id}>
                    <button
                      type="button"
                      className="adl-tool-diagnostics__item"
                      onClick={() => {
                        if (diagnostic.path && diagnostic.path !== selectedFilePath) {
                          onOpenFileAtLine(diagnostic.path, diagnostic.line ?? 1);
                          return;
                        }
                        handleRevealLine(diagnostic.line ?? 1);
                      }}
                    >
                      <strong>{diagnostic.source}</strong>
                      <span>{diagnostic.message}</span>
                      <span>
                        {diagnostic.path ?? selectedFilePath}
                        {diagnostic.line ? `:${diagnostic.line}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
