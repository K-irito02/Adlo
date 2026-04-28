import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { WorkspaceTreeNode } from "@ai-digital-life/kernel";
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
import { getFileTreeVisualSpec } from "./fileTreeVisuals";
import {
  derivePatchHunkChangeKind,
  getPatchHunkTargetLine,
  summarizePatchFile
} from "./patchReview";
import type { RightPanelViewProps } from "./types";

type FilesNavigatorMode = "tree" | "search" | "outline";

const MONACO_THEME_LIGHT = "adl-light";
const MONACO_THEME_DARK = "adl-dark";
const FOLDING_CONTROL_SELECTOR =
  ".codicon-folding-manual-collapsed, .codicon-folding-manual-expanded, .codicon-folding-expanded, .codicon-folding-collapsed";

type MonacoNamespace = {
  editor?: {
    defineTheme?: (
      name: string,
      data: {
        base: "vs" | "vs-dark";
        inherit: boolean;
        rules: Array<{ token: string; foreground?: string; background?: string }>;
        colors: Record<string, string>;
      }
    ) => void;
    setTheme?: (theme: string) => void;
  };
};

type DisposableLike = {
  dispose: () => void;
};

function normalizeHexColor(value: string): string | undefined {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return undefined;

  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toLowerCase()}`;
  }
  return `#${hex.toLowerCase()}`;
}

function toHexByte(value: number): string {
  const bounded = Math.min(255, Math.max(0, Math.round(value)));
  return bounded.toString(16).padStart(2, "0");
}

