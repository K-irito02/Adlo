import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceTreeNode,
  FileOutlineItem,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';
import { IconReplace } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { OutlineTree, getDefaultExpandedOutlineIds } from '@features/outline';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import { useFileCreation, useSearchPanel } from './hooks';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { SearchHit } from './hooks/useSearchPanel';
import { FileNavigatorToolbar } from './FileNavigatorToolbar';
import { FileNavigatorTree } from './FileNavigatorTree';
import { FileNavigatorRenaming } from './FileNavigatorRenaming';
import { FileCreationDialog } from './FileCreationDialog';
import { useFileNavigatorContextMenu } from './FileNavigatorContextMenu';

interface FileNavigatorShellProps {
  selectedFilePath: string | undefined;
  selectedFileWorkspaceId: string | undefined;
  workspaceTrees: Record<string, WorkspaceTreeNode[]>;
  recentWorkspaces: RecentWorkspaceEntry[];
  allExpanded: boolean;
  outline: FileOutlineItem[];
  searchQuery: string;
  searchResults: SearchHit[];
  externalChangePath: string | undefined;
  dirtyEditorPaths: string[];
  appInfo:
    | {
        currentWorkspace?: { name?: string; rootPath?: string; path?: string };
        config?: { language?: string };
      }
    | undefined;
  onOpenFile: (relativePath: string) => void;
  onOpenFileForWorkspace: (
    workspaceId: string,
    workspacePath: string,
    relativePath: string,
  ) => void;
  onOpenFileAtLine: (relativePath: string, line: number) => void;
  onSearch: (query: string) => void;
  onSearchChange: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  onRefreshOneWorkspace: (workspaceId: string) => void;
  onToggleExpandInFileNav: (workspaceId: string) => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onCreateWorkspaceFile: (
    relativePath: string,
    content?: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (
    relativePath: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  onEditorChange: (value: string | undefined) => void;
  onNavigateLine: (line: number) => void;
  workspaceTreeExpandedInFileNav: Record<string, boolean>;
  workspaceTreeLoading: Record<string, boolean>;
  workspaceTreeErrors: Record<string, string | undefined>;
}

const FileNavigatorShell = React.memo(function FileNavigatorShell(props: FileNavigatorShellProps) {
  const { t, formatT } = useTCopy();
  const {
    selectedFilePath,
    selectedFileWorkspaceId,
    workspaceTrees,
    recentWorkspaces,
    allExpanded,
    outline,
    searchQuery,
    searchResults,
    externalChangePath,
    dirtyEditorPaths,
    appInfo,
    onOpenFile,
    onOpenFileForWorkspace,
    onOpenFileAtLine,
    onSearch,
    onSearchChange,
    onExpandAll,
    onCollapseAll,
    onRefreshAll,
    onRefreshOneWorkspace,
    onHideFromRightPanels,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    onEditorChange,
    onNavigateLine,
    onToggleExpandInFileNav,
    workspaceTreeExpandedInFileNav,
    workspaceTreeLoading,
    workspaceTreeErrors,
  } = props;

  const {
    navigatorMode,
    setNavigatorMode,
    navigatorCollapsed,
    filesNavigatorWidth,
    setFileTreePathExpanded,
    toggleFileTreePath,
    expandFileTreePathChain,
    fileTreeClickedPath,
    fileTreeClickedWorkspaceId,
    fileTreeClickedKind,
    fileTreeClickedWorkspaceRoot,
    fileNavigatorActiveWorkspaceId,
    setFileNavigatorActiveWorkspace,
  } = useAppStore(
    useShallow((s) => ({
      navigatorMode: s.filesNavigatorMode,
      setNavigatorMode: s.setFilesNavigatorMode,
      navigatorCollapsed: s.navigatorCollapsedByTool.files,
      filesNavigatorWidth: s.filesNavigatorWidth,
      setFileTreePathExpanded: s.setFileTreePathExpanded,
      toggleFileTreePath: s.toggleFileTreePath,
      expandFileTreePathChain: s.expandFileTreePathChain,
      fileTreeClickedPath: s.fileTreeClickedPath,
      fileTreeClickedWorkspaceId: s.fileTreeClickedWorkspaceId,
      fileTreeClickedKind: s.fileTreeClickedKind,
      fileTreeClickedWorkspaceRoot: s.fileTreeClickedWorkspaceRoot,
      fileNavigatorActiveWorkspaceId: s.fileNavigatorActiveWorkspaceId,
      setFileNavigatorActiveWorkspace: s.setFileNavigatorActiveWorkspace,
    })),
  );
  const expandedPaths = useAppStore(useShallow((s) => s.expandedFileTreePaths));
  const workspaceTreeRefreshing = useAppStore(useShallow((s) => s.workspaceTreeRefreshing));
  const refreshingAllWorkspaces = useAppStore((s) => s.refreshingAllWorkspaces);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // 文件导航器"选中工作区"：优先取用户点击选中的工作区（轻量前端态，不触发重载），
  // 未选中时回退到后端当前激活工作区。
  const derivedActiveWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;
  const activeWorkspaceId = fileNavigatorActiveWorkspaceId ?? derivedActiveWorkspaceId;

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      setFileNavigatorActiveWorkspace(workspaceId);
    },
    [setFileNavigatorActiveWorkspace],
  );

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available,
      ),
    [recentWorkspaces],
  );

  const fileCreation = useFileCreation({
    selectedFilePath,
    selectedFileWorkspaceId,
    activeWorkspaceId,
    recentWorkspaces,
    clickedNode:
      fileTreeClickedPath && fileTreeClickedWorkspaceId && fileTreeClickedKind
        ? {
            path: fileTreeClickedPath,
            workspaceId: fileTreeClickedWorkspaceId,
            kind: fileTreeClickedKind,
          }
        : undefined,
    clickedWorkspaceRoot: fileTreeClickedWorkspaceRoot,
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
    onWidthCommit: useAppStore.getState().setFilesNavigatorWidth,
    minWidth: 180,
    maxWidth: 420,
  });

  const dirtyPaths = useMemo(
    () => new Set(dirtyEditorPaths.map((p) => normalizeWorkspaceRelativePath(p))),
    [dirtyEditorPaths],
  );

  const defaultExpandedOutlineIds = useMemo(() => getDefaultExpandedOutlineIds(outline), [outline]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(
    () => defaultExpandedOutlineIds,
  );
  useEffect(() => {
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);

  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;

  const navigatorTitle =
    navigatorMode === 'tree'
      ? t.changesFileTree
      : navigatorMode === 'search'
        ? t.searchResults
        : t.outline;
  const workspaceCount = visibleWorkspaces.length;

  useEffect(() => {
    if (navigatorMode === 'search') {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [navigatorMode]);

  useEffect(() => {
    if (selectedFilePath && activeWorkspaceId) {
      expandFileTreePathChain(activeWorkspaceId, selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath, activeWorkspaceId]);

  const handleToggleAllOutlineItems = () => {
    if (!hasExpandableOutlineItems) {
      return;
    }
    setExpandedOutlineIds(hasExpandedOutlineItems ? new Set() : new Set(defaultExpandedOutlineIds));
  };

  const canToggleNavigatorStructure =
    navigatorMode === 'tree'
      ? visibleWorkspaces.length > 0
      : navigatorMode === 'outline'
        ? hasExpandableOutlineItems
        : false;

  const structureToggleExpanded =
    navigatorMode === 'tree'
      ? allExpanded
      : navigatorMode === 'outline'
        ? hasExpandedOutlineItems
        : false;

  const handleToggleNavigatorStructure = () => {
    if (navigatorMode === 'tree') {
      if (allExpanded) {
        onCollapseAll();
      } else {
        onExpandAll();
      }
      return;
    }
    if (navigatorMode === 'outline') {
      handleToggleAllOutlineItems();
    }
  };

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingWorkspacePath, setRenamingWorkspacePath] = useState<string | undefined>(undefined);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [deleteWorkspacePath, setDeleteWorkspacePath] = useState<string | undefined>(undefined);
  const [deleteConfirmKind, setDeleteConfirmKind] = useState<'directory' | 'file'>('file');
  const { getContextMenuItems, contextMenuPersistRef, clearMenuHighlightRef } =
    useFileNavigatorContextMenu({
      t,
      setRenamingPath,
      setRenameDialogOpen,
      setDeleteConfirmPath,
      setRenamingWorkspacePath,
      setDeleteWorkspacePath,
      setDeleteConfirmKind,
    });

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renamingPath) {
        return;
      }
      const path = renamingPath;
      const wsPath = renamingWorkspacePath;
      setRenamingPath(null);
      setRenamingWorkspacePath(undefined);
      setRenameDialogOpen(false);
      clearMenuHighlightRef.current?.();
      await useAppStore.getState().renameWorkspaceFile(path, newName, wsPath);
    },
    [clearMenuHighlightRef, renamingPath, renamingWorkspacePath],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
    setRenamingWorkspacePath(undefined);
    setRenameDialogOpen(false);
    clearMenuHighlightRef.current?.();
  }, [clearMenuHighlightRef]);

  const handleNodeClicked = useCallback(
    (workspaceId: string, path: string, kind: 'directory' | 'file') => {
      useAppStore.getState().setFileTreeClickedNode(workspaceId, path, kind);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmPath) {
      return;
    }
    const path = deleteConfirmPath;
    const wsPath = deleteWorkspacePath;
    setDeleteConfirmPath(null);
    setDeleteWorkspacePath(undefined);
    clearMenuHighlightRef.current?.();
    await useAppStore.getState().deleteWorkspaceFile(path, wsPath);
  }, [clearMenuHighlightRef, deleteConfirmPath, deleteWorkspacePath]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmPath(null);
    setDeleteWorkspacePath(undefined);
    clearMenuHighlightRef.current?.();
  }, [clearMenuHighlightRef]);

  if (navigatorCollapsed) {
    return <aside className="adl-tool-navigator" aria-hidden="true" />;
  }

  return (
    <aside className="adl-tool-navigator" aria-label={navigatorTitle as string}>
      <FileNavigatorToolbar
        navigatorTitle={navigatorTitle as string}
        workspaceCount={workspaceCount}
        structureToggleExpanded={structureToggleExpanded}
        canToggleNavigatorStructure={canToggleNavigatorStructure}
        navigatorMode={navigatorMode}
        outline={outline}
        onToggleNavigatorStructure={handleToggleNavigatorStructure}
        onRefreshAll={onRefreshAll}
        isRefreshingAll={refreshingAllWorkspaces}
        onSetNavigatorMode={setNavigatorMode}
        fileCreation={fileCreation}
      />

      {navigatorMode === 'tree' ? (
        <FileNavigatorTree
          visibleWorkspaces={visibleWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          treeData={workspaceTrees}
          loadingStates={workspaceTreeLoading}
          refreshingStates={workspaceTreeRefreshing}
          errorStates={workspaceTreeErrors}
          expandedStates={workspaceTreeExpandedInFileNav}
          selectedFilePath={selectedFilePath}
          selectedFileWorkspaceId={selectedFileWorkspaceId}
          clickedPath={fileTreeClickedPath}
          clickedWorkspaceId={fileTreeClickedWorkspaceId}
          expandedPaths={expandedPaths}
          dirtyPaths={dirtyPaths}
          externalChangePath={externalChangePath}
          onToggleExpand={onToggleExpandInFileNav}
          onRefreshOne={onRefreshOneWorkspace}
          onHideFromRightPanels={onHideFromRightPanels}
          onToggleFileTreePath={toggleFileTreePath}
          onOpenFile={onOpenFile}
          onOpenFileForWorkspace={onOpenFileForWorkspace}
          onNodeClicked={handleNodeClicked}
          onSelectWorkspace={handleSelectWorkspace}
          getContextMenuItems={getContextMenuItems}
          contextMenuPersistRef={contextMenuPersistRef}
          setRenamingWorkspacePath={setRenamingWorkspacePath}
          setDeleteWorkspacePath={setDeleteWorkspacePath}
          clearMenuHighlightRef={clearMenuHighlightRef}
        />
      ) : null}

      {navigatorMode === 'search' ? (
        <div className="adl-search-panel">
          <div className="adl-search-panel__controls">
            <label className="adl-search-panel__field adl-search-panel__field--with-actions">
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSearch(searchQuery);
                  }
                }}
                placeholder={t.searchPanelSearch as string}
                aria-label={t.searchPanelSearch as string}
              />
              <div
                className="adl-search-panel__toggles"
                role="toolbar"
                aria-label={formatT(t, 'searchOptions')}
              >
                <TooltipSimple content={t.searchPanelMatchCase} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.matchCase ? ' is-active' : ''}`}
                    aria-pressed={searchPanel.matchCase ? 'true' : 'false'}
                    onClick={() => searchPanel.setMatchCase((v) => !v)}
                    aria-label={t.searchPanelMatchCase as string}
                  >
                    Aa
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelMatchWholeWord} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.matchWholeWord ? ' is-active' : ''}`}
                    aria-pressed={searchPanel.matchWholeWord ? 'true' : 'false'}
                    onClick={() => searchPanel.setMatchWholeWord((v) => !v)}
                    aria-label={t.searchPanelMatchWholeWord as string}
                  >
                    ab
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelUseRegex} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchPanel.useRegex ? ' is-active' : ''}`}
                    aria-pressed={searchPanel.useRegex ? 'true' : 'false'}
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
              className={`adl-search-panel__toggle${searchPanel.replaceOpen ? ' is-open' : ''}`}
              onClick={() => searchPanel.setReplaceOpen((v) => !v)}
              aria-label={t.searchPanelToggleReplace as string}
              aria-expanded={searchPanel.replaceOpen ? 'true' : 'false'}
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

      {navigatorMode === 'outline' ? (
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

      <NavigatorResizeHandle
        label={t.resizeFileNavigator}
        minWidth={180}
        maxWidth={420}
        currentWidth={filesNavigatorWidth}
        onPointerDown={handleNavigatorResizeStart}
      />
      <FileNavigatorRenaming
        renameDialogOpen={renameDialogOpen}
        renamingPath={renamingPath}
        deleteConfirmPath={deleteConfirmPath}
        deleteConfirmKind={deleteConfirmKind}
        t={t}
        onConfirmRename={handleRenameConfirm}
        onCancelRename={handleRenameCancel}
        onConfirmDelete={handleDeleteConfirm}
        onCancelDelete={handleDeleteCancel}
      />
      {fileCreation.createTarget ? (
        <FileCreationDialog
          open
          target={fileCreation.createTarget}
          value={fileCreation.createPathValue}
          inputRef={fileCreation.createInputRef}
          onChange={fileCreation.setCreatePathValue}
          onSubmit={fileCreation.submitCreate}
          onCancel={fileCreation.cancelCreate}
        />
      ) : null}
    </aside>
  );
});

export { FileNavigatorShell };
export type { FileNavigatorShellProps };
