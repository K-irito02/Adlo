import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type {
  AppInfo,
  GitSnapshot,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
} from '@ai-digital-life/kernel';
import { buildChangeEntries, buildChangeTree } from '@regions/right-panel/changesTree';
import { collectDirectoryPaths } from '@features/file-tree';
import { buildOutlineFromContent, getDefaultExpandedOutlineIds } from '@features/outline';
import { summarizePatchSet } from '@features/patch-review';
import { joinPathSegments } from '@app/utils/workspacePaths';
import type { TreeExpansion } from '@stores/slices/uiSliceTypes';
import {
  computeVisibleWorkspaces,
  computeChangesTreeData,
  computeChangeCounts,
  computeTotalChangesStats,
  computeDirtyPathsSet,
  computeHasExpandedDirectories,
} from './useChangesPanelStateUtils';
import { useChangesPanelFilters } from './useChangesPanelFilters';

export interface UseChangesFiltersParams {
  activePatchSet: PatchSet | undefined;
  collapsedPatchHunkIds: string[];
  snapshot: GitSnapshot | undefined;
  changePreview: WorkspaceChangePreview | undefined;
  selectedPatchFilePath: string | undefined;
  selectedChangePreviewPath: string | undefined;
  appInfo: AppInfo | undefined;
  recentWorkspaces: RecentWorkspaceEntry[];
  workspaceChangesExpanded: Record<string, boolean>;
  gitSnapshots: Record<string, GitSnapshot>;
  activePatchSets: Record<string, PatchSet | undefined>;
  expandedChangesTreePaths: Record<string, TreeExpansion>;
  dirtyEditorPaths: string[];
}

export function useChangesFilters(params: UseChangesFiltersParams) {
  const {
    activePatchSet,
    collapsedPatchHunkIds,
    snapshot,
    changePreview,
    selectedPatchFilePath,
    selectedChangePreviewPath,
    appInfo,
    recentWorkspaces,
    workspaceChangesExpanded,
    gitSnapshots,
    activePatchSets,
    expandedChangesTreePaths,
    dirtyEditorPaths,
  } = params;
  const changesNavigatorMode = useAppStore((s) => s.changesNavigatorMode);
  const changesNavigatorActiveWorkspaceId = useAppStore((s) => s.changesNavigatorActiveWorkspaceId);

  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds],
  );
  const changeEntries = useMemo(
    () => buildChangeEntries(snapshot, patchSummaries),
    [patchSummaries, snapshot],
  );
  const { changesStatusFilter, filteredChangeEntries, onStatusFilterClick } =
    useChangesPanelFilters(changeEntries);
  const treeNodes = useMemo(() => buildChangeTree(filteredChangeEntries), [filteredChangeEntries]);
  const directoryPaths = useMemo(() => collectDirectoryPaths(treeNodes), [treeNodes]);
  const navigatorSelectedPath = selectedPatchFilePath ?? selectedChangePreviewPath;
  const changeOutline = useMemo(
    () =>
      changePreview
        ? buildOutlineFromContent(changePreview.currentContent, changePreview.path)
        : [],
    [changePreview],
  );
  const defaultExpandedOutlineIds = useMemo(
    () => getDefaultExpandedOutlineIds(changeOutline),
    [changeOutline],
  );
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(
    () => defaultExpandedOutlineIds,
  );
  useEffect(() => {
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);
  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;

  const navigatorRelativePath = selectedPatchFilePath ?? selectedChangePreviewPath;

  const navigatorAbsolutePath = useMemo(() => {
    if (!navigatorRelativePath) {
      return undefined;
    }
    const wsPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
    if (!wsPath) {
      return undefined;
    }
    return joinPathSegments(wsPath, navigatorRelativePath);
  }, [navigatorRelativePath, appInfo]);

  // Changes 面板"选中工作区"：优先取用户点击选中的工作区（轻量前端态，不触发重载），
  // 未选中时回退到后端当前激活工作区。与 Files 面板 fileNavigatorActiveWorkspaceId 行为一致。
  const derivedActiveWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;
  const activeWorkspaceId = changesNavigatorActiveWorkspaceId ?? derivedActiveWorkspaceId;

  // 单工作区目录开关（toolbar toggle-all 用的状态与动作）按选中工作区隔离：
  // 只取该工作区的扁平展开表，未记录的工作区视为空展开。
  const expandedPaths = useMemo(
    () => expandedChangesTreePaths[activeWorkspaceId ?? '']?.expanded ?? {},
    [expandedChangesTreePaths, activeWorkspaceId],
  );
  const hasExpandedDirectories = useMemo(
    () => computeHasExpandedDirectories(directoryPaths, expandedPaths),
    [directoryPaths, expandedPaths],
  );

  const visibleWorkspaces = useMemo(
    () => computeVisibleWorkspaces(recentWorkspaces),
    [recentWorkspaces],
  );

  const changesTreeData = useMemo(
    () =>
      computeChangesTreeData(
        workspaceChangesExpanded,
        gitSnapshots,
        activePatchSets,
        collapsedPatchHunkIds,
        changesNavigatorMode,
        changesStatusFilter,
      ),
    [
      workspaceChangesExpanded,
      gitSnapshots,
      activePatchSets,
      collapsedPatchHunkIds,
      changesNavigatorMode,
      changesStatusFilter,
    ],
  );
  const changeCounts = useMemo(
    () => computeChangeCounts(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots],
  );
  const totalChangeCount = useMemo(
    () => Object.values(changeCounts).reduce((s, c) => s + c, 0),
    [changeCounts],
  );
  const totalChangesStats = useMemo(
    () => computeTotalChangesStats(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots],
  );
  const dirtyPathsSet = useMemo(() => computeDirtyPathsSet(dirtyEditorPaths), [dirtyEditorPaths]);

  return {
    patchSummaries,
    changeEntries,
    filteredChangeEntries,
    changesStatusFilter,
    onStatusFilterClick,
    treeNodes,
    directoryPaths,
    hasExpandedDirectories,
    navigatorSelectedPath,
    changeOutline,
    defaultExpandedOutlineIds,
    expandedOutlineIds,
    setExpandedOutlineIds,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    navigatorRelativePath,
    navigatorAbsolutePath,
    activeWorkspaceId,
    visibleWorkspaces,
    changesTreeData,
    changeCounts,
    totalChangeCount,
    totalChangesStats,
    dirtyPathsSet,
  };
}
