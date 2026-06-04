import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceTreeNode,
  FileOutlineItem,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import {
  IconClipboardList,
  IconCopy,
  IconFiles,
  IconFilePlus,
  IconFolderOpen,
  IconFoldVertical,
  IconFolderPlus,
  IconList,
  IconPanelLeftClose,
  IconPencil,
  IconRefreshCw,
  IconReplace,
  IconReturn,
  IconSearch,
  IconTrash,
  IconUnfoldVertical,
  IconUpload,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { useUiStore } from '../../stores/ui-store';
import type { FilesNavigatorMode } from '../../stores/types';
import { useNavigatorResize } from '../../hooks/useNavigatorResize';
import { MultiWorkspaceFileTree } from '../../features/workspace-file-tree';
import type { FileTreeContextMenuItem } from '../../features/file-tree';
import { OutlineTree, getDefaultExpandedOutlineIds } from '../../features/outline';
import { normalizeWorkspaceRelativePath, joinPathSegments } from '../../utils/workspacePaths';
import { useFileCreation, useSearchPanel } from './hooks';
import { FileCreationBar } from './FileCreationBar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { RenameDialog } from '../../components/RenameDialog';
import { useAppStore } from '../../stores/slicedStore';
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
  t: CopyDict;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchPattern(
  query: string,
  options: { matchCase: boolean; wholeWord: boolean; useRegex: boolean }
) {
  if (!query) {
    return undefined;
  }
  const source = options.useRegex ? query : escapeRegExp(query);
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? 'g' : 'gi');
  } catch {
    return undefined;
  }
}

