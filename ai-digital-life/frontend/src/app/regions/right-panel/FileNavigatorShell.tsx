import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceTreeNode,
  FileOutlineItem,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';
import { IconCircleHelp, IconReplace } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { HintCardTrigger } from '@components/HintCard';
import { Spinner } from '@components/Spinner';
import {
  SearchResultsTree,
  type SearchResultSection,
  type SearchResultFile,
  type SearchStructureSignal,
  type SearchCollapseStatus,
} from './SearchResultsTree';
import { NavigatorResizeHandle } from '@components/NavigatorResizeHandle';
import { useNavigatorResize } from '@hooks/useNavigatorResize';
import { OutlineTree, getDefaultExpandedOutlineIds } from '@features/outline';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import { useFileCreation, useSearchPanel } from './hooks';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { SearchHitEntry } from '@stores/slices/searchSlice';
import { FileNavigatorToolbar } from './FileNavigatorToolbar';
import { FileNavigatorTree } from './FileNavigatorTree';
import { FileNavigatorRenaming } from './FileNavigatorRenaming';
import { SEARCH_MAX_RESULTS } from '../../../shared/ipc/searchWindow';
import { SearchLimitHelpCard } from './SearchLimitHelpCard';

/** 结构信号 nonce：单调计数（Date.now 同毫秒连点可碰撞）。 */
let structureSignalNonce = 0;

interface FileNameHit {
  workspaceId: string;
  path: string;
  name: string;
}

