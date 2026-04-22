import React, { useEffect, useMemo, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { WorkspaceTreeNode } from "@ai-digital-life/kernel";
import type { MonacoEditorRef } from "../../types";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconFilePlus,
  IconFileText,
  IconFiles,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconPanelLeft,
  IconPanelLeftClose,
  IconRefreshCw,
  IconSearch
} from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import { normalizeWorkspaceRelativePath } from "../../workspacePaths";
import type { RightPanelViewProps } from "./types";

type FilesNavigatorMode = "tree" | "search" | "outline";

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

  return (
    <li className="adl-filetree__item">
      <button
        type="button"
        className={`adl-filetree__node${isSelected ? " is-active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => (isDirectory ? onToggle(node.path) : onOpenFile(node.path))}
      >
        <span className="adl-filetree__node-main">
          {isDirectory ? (
            <>
              <span className="adl-filetree__chevron">
                {isExpanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
              </span>
              {isExpanded ? <IconFolderOpen size={12} decorative /> : <IconFolder size={12} decorative />}
            </>
          ) : (
            <>
              <span className="adl-filetree__chevron adl-filetree__chevron--empty" />
              <IconFileText size={12} decorative />
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
    editorTabs,
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
    onSendSelection,
    onSetDiffLayout
  } = props;
  const [navigatorMode, setNavigatorMode] = useState<FilesNavigatorMode>("tree");
  const navigatorCollapsed = useUiStore((state) => state.navigatorCollapsedByTool.files);
  const toggleNavigator = useUiStore((state) => state.toggleNavigator);
  const expandedPaths = useUiStore((state) => state.expandedFileTreePaths);
  const toggleFileTreePath = useUiStore((state) => state.toggleFileTreePath);
  const expandFileTreePathChain = useUiStore((state) => state.expandFileTreePathChain);
  const collapseAllFileTreePaths = useUiStore((state) => state.collapseAllFileTreePaths);
  const breadcrumbs = selectedFilePath?.split("/").filter(Boolean) ?? [];
  const dirtyPaths = useMemo(
    () => new Set(dirtyEditorPaths.map((pathValue) => normalizeWorkspaceRelativePath(pathValue))),
    [dirtyEditorPaths]
  );

  useEffect(() => {
    if (selectedFilePath) {
      expandFileTreePathChain(selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath]);

  const navigatorTitle =
    navigatorMode === "tree" ? t.toolFiles : navigatorMode === "search" ? t.searchResults : t.outline;

  return (
    <div className="adl-tool-panel adl-tool-panel--files">
      <div className="adl-tool-context">
        <div className="adl-tool-context__group adl-tool-context__group--grow">
          <div className="adl-breadcrumbs" aria-label={t.currentFilePath}>
            <span className="adl-breadcrumbs__root">{appInfo?.currentWorkspace?.name ?? t.workspaces}</span>
            {breadcrumbs.map((segment) => (
              <React.Fragment key={segment}>
                <span className="adl-breadcrumbs__sep">/</span>
                <span className="adl-breadcrumbs__segment">{segment}</span>
              </React.Fragment>
            ))}
          </div>
          <label className="adl-tool-search">
            <IconSearch size={12} decorative />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSearch(searchQuery);
                  setNavigatorMode("search");
                }
              }}
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
            />
          </label>
        </div>
        <div className="adl-tool-context__group">
          <TooltipSimple content={t.fileNewFile} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" disabled aria-label={t.fileNewFile}>
              <IconFilePlus size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileNewFolder} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" disabled aria-label={t.fileNewFolder}>
              <IconFolderPlus size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileRefresh} placement="top">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={onRefreshWorkspaceTree} aria-label={t.fileRefresh}>
              <IconRefreshCw size={12} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.searchAction} placement="top">
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => {
                onSearch(searchQuery);
                setNavigatorMode("search");
              }}
            >
              {t.searchAction}
            </button>
          </TooltipSimple>
        </div>
      </div>

      <div className={`adl-tool-surface${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}>
        <aside className="adl-tool-rail" aria-label={`${t.toolFiles} rail`}>
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={() => toggleNavigator("files")}>
              {navigatorCollapsed ? <IconPanelLeft size={14} decorative /> : <IconPanelLeftClose size={14} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.toolFiles} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "tree" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("tree")}
            >
              <IconFiles size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.searchResults} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "search" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("search")}
            >
              <IconSearch size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.outline} placement="right">
            <button
              type="button"
              className={`adl-tool-rail__btn${navigatorMode === "outline" ? " is-active" : ""}`}
              onClick={() => setNavigatorMode("outline")}
            >
              <IconFileText size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileCollapseAll} placement="right">
            <button type="button" className="adl-tool-rail__btn" onClick={collapseAllFileTreePaths}>
              <IconChevronDown size={14} decorative />
            </button>
          </TooltipSimple>
        </aside>

        <aside className="adl-tool-navigator" aria-label={navigatorTitle}>
          <header className="adl-tool-navigator__header">
            <strong>{navigatorTitle}</strong>
            {navigatorMode === "tree" ? (
              <span className="adl-tool-navigator__meta">{workspaceTree.length}</span>
            ) : navigatorMode === "search" ? (
              <span className="adl-tool-navigator__meta">{searchResults.length}</span>
            ) : (
              <span className="adl-tool-navigator__meta">{outline.length}</span>
            )}
          </header>

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
            searchResults.length > 0 ? (
              <ul className="adl-tool-list">
                {searchResults.map((result) => (
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
            )
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
        </aside>

        <div className="adl-tool-primary">
          <div className="adl-tool-primary__tabs" role="tablist" aria-label={t.filePreview}>
            {editorTabs.map((tab) => {
              const isDirty = dirtyPaths.has(tab.path);
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={tab.path === selectedFilePath}
                  className={tab.path === selectedFilePath ? "is-active" : ""}
                  onClick={() => onOpenFile(tab.path)}
                >
                  <IconFileText size={12} decorative />
                  <span>{tab.title}</span>
                  {isDirty ? <IconCircle size={12} decorative className="adl-tool-primary__tab-dirty" /> : null}
                </button>
              );
            })}
            <div className="adl-tool-primary__tabs-spacer" />
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={onSendSelection}
              disabled={!selectedFilePath}
            >
              {t.sendSelection}
            </button>
          </div>

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
                    minimap: { enabled: false },
                    renderSideBySide: diffSideBySide,
                    scrollBeyondLastLine: false
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
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false
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