function FileNavigatorShell(props: FileNavigatorShellProps) {
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
    t,
  } = props;

  const navigatorMode = useUiStore((s) => s.filesNavigatorMode);
  const setNavigatorMode = useUiStore((s) => s.setFilesNavigatorMode);
  const navigatorCollapsed = useUiStore((s) => s.navigatorCollapsedByTool.files);
  const toggleNavigator = useUiStore((s) => s.toggleNavigator);
  const filesNavigatorWidth = useAppStore((s) => s.filesNavigatorWidth);
  const expandedPaths = useUiStore((s) => s.expandedFileTreePaths);
  const setFileTreePathExpanded = useUiStore((s) => s.setFileTreePathExpanded);
  const toggleFileTreePath = useUiStore((s) => s.toggleFileTreePath);
  const expandFileTreePathChain = useUiStore((s) => s.expandFileTreePathChain);
  const collapseAllFileTreePaths = useUiStore((s) => s.collapseAllFileTreePaths);

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
      if (activeWorkspaceId) expandFileTreePathChain(activeWorkspaceId, path);
    },
    setFileTreePathExpanded: (path: string, expanded: boolean) => {
      if (activeWorkspaceId) setFileTreePathExpanded(activeWorkspaceId, path, expanded);
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
    navigatorMode === 'tree' ? '文件树' : navigatorMode === 'search' ? t.searchResults : t.outline;
  const workspaceCount = visibleWorkspaces.length;

  useEffect(() => {
    if (navigatorMode === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [navigatorMode]);

  useEffect(() => {
    if (selectedFilePath && activeWorkspaceId) {
      expandFileTreePathChain(activeWorkspaceId, selectedFilePath);
    }
  }, [expandFileTreePathChain, selectedFilePath, activeWorkspaceId]);

  const handleToggleAllOutlineItems = () => {
    if (!hasExpandableOutlineItems) return;
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

  const getContextMenuItems = useCallback(
    (node: WorkspaceTreeNode): FileTreeContextMenuItem<WorkspaceTreeNode>[] => {
      const isDir = node.kind === 'directory';
      const store = useAppStore.getState();
      const hasClipboard = store.clipboardOperation !== null;
      return [
        {
          id: 'reveal',
          label: isDir ? (t.fileContextRevealDir as string) : (t.fileContextReveal as string),
          icon: <IconFolderOpen size={14} />,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const rootPath =
              store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
            if (!rootPath) return;
            const fullPath = joinPathSegments(rootPath, targetNode.path);
            await window.digitalLife.workspace.revealInFileManager(fullPath);
          },
        },
        { id: 'sep1', separator: true },
        {
          id: 'copy-full-path',
          label: t.fileContextCopyFullPath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            const store = useAppStore.getState();
            const rootPath =
              store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
            if (!rootPath) return;
            const fullPath = joinPathSegments(rootPath, targetNode.path);
            await copyToClipboard(fullPath);
          },
        },
        {
          id: 'copy-relative-path',
          label: t.fileContextCopyRelativePath as string,
          icon: <IconCopy size={14} />,
          action: async (targetNode) => {
            await copyToClipboard(targetNode.path);
          },
        },
        { id: 'sep2', separator: true },
        {
          id: 'cut',
          label: t.fileContextCut as string,
          icon: <IconClipboardList size={14} />,
          action: (targetNode) => {
            store.setClipboard('cut', targetNode.path, targetNode.kind);
          },
        },
        {
          id: 'copy-op',
          label: t.fileContextCopy as string,
          icon: <IconCopy size={14} />,
          action: (targetNode) => {
            store.setClipboard('copy', targetNode.path, targetNode.kind);
          },
        },
        {
          id: 'paste',
          label: t.fileContextPaste as string,
          icon: <IconUpload size={14} />,
          disabled: !hasClipboard,
          action: async (targetNode) => {
            const sourcePath = store.clipboardSourcePath;
            const operation = store.clipboardOperation;
            if (!sourcePath || !operation) return;
            const targetDir =
              targetNode.kind === 'directory'
                ? targetNode.path
                : targetNode.path.substring(0, targetNode.path.lastIndexOf('/') + 1);
            const sourceName = sourcePath.split('/').pop() || sourcePath;
            const newPath = targetDir ? `${targetDir}/${sourceName}` : sourceName;
            if (operation === 'copy') {
              await store.duplicateWorkspaceFile(sourcePath, newPath);
            } else if (operation === 'cut') {
              if (sourcePath === newPath) {
                store.clearClipboard();
                return;
              }
              await store.moveWorkspaceFile(sourcePath, newPath);
            }
            store.clearClipboard();
          },
        },
        { id: 'sep3', separator: true },
        {
          id: 'rename',
          label: t.fileContextRename as string,
          icon: <IconPencil size={14} />,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setRenamingPath(targetNode.path);
            setRenameDialogOpen(true);
          },
        },
        {
          id: 'delete',
          label: t.fileContextDelete as string,
          icon: <IconTrash size={14} />,
          danger: true,
          action: (targetNode) => {
            contextMenuPersistRef.current = true;
            setDeleteConfirmPath(targetNode.path);
          },
        },
      ];
    },
    [t, copyToClipboard]
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renamingPath) return;
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
          <TooltipSimple content="刷新全部" placement="top">
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
          <TooltipSimple content="文档大纲" placement="top">
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
            if (!trimmed) return false;
            if (
              /^[A-Za-z]:[\\/]/.test(trimmed) ||
              trimmed.startsWith('/') ||
              trimmed.startsWith('\\')
            )
              return false;
            return true;
          }}
          onPathChange={fileCreation.setCreatePathValue}
          onSubmit={fileCreation.submitCreate}
          onCancel={fileCreation.cancelCreate}
          t={t}
        />
      ) : null}

      {navigatorMode === 'tree' ? (
        visibleWorkspaces.length > 0 ? (
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
            t={t}
          />
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
      {renameDialogOpen && renamingPath ? (
        <RenameDialog
          open={renameDialogOpen}
          initialValue={renamingPath.split('/').pop() || ''}
          title="重命名"
          itemInfo={`当前路径: ${renamingPath}`}
          placeholder="输入新名称"
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
      ) : null}
    </aside>
  );
}

export { FileNavigatorShell };
export type { FileNavigatorShellProps };
