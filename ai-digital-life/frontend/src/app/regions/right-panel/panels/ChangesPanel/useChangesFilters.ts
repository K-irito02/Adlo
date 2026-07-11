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
import {
  computeVisibleWorkspaces,
  computeChangesTreeData,
  computeChangeCounts,
  computeTotalChangesStats,
  computeExpandedPathsByWs,
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
  expandedPaths: Record<string, boolean>;
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
    expandedPaths,
    dirtyEditorPaths,
  } = params;
  const changesNavigatorMode = useAppStore((s) => s.changesNavigatorMode);

  const patchSummaries = useMemo(
    () => summarizePatchSet(activePatchSet, collapsedPatchHunkIds),
    [activePatchSet, collapsedPatchHunkIds]
  );
  const changeEntries = useMemo(
    () => buildChangeEntries(snapshot, patchSummaries),
    [patchSummaries, snapshot]
  );
  const { changesStatusFilter, filteredChangeEntries, onStatusFilterClick } =
    useChangesPanelFilters(changeEntries);
  const treeNodes = useMemo(() => buildChangeTree(filteredChangeEntries), [filteredChangeEntries]);
  const directoryPaths = useMemo(() => collectDirectoryPaths(treeNodes), [treeNodes]);
  const hasExpandedDirectories = useMemo(
    () => computeHasExpandedDirectories(directoryPaths, expandedPaths),
    [directoryPaths, expandedPaths]
  );
  const navigatorSelectedPath = selectedPatchFilePath ?? selectedChangePreviewPath;
  const changeOutline = useMemo(
    () =>
      changePreview
        ? buildOutlineFromContent(changePreview.currentContent, changePreview.path)
        : [],
    [changePreview]
  );
  const defaultExpandedOutlineIds = useMemo(
    () => getDefaultExpandedOutlineIds(changeOutline),
    [changeOutline]
  );
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(
    () => defaultExpandedOutlineIds
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

  const activeWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;

  const visibleWorkspaces = useMemo(
    () => computeVisibleWorkspaces(recentWorkspaces),
    [recentWorkspaces]
  );

  const changesTreeData = useMemo(
    () =>
      computeChangesTreeData(
        workspaceChangesExpanded,
        gitSnapshots,
        activePatchSets,
        collapsedPatchHunkIds,
        changesNavigatorMode,
        changesStatusFilter
      ),
    [
      workspaceChangesExpanded,
      gitSnapshots,
      activePatchSets,
      collapsedPatchHunkIds,
      changesNavigatorMode,
      changesStatusFilter,
    ]
  );
  const changeCounts = useMemo(
    () => computeChangeCounts(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots]
  );
  const totalChangeCount = useMemo(
    () => Object.values(changeCounts).reduce((s, c) => s + c, 0),
    [changeCounts]
  );
  const totalChangesStats = useMemo(
    () => computeTotalChangesStats(visibleWorkspaces, gitSnapshots),
    [visibleWorkspaces, gitSnapshots]
  );
  const expandedPathsByWs = useMemo(
    () => computeExpandedPathsByWs(workspaceChangesExpanded, expandedPaths),
    [workspaceChangesExpanded, expandedPaths]
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
    expandedPathsByWs,
    dirtyPathsSet,
  };
}
