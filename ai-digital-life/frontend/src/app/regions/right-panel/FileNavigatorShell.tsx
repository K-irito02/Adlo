import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceTreeNode,
  FileOutlineItem,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';
import {
  IconFiles,
  IconFilePlus,
  IconFoldVertical,
  IconFolderPlus,
  IconList,
  IconRefreshCw,
  IconReplace,
  IconUnfoldVertical,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { MultiWorkspaceFileTree } from '../../features/workspace-file-tree';
import { CustomScrollArea } from '../../features/file-tree/CustomScrollArea';
import { OutlineTree, getDefaultExpandedOutlineIds } from '../../features/outline';
import { normalizeWorkspaceRelativePath } from '../../utils/workspacePaths';
import { useFileCreation, useSearchPanel } from './hooks';
import { useFileContextMenuItems } from './hooks/useFileContextMenuItems';
import { FileCreationBar } from './FileCreationBar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { RenameDialog } from '../../components/RenameDialog';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { SearchHit } from './hooks/useSearchPanel';

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
    relativePath: string
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
  onCreateWorkspaceFile: (relativePath: string, content?: string) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (relativePath: string) => Promise<string | undefined>;
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
  } = useAppStore(
    useShallow((s) => ({
      navigatorMode: s.filesNavigatorMode,
      setNavigatorMode: s.setFilesNavigatorMode,
      navigatorCollapsed: s.navigatorCollapsedByTool.files,
      filesNavigatorWidth: s.filesNavigatorWidth,
      setFileTreePathExpanded: s.setFileTreePathExpanded,
      toggleFileTreePath: s.toggleFileTreePath,
      expandFileTreePathChain: s.expandFileTreePathChain,
    }))
  );
  const expandedPaths = useAppStore(useShallow((s) => s.expandedFileTreePaths));

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const fileCreation = useFileCreation({
    selectedFilePath,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    expandFileTreePathChain: (path: string) => {
      if (activeWorkspaceId) {
        expandFileTreePathChain(activeWorkspaceId, path);
      }
    },
    setFileTreePathExpanded: (path: string, expanded: boolean) => {
      if (activeWorkspaceId) {
        setFileTreePathExpanded(activeWorkspaceId, path, expanded);
      }
    },
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
    [dirtyEditorPaths]
  );

  const defaultExpandedOutlineIds = useMemo(() => getDefaultExpandedOutlineIds(outline), [outline]);
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(
    () => defaultExpandedOutlineIds
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
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const contextMenuPersistRef = useRef(false);
  const clearMenuHighlightRef = useRef<(() => void) | undefined>(undefined);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, []);

  const { getContextMenuItems } = useFileContextMenuItems({
    t,
    copyToClipboard,
    contextMenuPersistRef,
    setRenamingPath,
    setRenameDialogOpen,
    setDeleteConfirmPath,
    showMenuForDirectories: true,
  });

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renamingPath) {
        return;
      }
      const path = renamingPath;
      setRenamingPath(null);
      setRenameDialogOpen(false);
      clearMenuHighlightRef.current?.();
      await useAppStore.getState().renameWorkspaceFile(path, newName);
    },
    [renamingPath]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
    setRenameDialogOpen(false);
    clearMenuHighlightRef.current?.();
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmPath) {
      return;
    }
    const path = deleteConfirmPath;
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
    await useAppStore.getState().deleteWorkspaceFile(path);
  }, [deleteConfirmPath]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmPath(null);
    clearMenuHighlightRef.current?.();
  }, []);

  if (navigatorCollapsed) {
    return <aside className="adl-tool-navigator" aria-hidden="true" />;
  }

  return (
    <aside className="adl-tool-navigator" aria-label={navigatorTitle as string}>
      <div className="adl-tool-navigator__context">
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
          <TooltipSimple
            content={structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll}
            placement="top"
          >
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={handleToggleNavigatorStructure}
              aria-label={(structureToggleExpanded ? t.fileCollapseAll : t.fileExpandAll) as string}
              disabled={!canToggleNavigatorStructure}
            >
              {structureToggleExpanded ? (
                <IconFoldVertical size={14} decorative />
              ) : (
                <IconUnfoldVertical size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-tool-navigator__context-title">{navigatorTitle as string}</span>
        </div>
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          {workspaceCount > 0 ? (
            <span className="adl-tool-navigator__context-count">{workspaceCount}</span>
          ) : null}
          <TooltipSimple content={t.communicateRefreshAll} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={onRefreshAll}
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
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'tree' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('tree')}
              aria-label={t.fileTreeView as string}
              aria-pressed={navigatorMode === 'tree' ? 'true' : 'false'}
            >
              <IconFiles size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.changesOutline} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn adl-tool-navigator__context-btn${navigatorMode === 'outline' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode('outline')}
              aria-label={(outline.length > 0 ? t.outline : t.toolFiles) as string}
              aria-pressed={navigatorMode === 'outline' ? 'true' : 'false'}
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
              onClick={() => fileCreation.startCreate('file')}
              aria-label={t.fileNewFile as string}
            >
              <IconFilePlus size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.fileNewFolder} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={() => fileCreation.startCreate('folder')}
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
            if (!trimmed) {
              return false;
            }
            if (
              /^[A-Za-z]:[\\/]/.test(trimmed) ||
              trimmed.startsWith('/') ||
              trimmed.startsWith('\\')
            ) {
              return false;
            }
            return true;
          }}
          onPathChange={fileCreation.setCreatePathValue}
          onSubmit={fileCreation.submitCreate}
          onCancel={fileCreation.cancelCreate}
        />
      ) : null}

      {navigatorMode === 'tree' ? (
        visibleWorkspaces.length > 0 ? (
          <CustomScrollArea
            shellClassName="adl-multitree"
            scrollClassName="adl-multitree-scroll"
            scrollbarClassName="adl-multitree-scrollbar"
            thumbClassName="adl-multitree-scrollbar__thumb"
          >
            <MultiWorkspaceFileTree
              workspaces={visibleWorkspaces}
              activeWorkspaceId={activeWorkspaceId}
              treeData={workspaceTrees}
              loadingStates={workspaceTreeLoading}
              errorStates={workspaceTreeErrors}
              expandedStates={workspaceTreeExpandedInFileNav}
              selectedFilePath={selectedFilePath}
              selectedFileWorkspaceId={selectedFileWorkspaceId}
              expandedPaths={expandedPaths}
              dirtyPaths={dirtyPaths}
              externalChangePath={externalChangePath}
              onToggleExpand={onToggleExpandInFileNav}
              onRefreshOne={onRefreshOneWorkspace}
              onOpenWorkspace={(path: string) => {
                useAppStore.getState().openWorkspace(path);
              }}
              onPinWorkspace={(workspaceId: string) => {
                useAppStore.getState().pinWorkspace(workspaceId);
              }}
              onUnpinWorkspace={(workspaceId: string) => {
                useAppStore.getState().unpinWorkspace(workspaceId);
              }}
              onHideFromRightPanels={onHideFromRightPanels}
              onToggleFileTreePath={toggleFileTreePath}
              onOpenFile={onOpenFile}
              onOpenFileForWorkspace={onOpenFileForWorkspace}
              onReorderWorkspaces={(input) => {
                useAppStore.getState().reorderWorkspaces(input);
              }}
              getContextMenuItems={getContextMenuItems}
              contextMenuPersistRef={contextMenuPersistRef}
              clearMenuHighlightRef={clearMenuHighlightRef}
            />
          </CustomScrollArea>
        ) : null
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
              <div className="adl-search-panel__toggles" role="toolbar" aria-label="Search options">
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
        label="Resize file navigator"
        minWidth={180}
        maxWidth={420}
        currentWidth={filesNavigatorWidth}
        onPointerDown={handleNavigatorResizeStart}
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
      {renameDialogOpen && renamingPath ? (
        <RenameDialog
          open={renameDialogOpen}
          initialValue={renamingPath.split('/').pop() || ''}
          title={t.changesRename}
          itemInfo={formatT(t, 'changesCurrentPath', { path: renamingPath })}
          placeholder={t.changesEnterNewName}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
      ) : null}
    </aside>
  );
});

export { FileNavigatorShell };
export type { FileNavigatorShellProps };
