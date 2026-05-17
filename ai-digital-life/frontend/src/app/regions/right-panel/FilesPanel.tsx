import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { CodeEditor, saveEditorState, getSavedEditorState } from "./CodeEditor";
import { DiffViewer } from "./DiffViewer";
import {
  getAgentDecorationExtensions,
  applyAgentDecorations,
  setAgentDecorationsEnabled,
  clearAgentDecorations,
  type AgentHunkDecoration,
} from "./agentDecorations";
import {
  estimateWrapColumn,
  getMinimapExtension,
  updateMinimapDiffHunks,
} from "./cmMinimap";
import { categorizeFile, type FileCategory } from "./fileTypeRouter";
import {
  LazyMarkdownPreviewWrapper,
  LazyDocxPreviewWrapper,
  LazyPdfPreviewWrapper,
} from "./LazyPreviews";
import type { EditorRef, DiffEditorRef } from "../../types";
import { normalizeWorkspaceRelativePath, detectEditorLanguage } from "../../workspacePaths";
import {
  getVisibleStartLine,
  navigateToLine,
  subscribeToEditor,
} from "./stickyContext";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconEye,
  IconFiles,
  IconFilePlus,
  IconFoldVertical,
  IconFolderPlus,
  IconHash,
  IconList,
  IconPanelLeftClose,
  IconMoreVertical,
  IconRefreshCw,
  IconReplace,
  IconReturn,
  IconSearch,
  IconUnfoldVertical
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore, type FilesNavigatorMode } from "../../ui-store";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import { StickyContext } from "./stickyContextView";
import { collectDirectoryPaths, FileTree } from "./fileTree";
import { OutlineTree } from "./OutlineTree";
import { getDefaultExpandedOutlineIds } from "./outlineModel";
import {
  derivePatchHunkChangeKind,
  getPatchHunkTargetLine,
  summarizePatchFile
} from "./patchReview";
import type { PreviewDiffVisualRange } from "./changePreviewDiffRanges";
import { computePreviewDiffMinimapModel } from "./changePreviewDiffRanges";
import {
  buildStickyContextEntries,
  createStickyContextModel,
  type StickyContextModel,
} from "./stickyContext";
import type { RightPanelViewProps } from "./types";

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