/** 文件范围命中上限（与内容检索的默认页大小对齐；超限走 searchFilePartial 提示）。 */
const MAX_FILE_HITS = 200;
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
  searchEntries: SearchHitEntry[];
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
  onNavigateLine: (line: number, options?: { flash?: boolean }) => void;
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
    searchEntries,
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
    filesSearchView,
    setFilesSearchView,
    filesSearchScope,
    setFilesSearchScope,
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
      filesSearchView: s.filesSearchView,
      setFilesSearchView: s.setFilesSearchView,
      filesSearchScope: s.filesSearchScope,
      setFilesSearchScope: s.setFilesSearchScope,
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
  const searching = useAppStore((s) => s.searching);
  // 回车确认的检索词：结果区一切（过滤/分组/空态/高亮）以它为准；
  // 输入框草稿（searchQuery prop）仅控制输入值与回车提交，未回车不触发结果变化。
  const committedSearchQuery = useAppStore((s) => s.searchQuery);

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
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available),
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
    searchQuery: committedSearchQuery,
    searchResults: searchEntries,
    fileContent: undefined,
    onReplace: (value: string) => onEditorChange(value),
  });

  const filteredSearchResults = searchPanel.filteredResults;
  // 检索选项由 store 持有（useSearchPanel 已上提，事项 45）：此处解构一次供过滤与开关 UI 共用
  const searchMatchCase = searchPanel.matchCase;
  const searchMatchWholeWord = searchPanel.matchWholeWord;
  const searchUseRegex = searchPanel.useRegex;
  // 命中窗口：hasMore 是后端精确值（旧实现为"≥上限即视为被截断"的保守推断）。
  const searchHasMore = useAppStore((s) => s.searchHasMore);
  const searchLimit = useAppStore((s) => s.searchLimit);
  const searchEntriesCount = useAppStore((s) => s.searchEntries.length);
  const loadMoreSearchResults = useAppStore((s) => s.loadMoreSearchResults);
  const showAllSearchResults = useAppStore((s) => s.showAllSearchResults);
  const staleCount = useAppStore((s) => s.searchEntries.filter((entry) => entry.stale).length);

  // "文件"范围：仅按文件名匹配（目录路径不参与，避免无关文件出现）。
  // 前端基于已加载的工作区树做包含匹配（后端仅支持内容检索，
  // 不新增 IPC 以保持 Tauri/mock/preview/http 四端一致）。优先限定在用户点击选中的
  // 工作区（activeWorkspaceId），未选中时回退到全部可见工作区。
  const fileNameHits = useMemo(() => {
    if (filesSearchScope !== 'file' || !committedSearchQuery.trim()) {
      return [] as FileNameHit[];
    }
    const needle = searchMatchCase ? committedSearchQuery : committedSearchQuery.toLowerCase();
    const targetIds = activeWorkspaceId ? [activeWorkspaceId] : visibleWorkspaces.map((w) => w.id);
    const out: FileNameHit[] = [];
    for (const wsId of targetIds) {
      const roots = workspaceTrees[wsId];
      if (!roots || out.length >= MAX_FILE_HITS) {
        continue;
      }
      const stack = [...roots];
      while (stack.length > 0 && out.length < MAX_FILE_HITS) {
        const node = stack.pop();
        if (!node) {
          continue;
        }
        if (node.kind === 'file') {
          const hayName = searchMatchCase ? node.name : node.name.toLowerCase();
          if (hayName.includes(needle)) {
            out.push({ workspaceId: wsId, path: node.path, name: node.name });
          }
        } else if (node.children) {
          stack.push(...node.children);
        }
      }
    }
    return out;
  }, [
    filesSearchScope,
    committedSearchQuery,
    searchMatchCase,
    activeWorkspaceId,
    visibleWorkspaces,
    workspaceTrees,
  ]);

  const handleOpenFileNameHit = useCallback(
    (hit: FileNameHit) => {
      const ws = recentWorkspaces.find((w) => w.id === hit.workspaceId);
      if (!ws) {
        return;
      }
      const backendPath = appInfo?.currentWorkspace?.path;
      if (backendPath && ws.path === backendPath) {
        onOpenFile(hit.path);
        return;
      }
      onOpenFileForWorkspace(ws.id, ws.path, hit.path);
    },
    [recentWorkspaces, appInfo?.currentWorkspace?.path, onOpenFile, onOpenFileForWorkspace],
  );

  // 检索范围展示名：内容检索以后端当前激活工作区为准；文件检索优先显示点击选中的工作区。
  const searchScopeWorkspaceName =
    filesSearchScope === 'file' && activeWorkspaceId
      ? (visibleWorkspaces.find((w) => w.id === activeWorkspaceId)?.name ??
        appInfo?.currentWorkspace?.name)
      : appInfo?.currentWorkspace?.name;

  // 搜索框占位提示“检索 xxx”（xxx = 所要检索的工作区名）；无工作区时回退通用文案。
  const searchInputPlaceholder = searchScopeWorkspaceName
    ? formatT(t, 'searchInputPlaceholder', { name: searchScopeWorkspaceName })
    : (t.searchPanelSearch as string);

  // 内容检索结果按文件分组（保持后端返回顺序），装配为变更面板同构的行数据。
  const contentSections = useMemo<SearchResultSection[]>(() => {
    if (filesSearchScope !== 'content' || !committedSearchQuery.trim()) {
      return [];
    }
    const order: string[] = [];
    const map = new Map<string, typeof filteredSearchResults>();
    for (const result of filteredSearchResults) {
      const arr = map.get(result.path);
      if (arr) {
        arr.push(result);
      } else {
        map.set(result.path, [result]);
        order.push(result.path);
      }
    }
    const backendPath = appInfo?.currentWorkspace?.path;
    const wsId = recentWorkspaces.find((w) => w.path === backendPath)?.id ?? 'search-active';
    const files: SearchResultFile[] = order.map((path) => {
      const hits = map.get(path) ?? [];
      const firstLine = hits[0]?.line ?? 1;
      return {
        key: path,
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        matchCount: hits.length,
        snippets: hits.map((hit) => ({
          line: hit.line,
          preview: hit.preview,
          stale: hit.stale,
          onOpen: () => onOpenFileAtLine(hit.path, hit.line),
        })),
        onOpen: () => onOpenFileAtLine(path, firstLine),
        isActive: selectedFilePath === path,
      };
    });
    if (files.length === 0) {
      return [];
    }
    return [{ workspaceId: wsId, workspaceName: searchScopeWorkspaceName ?? '', files }];
  }, [
    filesSearchScope,
    committedSearchQuery,
    filteredSearchResults,
    recentWorkspaces,
    appInfo?.currentWorkspace?.path,
    searchScopeWorkspaceName,
    onOpenFileAtLine,
    selectedFilePath,
  ]);

  // 文件检索结果按工作区分组，装配为变更面板同构的行数据。
  const fileSections = useMemo<SearchResultSection[]>(() => {
    if (filesSearchScope !== 'file') {
      return [];
    }
    const order: string[] = [];
    const map = new Map<string, typeof fileNameHits>();
    for (const hit of fileNameHits) {
      const arr = map.get(hit.workspaceId);
      if (arr) {
        arr.push(hit);
      } else {
        map.set(hit.workspaceId, [hit]);
        order.push(hit.workspaceId);
      }
    }
    const wsById = new Map(recentWorkspaces.map((w) => [w.id, w]));
    return order.map((wsId) => ({
      workspaceId: wsId,
      workspaceName: wsById.get(wsId)?.name ?? '',
      files: (map.get(wsId) ?? []).map((hit) => ({
        key: hit.path,
        path: hit.path,
        name: hit.name,
        snippets: [],
        onOpen: () => handleOpenFileNameHit(hit),
        isActive:
          selectedFilePath === hit.path &&
          (selectedFileWorkspaceId === wsId || !selectedFileWorkspaceId),
      })),
    }));
  }, [
    filesSearchScope,
    fileNameHits,
    recentWorkspaces,
    selectedFilePath,
    selectedFileWorkspaceId,
    handleOpenFileNameHit,
  ]);

  const activeSections = filesSearchScope === 'content' ? contentSections : fileSections;

  // 检索模式折叠全部/展开全部：内容范围作用全体片段，文件范围作用目录树
  const [searchStructureSignal, setSearchStructureSignal] = useState<SearchStructureSignal | null>(
    null,
  );
  const [searchCollapseStatus, setSearchCollapseStatus] = useState<SearchCollapseStatus>({
    snippetsAllCollapsed: false,
    dirsAllCollapsed: false,
  });
  const handleStructureSignalConsumed = useCallback(() => {
    setSearchStructureSignal(null);
  }, []);
  const handleCollapseStatusChange = useCallback((status: SearchCollapseStatus) => {
    setSearchCollapseStatus(status);
  }, []);

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

  const inSearchMode = navigatorMode === 'search';
  const inSearchResultsView = inSearchMode && filesSearchView !== 'outline';
  // 检索模式的大纲视图与通常大纲视图共用同一套大纲折叠逻辑
  const inOutlineView =
    navigatorMode === 'outline' || (inSearchMode && filesSearchView === 'outline');
  const canToggleNavigatorStructure =
    navigatorMode === 'tree'
      ? visibleWorkspaces.length > 0
      : inOutlineView
        ? hasExpandableOutlineItems
        : inSearchResultsView
          ? activeSections.length > 0 &&
            (filesSearchScope === 'content' || filesSearchView === 'tree')
          : false;

  const structureToggleExpanded =
    navigatorMode === 'tree'
      ? allExpanded
      : inOutlineView
        ? hasExpandedOutlineItems
        : inSearchResultsView
          ? filesSearchScope === 'content'
            ? !searchCollapseStatus.snippetsAllCollapsed
            : !searchCollapseStatus.dirsAllCollapsed
          : false;

  const handleToggleNavigatorStructure = () => {
    if (inSearchResultsView) {
      // 内容范围：全体片段收起/展开；文件范围：目录树收起/展开（列表视图无目录可折叠，已禁用）
      if (filesSearchScope === 'content') {
        const collapse = !searchCollapseStatus.snippetsAllCollapsed;
        setSearchStructureSignal({
          action: collapse ? 'collapse' : 'expand',
          target: 'snippets',
          nonce: (structureSignalNonce += 1),
        });
      } else {
        const collapse = !searchCollapseStatus.dirsAllCollapsed;
        setSearchStructureSignal({
          action: collapse ? 'collapse' : 'expand',
          target: 'dirs',
          nonce: (structureSignalNonce += 1),
        });
      }
      return;
    }
    if (navigatorMode === 'tree') {
      if (allExpanded) {
        onCollapseAll();
      } else {
        onExpandAll();
      }
      return;
    }
    if (inOutlineView) {
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
        isSearchMode={navigatorMode === 'search'}
        searchView={filesSearchView}
        onSetSearchView={setFilesSearchView}
        searchScope={filesSearchScope}
        onSetSearchScope={setFilesSearchScope}
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
                placeholder={searchInputPlaceholder}
                aria-label={searchInputPlaceholder}
                disabled={visibleWorkspaces.length === 0}
              />
              <div
                className="adl-search-panel__toggles"
                role="toolbar"
                aria-label={formatT(t, 'searchOptions')}
              >
                <TooltipSimple content={t.searchPanelMatchCase} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchMatchCase ? ' is-active' : ''}`}
                    aria-pressed={searchMatchCase ? 'true' : 'false'}
                    onClick={() => searchPanel.setMatchCase((v) => !v)}
                    aria-label={t.searchPanelMatchCase as string}
                  >
                    Aa
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelMatchWholeWord} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchMatchWholeWord ? ' is-active' : ''}`}
                    aria-pressed={searchMatchWholeWord ? 'true' : 'false'}
                    // 文件范围仅子串匹配文件名： wholeWord/regex 开关无效果，直接禁用（事项 45 Phase 4 4.2）
                    disabled={filesSearchScope === 'file'}
                    onClick={() => searchPanel.setMatchWholeWord((v) => !v)}
                    aria-label={t.searchPanelMatchWholeWord as string}
                  >
                    ab
                  </button>
                </TooltipSimple>
                <TooltipSimple content={t.searchPanelUseRegex} placement="top">
                  <button
                    type="button"
                    className={`adl-search-panel__modebtn${searchUseRegex ? ' is-active' : ''}`}
                    aria-pressed={searchUseRegex ? 'true' : 'false'}
                    disabled={filesSearchScope === 'file'}
                    onClick={() => searchPanel.setUseRegex((v) => !v)}
                    aria-label={t.searchPanelUseRegex as string}
                  >
                    .*
                  </button>
                </TooltipSimple>
              </div>
            </label>
            <TooltipSimple content={t.searchPanelToggleReplace} placement="top">
              <button
                type="button"
                className={`adl-search-panel__toggle${searchPanel.replaceOpen ? ' is-open' : ''}`}
                onClick={() => searchPanel.setReplaceOpen((v) => !v)}
                aria-label={t.searchPanelToggleReplace as string}
                aria-expanded={searchPanel.replaceOpen ? 'true' : 'false'}
              >
                <IconReplace size={12} decorative />
              </button>
            </TooltipSimple>
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
                  disabled={!searchPanel.replaceQuery || !committedSearchQuery}
                  aria-label={t.searchPanelReplaceAction as string}
                >
                  <IconReplace size={14} decorative />
                </button>
              </TooltipSimple>
            </div>
          ) : null}

          {visibleWorkspaces.length > 0 && searching ? (
            <div className="adl-search-loading" role="status">
              <Spinner size="sm" speed="normal" />
              <span>{t.searchSearching as string}</span>
            </div>
          ) : null}

          {visibleWorkspaces.length === 0 ? (
            <p className="adl-empty-hint">{t.searchNoWorkspace as string}</p>
          ) : filesSearchView === 'outline' ? (
            selectedFilePath && outline.length > 0 ? (
              <OutlineTree
                items={outline}
                // 检索文件模式下的文档大纲：与检索结果片段同待遇（定位 + 落点高亮）
                onNavigate={(line) => onNavigateLine(line, { flash: true })}
                expandLabel={t.expandDetails as string}
                collapseLabel={t.collapseDetails as string}
                expandedIds={expandedOutlineIds}
                onExpandedIdsChange={setExpandedOutlineIds}
              />
            ) : (
              <p className="adl-empty-hint">
                {(selectedFilePath ? t.noDiagnostics : t.searchPlaceholder) as string}
              </p>
            )
          ) : !committedSearchQuery.trim() ? (
            <p className="adl-empty-hint">{t.searchPlaceholder as string}</p>
          ) : activeSections.length > 0 ? (
            <>
              {staleCount > 0 ? (
                <p className="adl-search-stale-summary">
                  {formatT(t, 'searchStaleSummary', { count: staleCount })}
                </p>
              ) : null}
              {/* 分页行只属于内容检索范围：文件范围有自己的 searchFilePartial 提示，
                  且旧内容命中数在文件视图下语义不符（M1） */}
              {searchEntriesCount > 0 && filesSearchScope !== 'file' ? (
                <div className="adl-search-limit" role="status">
                  <span className="adl-search-limit__text">
                    {searchHasMore
                      ? formatT(t, 'searchResultsShown', { count: searchEntriesCount })
                      : formatT(t, 'searchAllShown', { count: searchEntriesCount })}
                  </span>
                  {/* 已到安全阀（searchLimit == SEARCH_MAX_RESULTS）即终态：
                      后端仍报 hasMore 时按钮无处可去，隐藏避免"点不动的僵局"（L1） */}
                  {searchHasMore && searchLimit < SEARCH_MAX_RESULTS ? (
                    <>
                      <button
                        type="button"
                        className="adl-search-limit__action"
                        disabled={searching}
                        onClick={() => void loadMoreSearchResults()}
                      >
                        {t.searchLoadMore as string}
                      </button>
                      <button
                        type="button"
                        className="adl-search-limit__action"
                        disabled={searching}
                        onClick={() => void showAllSearchResults()}
                      >
                        {t.searchShowAll as string}
                      </button>
                    </>
                  ) : null}
                  <HintCardTrigger content={<SearchLimitHelpCard />}>
                    <button
                      type="button"
                      className="adl-icon-button adl-icon-button--info adl-search-limit__help"
                      tabIndex={-1}
                      aria-label={t.searchLimitHelpAria as string}
                    >
                      <IconCircleHelp size={14} />
                    </button>
                  </HintCardTrigger>
                </div>
              ) : null}
              {filesSearchScope === 'file' && fileNameHits.length >= MAX_FILE_HITS ? (
                <p className="adl-search-partial">{t.searchFilePartial as string}</p>
              ) : null}
              <SearchResultsTree
                sections={activeSections}
                variant={filesSearchView === 'tree' ? 'tree' : 'list'}
                query={committedSearchQuery}
                matchCase={searchMatchCase}
                wholeWord={searchMatchWholeWord}
                useRegex={searchUseRegex}
                scopeKey={`${filesSearchScope}:${filesSearchView}`}
                nameQuery={filesSearchScope === 'file' ? committedSearchQuery : ''}
                expandLabel={t.expandDetails as string}
                collapseLabel={t.collapseDetails as string}
                staleLabel={t.searchHitStale as string}
                structureSignal={searchStructureSignal}
                onStructureSignalConsumed={handleStructureSignalConsumed}
                onCollapseStatusChange={handleCollapseStatusChange}
              />
            </>
          ) : searching ? null : (
            <p className="adl-empty-hint">{t.noResults as string}</p>
          )}
        </div>
      ) : null}

      {navigatorMode === 'outline' ? (
        outline.length > 0 ? (
          <OutlineTree
            items={outline}
            // 纯大纲导航（非检索文件模式）：只定位，不做落点高亮
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