function normalizeRgbColor(value: string): string | undefined {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:(?:\s*,\s*|\s*\/\s*)([\d.]+%?))?\s*\)$/i);
  if (!match) return undefined;

  const [, rRaw, gRaw, bRaw, alphaRaw] = match;
  const r = Number.parseInt(rRaw, 10);
  const g = Number.parseInt(gRaw, 10);
  const b = Number.parseInt(bRaw, 10);
  const alpha =
    alphaRaw == null
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);

  if ([r, g, b, alpha].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  const alphaByte = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${alphaByte < 255 ? toHexByte(alphaByte) : ""}`;
}

function normalizeMonacoColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "transparent") {
    return "#00000000";
  }
  return normalizeHexColor(trimmed) ?? normalizeRgbColor(trimmed);
}

function readThemeColor(theme: "light" | "dark", name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", theme);
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.color = `var(${name})`;

  const container = document.body ?? document.documentElement;
  container.appendChild(probe);
  try {
    const computed = getComputedStyle(probe);
    return normalizeMonacoColor(computed.color) ?? normalizeMonacoColor(computed.getPropertyValue(name));
  } finally {
    container.removeChild(probe);
  }
}

function buildMonacoThemeData(theme: "light" | "dark"): {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; background?: string }>;
  colors: Record<string, string>;
} {
  const base = theme === "dark" ? "vs-dark" : "vs";

  const bg = readThemeColor(theme, "--editor-bg") ?? readThemeColor(theme, "--surface") ?? readThemeColor(theme, "--bg");
  const fg = readThemeColor(theme, "--editor-fg") ?? readThemeColor(theme, "--text-primary");
  const lineNumber = readThemeColor(theme, "--editor-lineNumber") ?? readThemeColor(theme, "--text-muted");
  const lineNumberActive = readThemeColor(theme, "--editor-lineNumber-active") ?? readThemeColor(theme, "--text-secondary");
  const cursor = readThemeColor(theme, "--editor-cursor") ?? fg;
  const selection = readThemeColor(theme, "--editor-selection");
  const selectionInactive = readThemeColor(theme, "--editor-selection-inactive");
  const lineHighlight = readThemeColor(theme, "--editor-lineHighlight");
  const findMatch = readThemeColor(theme, "--editor-findMatch");
  const findMatchHighlight = readThemeColor(theme, "--editor-findMatch-highlight");
  const hoverBg = readThemeColor(theme, "--editor-hover-bg") ?? readThemeColor(theme, "--surface-raised") ?? readThemeColor(theme, "--surface");
  const hoverBorder = readThemeColor(theme, "--editor-hover-border") ?? readThemeColor(theme, "--border-default") ?? readThemeColor(theme, "--border");
  const widgetBg = readThemeColor(theme, "--editor-widget-bg") ?? hoverBg;
  const widgetBorder = readThemeColor(theme, "--editor-widget-border") ?? hoverBorder;
  const indentGuide = readThemeColor(theme, "--editor-indentGuide");
  const indentGuideActive = readThemeColor(theme, "--editor-indentGuide-active");
  const whitespace = readThemeColor(theme, "--editor-whitespace");
  const diffInsertBg = readThemeColor(theme, "--editor-diff-insert-bg");
  const diffRemoveBg = readThemeColor(theme, "--editor-diff-remove-bg");
  const foldBackground = readThemeColor(theme, "--editor-fold-bg");
  const foldPlaceholderForeground = readThemeColor(theme, "--editor-fold-placeholder-fg");
  const foldingControl = readThemeColor(theme, "--editor-folding-control");
  const rangeHighlight = readThemeColor(theme, "--editor-range-highlight");
  const rangeHighlightBorder = readThemeColor(theme, "--editor-range-highlight-border");

  const syntaxComment = readThemeColor(theme, "--editor-syntax-comment");
  const syntaxKeyword = readThemeColor(theme, "--editor-syntax-keyword");
  const syntaxString = readThemeColor(theme, "--editor-syntax-string");
  const syntaxNumber = readThemeColor(theme, "--editor-syntax-number");
  const syntaxRegexp = readThemeColor(theme, "--editor-syntax-regexp");
  const syntaxType = readThemeColor(theme, "--editor-syntax-type");
  const syntaxFunction = readThemeColor(theme, "--editor-syntax-function");
  const syntaxVariable = readThemeColor(theme, "--editor-syntax-variable");

  const colors: Record<string, string> = {};
  if (bg) {
    colors["editor.background"] = bg;
    colors["editorGutter.background"] = bg;
    colors["minimap.background"] = bg;
  }
  if (fg) {
    colors["editor.foreground"] = fg;
  }
  if (cursor) {
    colors["editorCursor.foreground"] = cursor;
  }
  if (lineNumber) {
    colors["editorLineNumber.foreground"] = lineNumber;
  }
  if (lineNumberActive) {
    colors["editorLineNumber.activeForeground"] = lineNumberActive;
  }
  if (selection) {
    colors["editor.selectionBackground"] = selection;
  }
  if (selectionInactive) {
    colors["editor.inactiveSelectionBackground"] = selectionInactive;
  }
  if (lineHighlight) {
    colors["editor.lineHighlightBackground"] = lineHighlight;
  }
  if (indentGuide) {
    colors["editorIndentGuide.background"] = indentGuide;
  }
  if (indentGuideActive) {
    colors["editorIndentGuide.activeBackground"] = indentGuideActive;
  }
  if (whitespace) {
    colors["editorWhitespace.foreground"] = whitespace;
  }
  if (findMatch) {
    colors["editor.findMatchBackground"] = findMatch;
  }
  if (findMatchHighlight) {
    colors["editor.findMatchHighlightBackground"] = findMatchHighlight;
  }
  // Override Monaco defaults so folded ranges and active editor states stay calm in both themes.
  if (foldBackground) {
    colors["editor.foldBackground"] = foldBackground;
  }
  if (foldPlaceholderForeground ?? lineNumberActive ?? fg) {
    colors["editor.foldPlaceholderForeground"] =
      foldPlaceholderForeground ?? lineNumberActive ?? fg ?? "inherit";
  }
  colors["editor.lineHighlightBorder"] = "#00000000";
  colors["editor.selectionHighlightBackground"] = "#00000000";
  colors["editor.selectionHighlightBorder"] = "#00000000";
  colors["editor.wordHighlightBackground"] = "#00000000";
  colors["editor.wordHighlightBorder"] = "#00000000";
  colors["editor.wordHighlightStrongBackground"] = "#00000000";
  colors["editor.wordHighlightStrongBorder"] = "#00000000";
  colors["editor.wordHighlightTextBackground"] = "#00000000";
  colors["editor.wordHighlightTextBorder"] = "#00000000";
  colors["editorBracketMatch.background"] = "#00000000";
  colors["editorBracketMatch.border"] = "#00000000";
  if (foldingControl) {
    colors["editorGutter.foldingControlForeground"] = foldingControl;
  }
  if (rangeHighlight) {
    colors["editor.rangeHighlightBackground"] = rangeHighlight;
  }
  if (rangeHighlightBorder) {
    colors["editor.rangeHighlightBorder"] = rangeHighlightBorder;
  }
  if (hoverBg) {
    colors["editorHoverWidget.background"] = hoverBg;
  }
  if (hoverBorder) {
    colors["editorHoverWidget.border"] = hoverBorder;
  }
  if (widgetBg) {
    colors["editorWidget.background"] = widgetBg;
    colors["editorSuggestWidget.background"] = widgetBg;
  }
  if (widgetBorder) {
    colors["editorWidget.border"] = widgetBorder;
    colors["editorSuggestWidget.border"] = widgetBorder;
  }
  if (diffInsertBg) {
    colors["diffEditor.insertedTextBackground"] = diffInsertBg;
    colors["diffEditor.insertedLineBackground"] = diffInsertBg;
  }
  if (diffRemoveBg) {
    colors["diffEditor.removedTextBackground"] = diffRemoveBg;
    colors["diffEditor.removedLineBackground"] = diffRemoveBg;
  }

  const rules: Array<{ token: string; foreground?: string; background?: string }> = [];
  const pushRule = (token: string, foreground?: string) => {
    if (!foreground) return;
    rules.push({ token, foreground: foreground.replace(/^#/, "") });
  };
  pushRule("comment", syntaxComment);
  pushRule("keyword", syntaxKeyword);
  pushRule("string", syntaxString);
  pushRule("number", syntaxNumber);
  pushRule("regexp", syntaxRegexp);
  pushRule("type", syntaxType);
  pushRule("function", syntaxFunction);
  pushRule("variable", syntaxVariable);

  return { base, inherit: true, rules, colors };
}

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

function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = [];
  const visit = (items: WorkspaceTreeNode[]) => {
    items.forEach((item) => {
      if (item.kind === "directory") {
        paths.push(item.path);
        if (item.children.length > 0) {
          visit(item.children);
        }
      }
    });
  };
  visit(nodes);
  return paths;
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
}) {
  return {
    readOnly: options.readOnly,
    lineNumbers: options.lineNumbersEnabled ? "on" : "off",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: options.wordWrapEnabled ? "on" : "off",
    folding: true,
    showFoldingControls: "mouseover",
    glyphMargin: true,
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

function TreeNode({
  node,
  depth,
  selectedFilePath,
  expandedPaths,
  dirtyPaths,
  externalChangePath,
  onToggle,
  onOpenFile
}: {
  node: WorkspaceTreeNode;
  depth: number;
  selectedFilePath?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
}) {
  const isDirectory = node.kind === "directory";
  const isExpanded = expandedPaths[node.path] ?? false;
  const isSelected = node.path === selectedFilePath;
  const isDirty = dirtyPaths.has(node.path);
  const isExternal = node.path === externalChangePath;
  const fileVisual = isDirectory ? undefined : getFileTreeVisualSpec(node);

  return (
    <li
      className="adl-filetree__item"
      style={{ "--adl-filetree-hover-offset": `${depth * 14}px` } as React.CSSProperties}
    >
      <button
        type="button"
        className={`adl-filetree__node${isSelected ? " is-active" : ""}${isDirectory ? " adl-filetree__node--directory" : ""}`}
        onClick={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
      >
        <span className="adl-filetree__node-main">
          {isDirectory ? (
            <span className="adl-filetree__chevron">
              {isExpanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
            </span>
          ) : (
            <span className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? "default"}`}>
              <span className="adl-filetree__file-badge" aria-hidden="true">
                {fileVisual?.label ?? "FILE"}
              </span>
            </span>
          )}
          <span className="adl-filetree__label">{node.name}</span>
        </span>
        <span className="adl-filetree__meta">
          {isExternal ? <IconAlertTriangle size={12} decorative /> : null}
          {isDirty ? <IconCircle size={12} decorative className="adl-filetree__dirty-dot" /> : null}
        </span>
      </button>
      {isDirectory && isExpanded && node.children.length > 0 ? (
        <ul className="adl-filetree__children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFilePath={selectedFilePath}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
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
  const [agentAnnotationsEnabled, setAgentAnnotationsEnabled] = useState(true);
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
  const foldingTooltipControllerDisposablesRef = useRef<DisposableLike[]>([]);
  const activeFilePatch = useMemo(() => {
    if (!props.activePatchSet || !props.selectedPatchFilePath) return undefined;
    return props.activePatchSet.filePatches.find((candidate) => candidate.relativePath === props.selectedPatchFilePath);
  }, [props.activePatchSet, props.selectedPatchFilePath]);
  const activeFilePatchSummary = useMemo(
    () => (activeFilePatch ? summarizePatchFile(activeFilePatch, props.collapsedPatchHunkIds) : undefined),
    [activeFilePatch, props.collapsedPatchHunkIds]
  );

  const applyAgentDecorations = useCallback(() => {
    const editor = props.standardEditorRef.current as any;
    if (!editor?.deltaDecorations) return;

    if (!agentDecorationsEnabledRef.current || !activeFilePatch || !selectedFilePath) {
      agentDecorationIdsRef.current = editor.deltaDecorations(agentDecorationIdsRef.current, []);
      return;
    }

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
          hoverMessage: hover as any
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
    monaco.editor?.defineTheme?.(MONACO_THEME_LIGHT, buildMonacoThemeData("light"));
    monaco.editor?.defineTheme?.(MONACO_THEME_DARK, buildMonacoThemeData("dark"));
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
    const editor = props.diffEditorRef.current ?? props.standardEditorRef.current;
    editor?.revealLinesInCenter?.(line, line + Math.max(selectedHunk.newLines, 1));
    editor?.revealLineInCenter(line);
    editor?.setPosition?.({ lineNumber: line, column: 1 });
  }, [activeFilePatch, props.diffEditorRef, props.selectedPatchHunkId, props.standardEditorRef]);

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
    const editor = props.diffEditorRef.current ?? props.standardEditorRef.current;
    editor?.revealLineInCenter(line);
    editor?.setPosition?.({ lineNumber: line, column: 1 });
    editor?.focus?.();
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
    },
    [onEditorMount, replaceFoldingHintBindings]
  );

  const handleDiffEditorMount = useCallback(
    (editor: MonacoEditorRef) => {
      replaceFoldingHintBindings(editor as any);
      onDiffMount(editor);
    },
    [onDiffMount, replaceFoldingHintBindings]
  );

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
                <ul className="adl-filetree">
                  {workspaceTree.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedFilePath={selectedFilePath}
                      expandedPaths={expandedPaths}
                      dirtyPaths={dirtyPaths}
                      externalChangePath={externalChangePath}
                      onToggle={toggleFileTreePath}
                      onOpenFile={onOpenFile}
                    />
                  ))}
                </ul>
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

          <div className="adl-tool-editor" data-testid="editor-shell">
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
                    hideUnchangedRegions: hasCollapsedHunks
                  })}
                  onMount={(editor) => handleDiffEditorMount(editor as unknown as MonacoEditorRef)}
                />
              </>
            ) : (
              <Editor
                theme={monacoTheme}
                beforeMount={handleMonacoBeforeMount}
                language={editorLanguage}
                value={fileContent ?? ""}
                options={buildMonacoEditorOptions({
                  readOnly: false,
                  lineNumbersEnabled,
                  wordWrapEnabled
                })}
                onChange={(value) => onEditorChange(value)}
                onMount={(editor, monaco) => handleStandardEditorMount(editor as unknown as MonacoEditorRef, monaco)}
              />
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