function buildEditorOptions(options: {
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
}) {
  return {
    readOnly: options.readOnly,
    lineNumbers: options.lineNumbersEnabled,
    wordWrap: options.wordWrapEnabled,
  };
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
  const [fileDiffMinimapExpandedUnchanged, setFileDiffMinimapExpandedUnchanged] = useState(false);
  const [fileDiffWrapColumn, setFileDiffWrapColumn] = useState<number | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [agentAnnotationsEnabled, setAgentAnnotationsEnabled] = useState(true);
  const navigatorMode = useUiStore((state) => state.filesNavigatorMode);
  const setNavigatorMode = useUiStore((state) => state.setFilesNavigatorMode);
  const filePreviewModeByPath = useUiStore((state) => state.filePreviewModeByPath);
  const setFilePreviewModeForPath = useUiStore((state) => state.setFilePreviewModeForPath);
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
  const agentDecorationsEnabledRef = useRef(agentAnnotationsEnabled);
  agentDecorationsEnabledRef.current = agentAnnotationsEnabled;
  const cmViewRef = useRef<EditorView | null>(null);
  const localDiffEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const [stickyContextModel, setStickyContextModel] = useState<StickyContextModel | null>(null);
  const stickyContextFrameRef = useRef<number | null>(null);
  const stickyContextKeyRef = useRef<string>("");
  const [stickyEditorReady, setStickyEditorReady] = useState(0);
  const resolvedTheme = appInfo?.config.resolvedTheme === "dark" ? "dark" : "light";
  const resolvedLocale = appInfo?.config.language ?? "zh-CN";
  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);
  const previewEnabled = selectedFilePath
    ? filePreviewModeByPath[selectedFilePath] ?? (fileCategory === "markdown")
    : false;
  const setPreviewEnabled = useCallback(
    (enabled: boolean) => {
      if (!selectedFilePath) {
        return;
      }
      setFilePreviewModeForPath(selectedFilePath, enabled);
    },
    [selectedFilePath, setFilePreviewModeForPath]
  );
  const dirtyPaths = useMemo(
    () => new Set(dirtyEditorPaths.map((pathValue) => normalizeWorkspaceRelativePath(pathValue))),
    [dirtyEditorPaths]
  );
  const directoryPaths = useMemo(() => collectDirectoryPaths(workspaceTree), [workspaceTree]);
  const hasExpandedDirectories = useMemo(
    () => directoryPaths.some((pathValue) => expandedPaths[pathValue]),
    [directoryPaths, expandedPaths]
  );
  const defaultExpandedOutlineIds = useMemo(() => getDefaultExpandedOutlineIds(outline), [outline]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(() => defaultExpandedOutlineIds);
  useEffect(() => {
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);
  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;
  const canToggleNavigatorStructure = navigatorMode === "tree"
    ? directoryPaths.length > 0
    : navigatorMode === "outline"
      ? hasExpandableOutlineItems
      : false;
  const structureToggleExpanded = navigatorMode === "tree"
    ? hasExpandedDirectories
    : hasExpandedOutlineItems;
  const selectedAbsolutePath = useMemo(() => {
    const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
    if (!rootPath || !selectedFilePath) {
      return undefined;
    }
    const separator = rootPath.includes("\\") ? "\\" : "/";
    const normalizedRelative = selectedFilePath.split("/").join(separator);
    return `${rootPath}${rootPath.endsWith(separator) ? "" : separator}${normalizedRelative}`;
  }, [appInfo?.currentWorkspace?.path, appInfo?.currentWorkspace?.rootPath, selectedFilePath]);
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
  const agentHunkDecorations = useMemo<AgentHunkDecoration[]>(() => {
    if (!activeFilePatch || !selectedFilePath) return [];
    return activeFilePatch.hunks.map((hunk) => {
      const changeKind = derivePatchHunkChangeKind(hunk);
      const startLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
      const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
      const endLine = startLine + lineSpan - 1;
      return {
        startLine,
        endLine,
        changeKind,
        decision: hunk.decision === "accepted" ? "accepted" : hunk.decision === "rejected" ? "rejected" : "pending" as const,
        isSelected: props.selectedPatchHunkId === hunk.id,
        hunkId: hunk.id,
      };
    });
  }, [activeFilePatch, props.selectedPatchHunkId, selectedFilePath]);

  const fileEditorMinimapScopeId = useMemo(
    () => selectedFilePath ? `files:${selectedFilePath}:editor` : "files:unselected:editor",
    [selectedFilePath]
  );
  const fileDiffMinimapScopeId = useMemo(
    () => selectedFilePath ? `files:${selectedFilePath}:diff` : "files:unselected:diff",
    [selectedFilePath]
  );
  const editorExtensions = useMemo(() => [
    ...getAgentDecorationExtensions(),
    ...getMinimapExtension({ scopeId: fileEditorMinimapScopeId }),
  ], [fileEditorMinimapScopeId]);
  const diffEditorExtensions = useMemo(() => [
    ...getAgentDecorationExtensions(),
  ], []);
  const fileDiffMinimapModel = useMemo(
    () => filePatch && filePatch.relativePath === selectedFilePath
      ? computePreviewDiffMinimapModel(filePatch.beforeContent, filePatch.afterContent, {
        wrapColumn: fileDiffWrapColumn,
      })
      : undefined,
    [fileDiffWrapColumn, filePatch, selectedFilePath]
  );
  const handleFileDiffMinimapDragStart = useCallback(() => {
    setFileDiffMinimapExpandedUnchanged(true);
  }, []);

  useEffect(() => {
    setFileDiffMinimapExpandedUnchanged(false);
  }, [diffSideBySide, filePatch?.relativePath, selectedFilePath]);

  const getStickySourceEditor = useCallback((): EditorRef | null => {
    if (filePatch && filePatch.relativePath === selectedFilePath) {
      const diffRef = localDiffEditorRef.current;
      if (diffRef && "getModifiedEditor" in diffRef) {
        return (diffRef as DiffEditorRef).getModifiedEditor();
      }
      if (diffRef && "getVisibleRanges" in diffRef) {
        return diffRef as EditorRef;
      }
      return null;
    }
    return props.standardEditorRef.current;
  }, [filePatch, props.standardEditorRef, selectedFilePath]);

  useEffect(() => {
    let frame = 0;
    const updateWrapColumn = () => {
      const editor = getStickySourceEditor();
      const domNode = editor?.getDomNode?.();
      const view = domNode ? EditorView.findFromDOM(domNode) ?? null : null;
      setFileDiffWrapColumn(wordWrapEnabled && view ? estimateWrapColumn(view) : null);
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
    const editor = getStickySourceEditor();
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
  }, [diffSideBySide, getStickySourceEditor, selectedFilePath, stickyEditorReady, wordWrapEnabled]);

  useEffect(() => {
    const view = cmViewRef.current;
    if (!view) return;
    if (filePatch && filePatch.relativePath === selectedFilePath) {
      clearAgentDecorations(view);
      return;
    }
    if (!agentDecorationsEnabledRef.current || agentHunkDecorations.length === 0) {
      clearAgentDecorations(view);
      return;
    }
    applyAgentDecorations(view, agentHunkDecorations);
    updateMinimapDiffHunks(view, agentHunkDecorations);
    return () => {
      if (cmViewRef.current) {
        clearAgentDecorations(cmViewRef.current);
      }
    };
  }, [agentHunkDecorations, filePatch, selectedFilePath]);

  useEffect(() => {
    const view = cmViewRef.current;
    if (!view) return;
    setAgentDecorationsEnabled(view, agentAnnotationsEnabled);
  }, [agentAnnotationsEnabled]);

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
    navigateToLine(editor, line);
  }, [activeFilePatch, getStickySourceEditor, props.selectedPatchHunkId]);

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

  const prevFilePathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (prevFilePathRef.current && prevFilePathRef.current !== selectedFilePath && cmViewRef.current) {
      saveEditorState(prevFilePathRef.current, cmViewRef.current);
    }
    prevFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

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
      searchPattern.lastIndex = 0;
      return searchPattern.test(`${result.path}\n${result.preview}`);
    });
  }, [searchPattern, searchQuery, searchResults]);
  const handleCopyPath = async (value?: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
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

  const handleRevealPreviewLine = (line: number): boolean => {
    const target = editorSurfaceRef.current?.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
    if (!target) {
      return false;
    }
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  };

  const handleRevealLine = (line: number) => {
    if (fileCategory === "markdown" && previewEnabled && handleRevealPreviewLine(line)) {
      return;
    }
    navigateToLine(getStickySourceEditor(), line);
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
  const handleToggleAllOutlineItems = () => {
    if (!hasExpandableOutlineItems) {
      return;
    }
    setExpandedOutlineIds(hasExpandedOutlineItems ? new Set() : new Set(defaultExpandedOutlineIds));
  };
  const handleToggleNavigatorStructure = () => {
    if (navigatorMode === "tree") {
      handleToggleAllDirectories();
      return;
    }
    if (navigatorMode === "outline") {
      handleToggleAllOutlineItems();
    }
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
  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: setFilesNavigatorWidth,
    minWidth: 180,
    maxWidth: 420
  });
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
    (editor: EditorRef) => {
      const domNode = editor.getDomNode?.();
      cmViewRef.current = domNode ? EditorView.findFromDOM(domNode) ?? null : null;
      props.standardEditorRef.current = editor;
      onEditorMount(editor);
      setStickyEditorReady((value) => value + 1);
    },
    [onEditorMount]
  );

  const handleDiffEditorMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      localDiffEditorRef.current = editor;
      let editorRef: EditorRef;
      if ("getModifiedEditor" in editor) {
        editorRef = (editor as DiffEditorRef).getModifiedEditor() ?? (editor as unknown as EditorRef);
      } else {
        editorRef = editor as unknown as EditorRef;
      }
      onDiffMount(editorRef);
      setStickyEditorReady((value) => value + 1);
    },
    [onDiffMount]
  );

  const refreshStickyContext = useCallback(() => {
    if (!selectedFilePath) {
      stickyContextKeyRef.current = "";
      setStickyContextModel(null);
      return;
    }

    const editor = getStickySourceEditor();
    const visibleStartLine = getVisibleStartLine(editor) ?? editor?.getSelection?.()?.startLineNumber ?? 1;
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
    const nextContextKey = `${selectedFilePath}:${visibleStartLine}:${contextEntries
      .map((entry) => `${entry.line}:${entry.kind}:${entry.tone}:${entry.label}:${entry.detail ?? ""}`)
      .join("|")}`;
    if (stickyContextKeyRef.current === nextContextKey) {
      return;
    }
    stickyContextKeyRef.current = nextContextKey;

    setStickyContextModel(createStickyContextModel({
      contextEntries,
      activeLine: visibleStartLine,
      canScrollToTop: visibleStartLine > 1,
      onNavigateLine: (line) => navigateToLine(getStickySourceEditor(), line),
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
      stickyContextKeyRef.current = "";
      setStickyContextModel(null);
      return;
    }

    const queueRefreshStickyContext = () => {
      if (stickyContextFrameRef.current !== null) {
        return;
      }
      stickyContextFrameRef.current = window.requestAnimationFrame(() => {
        stickyContextFrameRef.current = null;
        refreshStickyContext();
      });
    };

    queueRefreshStickyContext();
    const editor = getStickySourceEditor();
    if (!editor) {
      return;
    }

    const disposables = [
      editor.onDidScrollChange?.(queueRefreshStickyContext),
      editor.onDidChangeHiddenAreas?.(queueRefreshStickyContext),
      editor.onDidLayoutChange?.(queueRefreshStickyContext)
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const shell = editorSurfaceRef.current;
    const observer =
      shell && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => queueRefreshStickyContext())
        : null;
    if (observer && shell) {
      observer.observe(shell);
    }

    window.addEventListener("resize", queueRefreshStickyContext);
    return () => {
      disposables.forEach((disposable) => disposable.dispose());
      observer?.disconnect();
      window.removeEventListener("resize", queueRefreshStickyContext);
      if (stickyContextFrameRef.current !== null) {
        window.cancelAnimationFrame(stickyContextFrameRef.current);
        stickyContextFrameRef.current = null;
      }
    };
  }, [getStickySourceEditor, refreshStickyContext, selectedFilePath, stickyEditorReady, wordWrapEnabled, diffSideBySide]);

  const editorOptions = buildEditorOptions({
    readOnly: false,
    lineNumbersEnabled,
    wordWrapEnabled,
  });

  const diffEditorOptions = buildEditorOptions({
    readOnly: true,
    lineNumbersEnabled,
    wordWrapEnabled,
  });

  const renderEditorSurface = () => {
    if (!selectedFilePath) {
      return null;
    }

    if (filePatch && filePatch.relativePath === selectedFilePath) {
      return (
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
            <DiffViewer
              original={filePatch.beforeContent}
              modified={filePatch.afterContent}
              language={editorLanguage}
              theme={resolvedTheme}
              locale={resolvedLocale}
              sideBySide={diffSideBySide}
              fileKey={selectedFilePath}
              collapseUnchanged={!fileDiffMinimapExpandedUnchanged}
              readOnly={diffEditorOptions.readOnly}
              lineNumbers={diffEditorOptions.lineNumbers}
              wordWrap={diffEditorOptions.wordWrap}
              onMount={handleDiffEditorMount}
              extensions={diffEditorExtensions}
              minimapModel={fileDiffMinimapModel}
              minimapScopeId={fileDiffMinimapScopeId}
              onMinimapDragStart={handleFileDiffMinimapDragStart}
            />
          </div>
        </>
      );
    }

    if (fileCategory === "markdown" && previewEnabled) {
      return (
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface adl-tool-editor__surface--preview">
          <LazyMarkdownPreviewWrapper content={fileContent ?? ""} theme={resolvedTheme} />
        </div>
      );
    }

    if (fileCategory === "docx") {
      return (
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface adl-tool-editor__surface--preview">
          <div className="adl-unsupported-preview">
            <svg className="adl-unsupported-preview__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 15h6" /></svg>
            <span className="adl-unsupported-preview__text">DOCX 文档</span>
            <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
          </div>
        </div>
      );
    }

    if (fileCategory === "pdf") {
      return (
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface adl-tool-editor__surface--preview">
          <div className="adl-unsupported-preview">
            <svg className="adl-unsupported-preview__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
            <span className="adl-unsupported-preview__text">PDF 文档</span>
            <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
          </div>
        </div>
      );
    }

    if (fileCategory === "binary") {
      return (
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface adl-tool-editor__surface--preview">
          <div className="adl-unsupported-preview">
            <svg className="adl-unsupported-preview__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h.01" /><path d="M10 12h.01" /><path d="M14 12h4" /></svg>
            <span className="adl-unsupported-preview__text">二进制文件</span>
            <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
          </div>
        </div>
      );
    }

    return (
      <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
        {stickyContextModel ? <StickyContext data-testid="files-sticky-context" model={stickyContextModel} t={t} /> : null}
        <CodeEditor
          value={fileContent ?? ""}
          language={editorLanguage}
          theme={resolvedTheme}
          locale={resolvedLocale}
          readOnly={previewEnabled || editorOptions.readOnly}
          lineNumbers={editorOptions.lineNumbers}
          wordWrap={editorOptions.wordWrap}
          fileKey={selectedFilePath}
          onChange={onEditorChange}
          onMount={handleStandardEditorMount}
          extensions={editorExtensions}
        />
      </div>
    );
  };

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
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>

          <TooltipSimple content={navigatorMode === "search" ? t.browserBack : t.search} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => setNavigatorMode(navigatorMode === "search" ? "tree" : "search")}
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
          <div className="adl-tool-context__divider" />
          <TooltipSimple content={previewEnabled ? t.filePreview : t.fileEdit} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn${previewEnabled ? " is-active" : ""}`}
              onClick={() => setPreviewEnabled(!previewEnabled)}
              aria-label={previewEnabled ? t.filePreview : t.fileEdit}
              aria-pressed={previewEnabled ? "true" : "false"}
            >
              <IconEye size={14} decorative />
            </button>
          </TooltipSimple>
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
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${filesNavigatorWidth}px` } as React.CSSProperties}
      >
        <aside className="adl-tool-navigator" aria-label={navigatorTitle}>
          <div className="adl-tool-navigator__context">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
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
            </div>
          </div>

          <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
              <TooltipSimple content={t.fileTreeView} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "tree" ? " is-active" : ""}`}
                  onClick={() => setNavigatorMode("tree")}
                  aria-label={t.fileTreeView}
                  aria-pressed={navigatorMode === "tree" ? "true" : "false"}
                >
                  <IconFiles size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={outline.length > 0 ? t.outline : t.toolFiles} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === "outline" ? " is-active" : ""}`}
                  onClick={() => setNavigatorMode("outline")}
                  aria-label={outline.length > 0 ? t.outline : t.toolFiles}
                  aria-pressed={navigatorMode === "outline" ? "true" : "false"}
                >
                  <IconList size={14} decorative />
                </button>
              </TooltipSimple>
            </div>

            <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
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
                  expandLabel={t.expandDetails}
                  collapseLabel={t.collapseDetails}
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
              <OutlineTree
                items={outline}
                onNavigate={(line) => handleRevealLine(line)}
                expandLabel={t.expandDetails}
                collapseLabel={t.collapseDetails}
                expandedIds={expandedOutlineIds}
                onExpandedIdsChange={setExpandedOutlineIds}
              />
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
            {renderEditorSurface()}
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
