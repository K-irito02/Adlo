import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceTreeNode, FileOutlineItem } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import { IconClipboardList, IconCopy, IconFiles, IconFilePlus, IconFolderOpen, IconFoldVertical, IconFolderPlus, IconList, IconPanelLeftClose, IconPencil, IconRefreshCw, IconReplace, IconReturn, IconSearch, IconTrash, IconUnfoldVertical, IconUpload } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import { useUiStore, type FilesNavigatorMode } from "../../ui-store";
import { useNavigatorResize } from "../../hooks/useNavigatorResize";
import { FileTree, collectDirectoryPaths, type FileTreeContextMenuItem } from "./fileTree";
import { OutlineTree } from "./OutlineTree";
import { getDefaultExpandedOutlineIds } from "./outlineModel";
import { normalizeWorkspaceRelativePath } from "../../workspacePaths";
import { useFileCreation, useSearchPanel } from "./hooks";
import { FileCreationBar } from "./FileCreationBar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { RenameInput } from "../../components/RenameInput";
import { useAppStore } from "../../slicedStore";
import type { SearchHit } from "./hooks/useSearchPanel";

interface FileNavigatorShellProps {
  selectedFilePath: string | undefined;
  workspaceTree: WorkspaceTreeNode[];
  outline: FileOutlineItem[];
  searchQuery: string;
  searchResults: SearchHit[];
  externalChangePath: string | undefined;
  dirtyEditorPaths: string[];
  appInfo: { currentWorkspace?: { name?: string; rootPath?: string; path?: string }; config?: { language?: string } } | undefined;
  onOpenFile: (relativePath: string) => void;
  onOpenFileAtLine: (relativePath: string, line: number) => void;
  onSearch: (query: string) => void;
  onSearchChange: (query: string) => void;
  onRefreshWorkspaceTree: () => void;
  onCreateWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
  onEditorChange: (value: string | undefined) => void;
  onNavigateLine: (line: number) => void;
  t: CopyDict;
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

function FileNavigatorShell(props: FileNavigatorShellProps) {
  const {
    selectedFilePath,
    workspaceTree,
    outline,
    searchQuery,
    searchResults,
    externalChangePath,
    dirtyEditorPaths,
    appInfo,
    onOpenFile,
    onOpenFileAtLine,
    onSearch,
    onSearchChange,
    onRefreshWorkspaceTree,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    onEditorChange,
    onNavigateLine,
    t,
  } = props;

  const navigatorMode = useUiStore((s) => s.filesNavigatorMode);
  const setNavigatorMode = useUiStore((s) => s.setFilesNavigatorMode);
  const navigatorCollapsed = useUiStore((s) => s.navigatorCollapsedByTool.files);
  const toggleNavigator = useUiStore((s) => s.toggleNavigator);
  const filesNavigatorWidth = useUiStore((s) => s.filesNavigatorWidth);
  const expandedPaths = useUiStore((s) => s.expandedFileTreePaths);
  const setFileTreePathExpanded = useUiStore((s) => s.setFileTreePathExpanded);
  const toggleFileTreePath = useUiStore((s) => s.toggleFileTreePath);
  const expandFileTreePathChain = useUiStore((s) => s.expandFileTreePathChain);
  const collapseAllFileTreePaths = useUiStore((s) => s.collapseAllFileTreePaths);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fileCreation = useFileCreation({
    selectedFilePath,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    expandFileTreePathChain,
    setFileTreePathExpanded,
  });

  const searchPanel = useSearchPanel({
    searchQuery,
    searchResults,
    fileContent: undefined,
    onReplace: (value: string) => onEditorChange(value),
  });

  const { handlePointerDown: handleNavigatorResizeStart } = useNavigatorResize({
    onWidthCommit: useUiStore.getState().setFilesNavigatorWidth,
    minWidth: 180,
    maxWidth: 420,
  });

  const dirtyPaths = useMemo(
    () => new Set(dirtyEditorPaths.map((p) => normalizeWorkspaceRelativePath(p))),
    [dirtyEditorPaths],
  );

  const directoryPaths = useMemo(() => collectDirectoryPaths(workspaceTree), [workspaceTree]);
  const hasExpandedDirectories = useMemo(
    () => directoryPaths.some((p) => expandedPaths[p]),
    [directoryPaths, expandedPaths],
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

  const navigatorTitle = navigatorMode === "tree" ? t.toolFiles : navigatorMode === "search" ? t.searchResults : t.outline;

  useEffect(() => {
    if (navigatorMode === "search") {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [navigatorMode]);

  useEffect(() => {
    if (selectedFilePath) {
      expandFileTreePathChain(selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath]);

  const handleToggleAllDirectories = () => {
    if (!hasExpandedDirectories) {
      directoryPaths.forEach((p) => setFileTreePathExpanded(p, true));
      return;
    }
    collapseAllFileTreePaths();
  };

  const handleToggleAllOutlineItems = () => {
    if (!hasExpandableOutlineItems) return;
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

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const contextMenuPersistRef = useRef(false);
  const clearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
    }
  }, []);

  const getContextMenuItems = useCallback(
    (node: WorkspaceTreeNode): FileTreeContextMenuItem<WorkspaceTreeNode>[] => {
      const isDir = node.kind === "directory";
      const store = useAppStore.getState();
      const hasClipboard = store.clipboardOperation !== null;
      return [
        {
          id: "reveal",
          label: isDir ? (t.fileContextRevealDir as string) : (t.fileContextReveal as string),
          icon: <IconFolderOpen size={14} />,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const rootPath = store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
            if (!rootPath) return;
            await window.digitalLife.workspace.revealInFileManager(
              `${rootPath}/${targetNode.path}`
            );
          }
        },
        { id: "sep1", separator: true },
        {
          id: "copy-full-path",
          label: t.fileContextCopyFullPath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const rootPath = store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
            const fullPath = rootPath ? `${rootPath}/${targetNode.path}` : targetNode.path;
            await copyToClipboard(fullPath);
          }
        },
        {
          id: "copy-relative-path",
          label: t.fileContextCopyRelativePath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            await copyToClipboard(targetNode.path);
          }
        },
        { id: "sep2", separator: true },
        {
          id: "cut",
          label: t.fileContextCut as string,
          icon: <IconClipboardList size={14} />,
          action: (targetNode) => {
            store.setClipboard("cut", targetNode.path, targetNode.kind);
          }
        },
        {
          id: "copy-op",
          label: t.fileContextCopy as string,
          icon: <IconCopy size={14} />,
          action: (targetNode) => {
            store.setClipboard("copy", targetNode.path, targetNode.kind);
          }
        },
        {
          id: "paste",
          label: t.fileContextPaste as string,
          icon: <IconUpload size={14} />,
          disabled: !hasClipboard,
          action: async (targetNode) => {
            const sourcePath = store.clipboardSourcePath;
            const operation = store.clipboardOperation;
            if (!sourcePath || !operation) return;
            const targetDir = targetNode.kind === "directory" ? targetNode.path : targetNode.path.substring(0, targetNode.path.lastIndexOf("/") + 1);
            const sourceName = sourcePath.split("/").pop() || sourcePath;
            const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
            if (operation === "copy") {
              await store.duplicateWorkspaceFile(sourcePath, newPath);
            } else if (operation === "cut") {
              await store.moveWorkspaceFile(sourcePath, newPath);
            }
            store.clearClipboard();
          }
        },
        { id: "sep3", separator: true },
        {
          id: "rename",
          label: t.fileContextRename as string,
          icon: <IconPencil size={14} />,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setRenamingPath(targetNode.path);
          }
        },
        {
          id: "delete",
          label: t.fileContextDelete as string,
          icon: <IconTrash size={14} />,
          danger: true,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setDeleteConfirmPath(targetNode.path);
          }
        }
      ];
    },
    [t, copyToClipboard]
  );

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renamingPath) return;
    const path = renamingPath;
    setRenamingPath(null);
    clearMenuHighlightRef.current?.();
    await useAppStore.getState().renameWorkspaceFile(path, newName);
  }, [renamingPath]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
    clearMenuHighlightRef.current?.();
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmPath) return;
    const path = deleteConfirmPath;
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
    await useAppStore.getState().deleteWorkspaceFile(path);
  }, [deleteConfirmPath]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
  }, []);

  const handleRefreshNavigator = async () => {
    await onRefreshWorkspaceTree();
  };

  if (navigatorCollapsed) {
    return (
      <aside className="adl-tool-navigator" aria-hidden="true" />
    );
  }

  return (
    <aside className="adl-tool-navigator" aria-label={navigatorTitle as string}>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple content={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={handleToggleNavigatorStructure}
              aria-label={(structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll) as string}
              disabled={!canToggleNavigatorStructure}
            >
              {structureToggleExpanded ? <IconFoldVertical size={14} decorative /> : <IconUnfoldVertical size={14} decorative />}
            </button>
          </TooltipSimple>
          <span className="adl-tool-navigator__context-title">{appInfo?.currentWorkspace?.name ?? (t.toolFiles as string)}</span>
        </div>

        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          <TooltipSimple content={t.fileRefresh} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => void handleRefreshNavigator()}
              aria-label={t.fileRefresh as string}
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
              aria-label={t.fileTreeView as string}
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
              aria-label={(outline.length > 0 ? t.outline : t.toolFiles) as string}
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
              onClick={() => fileCreation.startCreate("file")}
              aria-label={t.fileNewFile as string}
            >
              <IconFilePlus size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileNewFolder} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => fileCreation.startCreate("folder")}
              aria-label={t.fileNewFolder as string}
            >
              <IconFolderPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>

      {fileCreation.createTarget ? (
        <FileCreationBar
          createTarget={fileCreation.createTarget}
          createPathValue={fileCreation.createPathValue}
          createInputRef={fileCreation.createInputRef}
          isValidPath={(value) => {
            const trimmed = value.trim();
            if (!trimmed) return false;
            if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) return false;
            return true;
          }}
          onPathChange={fileCreation.setCreatePathValue}
          onSubmit={fileCreation.submitCreate}
          onCancel={fileCreation.cancelCreate}
          t={t}
        />
      ) : null}

      {navigatorMode === "tree" ? (
        workspaceTree.length > 0 ? (
          <FileTree
            nodes={workspaceTree}
            selectedFilePath={selectedFilePath}
            expandedPaths={expandedPaths}
            dirtyPaths={dirtyPaths}
            externalChangePath={externalChangePath}
            onToggle={toggleFileTreePath}
            onOpenFile={onOpenFile}
            getContextMenuItems={getContextMenuItems}
            contextMenuPersistRef={contextMenuPersistRef}
            clearMenuHighlightRef={clearMenuHighlightRef}
            expandLabel={t.expandDetails as string}
            collapseLabel={t.collapseDetails as string}
          />
        ) : null
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
                placeholder={t.searchPanelSearch as string}
                aria-label={t.searchPanelSearch as string}
              />
              <div className="adl-search-panel__toggles" role="toolbar" aria-label="Search options">
                <TooltipSimple content={t.searchPanelMatchCase} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.matchCase ? " is-active" : ""}`}
                    aria-pressed={searchPanel.matchCase ? "true" : "false"}
                    onClick={() => searchPanel.setMatchCase((v) => !v)}
                    aria-label={t.searchPanelMatchCase as string}
                  >
                    Aa
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelMatchWholeWord} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.matchWholeWord ? " is-active" : ""}`}
                    aria-pressed={searchPanel.matchWholeWord ? "true" : "false"}
                    onClick={() => searchPanel.setMatchWholeWord((v) => !v)}
                    aria-label={t.searchPanelMatchWholeWord as string}
                  >
                    ab
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelUseRegex} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.useRegex ? " is-active" : ""}`}
                    aria-pressed={searchPanel.useRegex ? "true" : "false"}
                    onClick={() => searchPanel.setUseRegex((v) => !v)}
                    aria-label={t.searchPanelUseRegex as string}
                  >
                    .*
                  </button>
                </TooltipSimple>
              </div>
            </label>
            <button
              type="button"
              className={`adl-search-panel__toggle${searchPanel.replaceOpen ? " is-open" : ""}`}
              onClick={() => searchPanel.setReplaceOpen((v) => !v)}
              aria-label={t.searchPanelToggleReplace as string}
              aria-expanded={searchPanel.replaceOpen ? "true" : "false"}
            >
              <IconReplace size={12} decorative />
            </button>
          </div>

          {searchPanel.replaceOpen ? (
            <div className="adl-search-panel__controls">
              <label className="adl-search-panel__field">
                <input
                  type="text"
                  value={searchPanel.replaceQuery}
                  onChange={(event) => searchPanel.setReplaceQuery(event.target.value)}
                  placeholder={t.searchPanelReplace as string}
                  aria-label={t.searchPanelReplace as string}
                />
              </label>
              <TooltipSimple content={t.searchPanelReplaceAction} placement="top">
                <button
                  type="button"
                  className="adl-search-panel__replacebtn"
                  onClick={searchPanel.handleReplace}
                  disabled={!searchPanel.replaceQuery || !searchQuery}
                  aria-label={t.searchPanelReplaceAction as string}
                >
                  <IconReplace size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          ) : null}

          {searchPanel.filteredResults.length > 0 ? (
            <ul className="adl-tool-list adl-tool-list--search-results">
              {searchPanel.filteredResults.map((result) => (
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
            <p className="adl-empty-hint">{t.searchPlaceholder as string}</p>
          )}
        </div>
      ) : null}

      {navigatorMode === "outline" ? (
        outline.length > 0 ? (
          <OutlineTree
            items={outline}
            onNavigate={(line) => onNavigateLine(line)}
            expandLabel={t.expandDetails as string}
            collapseLabel={t.collapseDetails as string}
            expandedIds={expandedOutlineIds}
            onExpandedIdsChange={setExpandedOutlineIds}
          />
        ) : (
          <p className="adl-empty-hint">{t.noDiagnostics as string}</p>
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
      {deleteConfirmPath ? (
        <ConfirmDialog
          title={t.fileDeleteConfirm as string}
          message={t.fileDeleteMessage as string}
          confirmLabel={t.fileDeleteAction as string}
          cancelLabel={t.cancel as string}
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      ) : null}
      {renamingPath ? (
        <div className="adl-rename-overlay" onClick={handleRenameCancel}>
          <div className="adl-rename-dialog" onClick={(e) => e.stopPropagation()}>
            <RenameInput
              initialValue={renamingPath.split("/").pop() || ""}
              onConfirm={handleRenameConfirm}
              onCancel={handleRenameCancel}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export { FileNavigatorShell };
export type { FileNavigatorShellProps };
