import React, { useEffect, useMemo, useRef, useState } from "react";
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
import type { RightPanelViewProps } from "./types";

type FilesNavigatorMode = "tree" | "search" | "outline";

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
    <li className="adl-filetree__item">
      <button
        type="button"
        className={`adl-filetree__node${isSelected ? " is-active" : ""}${isDirectory ? " adl-filetree__node--directory" : ""}`}
        style={{ "--adl-filetree-depth": depth } as React.CSSProperties}
        onClick={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
      >
        <span className="adl-filetree__node-main">
          {isDirectory ? (
            <span className="adl-filetree__chevron">
              {isExpanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
            </span>
          ) : (
            <>
              <span className="adl-filetree__chevron adl-filetree__chevron--empty" />
              <span className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? "default"}`}>
                <span className="adl-filetree__file-badge" aria-hidden="true">
                  {fileVisual?.label ?? "FILE"}
                </span>
              </span>
            </>
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
    onReloadExternal,
    onEditorChange,
    onEditorMount,
    onDiffMount,
    onSearch,
    onSearchChange,
    onRefreshWorkspaceTree,
    onSetDiffLayout
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<FilesNavigatorMode>("tree");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(false);
  const [lineNumbersEnabled, setLineNumbersEnabled] = useState(true);
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
  const [fileHistory, setFileHistory] = useState<string[]>([]);
  const [fileHistoryIndex, setFileHistoryIndex] = useState(-1);
  const fileHistoryNavRef = useRef(false);
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
  useEffect(() => {
    if (selectedFilePath) {
      expandFileTreePathChain(selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath]);

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
  const handleToggleAllDirectories = () => {
    if (!hasExpandedDirectories) {
      directoryPaths.forEach((pathValue) => setFileTreePathExpanded(pathValue, true));
      return;
    }
    collapseAllFileTreePaths();
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
    }
  ];

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
                aria-expanded={fileMenuOpen}
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
                      aria-checked={item.id === "line-numbers" ? lineNumbersEnabled : item.id === "word-wrap" ? wordWrapEnabled : undefined}
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

            <div className="adl-tool-navigator__context-group">
              <TooltipSimple content={t.fileRefresh} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  onClick={onRefreshWorkspaceTree}
                  aria-label={t.fileRefresh}
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.fileNewFile} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  aria-label={t.fileNewFile}
                  disabled
                >
                  <IconFilePlus size={14} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t.fileNewFolder} placement="top">
                <button
                  type="button"
                  className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                  aria-label={t.fileNewFolder}
                  disabled
                >
                  <IconFolderPlus size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>

          {navigatorMode === "tree" ? (
            workspaceTree.length > 0 ? (
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
              <p className="adl-empty-hint">{t.workspaceEmpty}</p>
            )
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
                        aria-pressed={matchCase}
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
                        aria-pressed={matchWholeWord}
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
                        aria-pressed={useRegex}
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
                  aria-expanded={replaceOpen}
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
                      <button type="button" className="adl-tool-list__item" onClick={() => onOpenFile(result.path)}>
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
                    <button type="button" className="adl-tool-list__item">
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
          {externalChangePath === selectedFilePath ? (
            <div className="adl-banner adl-banner--warning" role="alert">
              <IconAlertTriangle size={14} decorative />
              <div>
                <strong>{t.externalChange}</strong>
                <span>{t.externalFileChanged}</span>
              </div>
              <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onReloadExternal}>
                {t.reloadFile}
              </button>
            </div>
          ) : null}

          {editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null}

          <div className="adl-tool-editor" data-testid="editor-shell">
            {filePatch && filePatch.relativePath === selectedFilePath ? (
              <>
                <div className="adl-diff-toolbar" role="group" aria-label={t.diffLayoutLabel}>
                  <span className="adl-diff-toolbar__label">{t.diffLayoutLabel}</span>
                  <div className="adl-segmented">
                    <button type="button" aria-pressed={!diffSideBySide} onClick={() => onSetDiffLayout(false)}>
                      {t.diffLayoutInline}
                    </button>
                    <button type="button" aria-pressed={diffSideBySide} onClick={() => onSetDiffLayout(true)}>
                      {t.diffLayoutSideBySide}
                    </button>
                  </div>
                </div>
                <DiffEditor
                  language={editorLanguage}
                  original={filePatch.beforeContent}
                  modified={filePatch.afterContent}
                  options={{
                    readOnly: true,
                    lineNumbers: lineNumbersEnabled ? "on" : "off",
                    minimap: { enabled: false },
                    renderSideBySide: diffSideBySide,
                    scrollBeyondLastLine: false,
                    wordWrap: wordWrapEnabled ? "on" : "off"
                  }}
                  onMount={(editor) => onDiffMount(editor as unknown as MonacoEditorRef)}
                />
              </>
            ) : (
              <Editor
                language={editorLanguage}
                value={fileContent ?? ""}
                options={{
                  readOnly: false,
                  lineNumbers: lineNumbersEnabled ? "on" : "off",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: wordWrapEnabled ? "on" : "off"
                }}
                onChange={(value) => onEditorChange(value)}
                onMount={(editor, monaco) => onEditorMount(editor as unknown as MonacoEditorRef, monaco)}
              />
            )}
          </div>

          {diagnostics.length ? (
            <div className="adl-tool-diagnostics">
              <h5>{t.diagnostics}</h5>
              <ul>
                {diagnostics.map((diagnostic) => (
                  <li key={diagnostic.id}>
                    <strong>{diagnostic.source}</strong>
                    <span>{diagnostic.message}</span>
                    <span>
                      {diagnostic.path ?? selectedFilePath}
                      {diagnostic.line ? `:${diagnostic.line}` : ""}
                    </span>
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
