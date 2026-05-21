import React, { useCallback, useMemo, useRef } from "react";
import { EditorView } from "@codemirror/view";
import type { EditorRef, DiffEditorRef } from "../../types";
import { categorizeFile } from "./fileTypeRouter";
import { IconEye, IconPanelLeftClose, IconReturn, IconSearch } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore } from "../../ui-store";
import { useEditorOptions, useFileHistory } from "./hooks";
import { FileNavigatorShell } from "./FileNavigatorShell";
import { EditorSurfaceShell } from "./EditorSurfaceShell";
import { FileContextMenu, type FileMenuItem, type FileMenuDivider } from "./FileContextMenu";
import { FileHistoryNav } from "./FileHistoryNav";
import type { RightPanelViewProps } from "./types";
import { joinPathSegments } from "../../workspacePaths";

export function FilesPanel(props: RightPanelViewProps) {
  const {
    t,
    appInfo,
    selectedFilePath,
    fileContent,
    filePatch,
    editorLanguage,
    diffSideBySide,
    diagnostics,
    editorHint,
    outline,
    workspaceTree,
    searchQuery,
    searchResults,
    dirtyEditorPaths,
    externalChangePath,
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
    onSetDiffLayout,
    onJumpPatchHunk,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    activePatchSet,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
  } = props;

  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);

  const localDiffEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);

  const setFilePreviewModeForPath = useUiStore((s) => s.setFilePreviewModeForPath);
  const navigatorCollapsed = useUiStore((s) => s.navigatorCollapsedByTool.files);
  const toggleNavigator = useUiStore((s) => s.toggleNavigator);
  const navigatorMode = useUiStore((s) => s.filesNavigatorMode);
  const setNavigatorMode = useUiStore((s) => s.setFilesNavigatorMode);
  const filesNavigatorWidth = useUiStore((s) => s.filesNavigatorWidth);

  const editorOptions = useEditorOptions();
  const fileHistory = useFileHistory(selectedFilePath, onOpenFile);

  const hasActivePatch = !!(filePatch && filePatch.relativePath === selectedFilePath);

  const getStickySourceEditor = useCallback((): EditorRef | null => {
    if (hasActivePatch) {
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
  }, [hasActivePatch, props.standardEditorRef]);

  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);
  const previewEnabled = useUiStore(
    useCallback(
      (s) => selectedFilePath ? (s.filePreviewModeByPath[selectedFilePath] ?? (fileCategory === "markdown")) : false,
      [selectedFilePath, fileCategory]
    )
  );

  const setPreviewEnabled = useCallback(
    (enabled: boolean) => {
      if (!selectedFilePath) return;
      setFilePreviewModeForPath(selectedFilePath, enabled);
    },
    [selectedFilePath, setFilePreviewModeForPath],
  );

  const selectedAbsolutePath = useMemo(() => {
    const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
    if (!rootPath || !selectedFilePath) return undefined;
    return joinPathSegments(rootPath, selectedFilePath);
  }, [appInfo?.currentWorkspace?.path, appInfo?.currentWorkspace?.rootPath, selectedFilePath]);

  const activeFilePatch = useMemo(() => {
    if (!activePatchSet || !selectedPatchFilePath) return undefined;
    return activePatchSet.filePatches.find((c) => c.relativePath === selectedPatchFilePath);
  }, [activePatchSet, selectedPatchFilePath]);

  const handleCopyPath = async (value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
  };

  const handleNavigateLine = useCallback((line: number) => {
    const editor = getStickySourceEditor();
    if (editor) {
      editor.revealLineInCenter?.(line);
      editor.setPosition?.({ lineNumber: line, column: 1 });
      editor.focus?.();
    }
  }, [getStickySourceEditor]);

  const fileMenuItems: (FileMenuItem | FileMenuDivider)[] = [
    { id: "save", label: t.fileSave as string, shortcut: "Ctrl+S", disabled: true },
    { id: "discard", label: t.fileDiscardChanges as string, disabled: true },
    { id: "sep-1", separator: true },
    {
      id: "copy-relative", label: t.fileCopyRelativePath as string, shortcut: "Ctrl+K Shift+C",
      disabled: !selectedFilePath, action: () => void handleCopyPath(selectedFilePath),
    },
    {
      id: "copy-absolute", label: t.fileCopyAbsolutePath as string, shortcut: "Ctrl+K Shift+A",
      disabled: !selectedAbsolutePath, action: () => void handleCopyPath(selectedAbsolutePath),
    },
    {
      id: "diff-view", label: t.fileDiffView as string,
      disabled: !filePatch || filePatch.relativePath !== selectedFilePath,
    },
    { id: "sep-2", separator: true },
    {
      id: "line-numbers", label: `${t.fileLineNumbers} ${editorOptions.lineNumbersEnabled ? "✓" : ""}`.trim(),
      action: () => editorOptions.setLineNumbersEnabled((v) => !v),
    },
    {
      id: "word-wrap", label: `${t.fileWordWrap} ${editorOptions.wordWrapEnabled ? "✓" : ""}`.trim(),
      shortcut: t.fileWordWrapShortcut as string, action: () => editorOptions.setWordWrapEnabled((v) => !v),
    },
    {
      id: "agent-annotations", label: `${t.agentChangeAnnotations} ${editorOptions.agentAnnotationsEnabled ? "✓" : ""}`.trim(),
      disabled: !activeFilePatch, action: () => editorOptions.setAgentAnnotationsEnabled((v) => !v),
    },
  ];

  const resolvedTheme = (appInfo?.config?.resolvedTheme === "dark") ? "dark" : "light";
  const resolvedLocale = appInfo?.config?.language ?? "zh-CN";

  return (
    <div className="adl-tool-panel adl-tool-panel--files">
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.fileExplorerContext as string}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator("files")}
              aria-label={(navigatorCollapsed ? t.panelToggleRight : t.panelToggleLeft) as string}
            >
              <IconPanelLeftClose size={14} decorative />
            </button>
          </TooltipSimple>

          <TooltipSimple content={navigatorMode === "search" ? t.browserBack : t.search} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => setNavigatorMode(navigatorMode === "search" ? "tree" : "search")}
              aria-label={(navigatorMode === "search" ? t.browserBack : t.search) as string}
            >
              {navigatorMode === "search" ? <IconReturn size={14} decorative /> : <IconSearch size={14} decorative />}
            </button>
          </TooltipSimple>

          <FileHistoryNav
            canGoBack={fileHistory.canGoBack}
            canGoForward={fileHistory.canGoForward}
            onBack={fileHistory.navigateBack}
            onForward={fileHistory.navigateForward}
            t={t}
          />
        </div>

        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <div className="adl-tool-context__divider" />
          <TooltipSimple content={previewEnabled ? t.filePreview : t.fileEdit} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn${previewEnabled ? " is-active" : ""}`}
              onClick={() => setPreviewEnabled(!previewEnabled)}
              aria-label={(previewEnabled ? t.filePreview : t.fileEdit) as string}
              aria-pressed={previewEnabled ? "true" : "false"}
            >
              <IconEye size={14} decorative />
            </button>
          </TooltipSimple>
          <FileContextMenu
            menuItems={fileMenuItems}
            t={t}
            checkState={{
              lineNumbersEnabled: editorOptions.lineNumbersEnabled,
              wordWrapEnabled: editorOptions.wordWrapEnabled,
              agentAnnotationsEnabled: editorOptions.agentAnnotationsEnabled,
            }}
          />
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? " is-navigator-collapsed" : ""}`}
        style={{ "--adl-files-nav-width": `${filesNavigatorWidth}px` } as React.CSSProperties}
      >
        <FileNavigatorShell
          selectedFilePath={selectedFilePath}
          workspaceTree={workspaceTree}
          outline={outline}
          searchQuery={searchQuery}
          searchResults={searchResults}
          externalChangePath={externalChangePath}
          dirtyEditorPaths={dirtyEditorPaths}
          appInfo={appInfo}
          onOpenFile={onOpenFile}
          onOpenFileAtLine={onOpenFileAtLine}
          onSearch={onSearch}
          onSearchChange={onSearchChange}
          onRefreshWorkspaceTree={onRefreshWorkspaceTree}
          onCreateWorkspaceFile={onCreateWorkspaceFile}
          onCreateWorkspaceFolder={onCreateWorkspaceFolder}
          onEditorChange={onEditorChange}
          onNavigateLine={handleNavigateLine}
          t={t}
        />

        <div className="adl-tool-primary">
          {editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null}

          <div ref={editorShellRef} className="adl-tool-editor" data-testid="editor-shell">
            <EditorSurfaceShell
              selectedFilePath={selectedFilePath}
              fileContent={fileContent}
              filePatch={filePatch}
              editorLanguage={editorLanguage}
              diagnostics={diagnostics}
              editorHint={editorHint}
              outline={outline}
              activePatchSet={activePatchSet}
              selectedPatchFilePath={selectedPatchFilePath}
              selectedPatchHunkId={selectedPatchHunkId}
              collapsedPatchHunkIds={collapsedPatchHunkIds}
              onEditorChange={onEditorChange}
              onEditorMount={onEditorMount}
              onDiffMount={onDiffMount}
              onSetDiffLayout={onSetDiffLayout}
              onJumpPatchHunk={onJumpPatchHunk}
              onSelectPatchHunk={onSelectPatchHunk}
              onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
              onSetAllPatchHunksCollapsed={onSetAllPatchHunksCollapsed}
              onOpenFileAtLine={onOpenFileAtLine}
              t={t}
              resolvedTheme={resolvedTheme}
              resolvedLocale={resolvedLocale}
              diffSideBySide={diffSideBySide}
              getStickySourceEditor={getStickySourceEditor}
              cmViewRef={cmViewRef}
              localDiffEditorRef={localDiffEditorRef}
              editorSurfaceRef={editorSurfaceRef}
              standardEditorRef={props.standardEditorRef}
              editorOptions={editorOptions}
            />
          </div>

          {diagnostics.length > 0 ? (
            <div className="adl-tool-diagnostics">
              <h5>{t.diagnostics as string}</h5>
              <ul>
                {diagnostics.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="adl-tool-diagnostics__item"
                      onClick={() => {
                        if (d.path && d.path !== selectedFilePath) {
                          onOpenFileAtLine(d.path, d.line ?? 1);
                          return;
                        }
                        handleNavigateLine(d.line ?? 1);
                      }}
                    >
                      <strong>{d.source}</strong>
                      <span>{d.message}</span>
                      <span>
                        {d.path ?? selectedFilePath}
                        {d.line ? `:${d.line}` : ""}
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
