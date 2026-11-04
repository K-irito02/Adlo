import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type {
  AppInfo,
  GitSnapshot,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
} from '@adlo/kernel';
import { buildChangeEntries, buildChangeTree } from '@regions/right-panel/changesTree';
import { collectDirectoryPaths } from '@features/file-tree';
import { getDefaultExpandedOutlineIds, outlineForChangePreview } from '@features/outline';
import { isHeavyDiffContent } from '@regions/right-panel/heavyPreviewLimits';
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
  // Changes 面板"选中工作区"：优先取用户点击选中的工作区（轻量前端态，不触发重载，
  // 事项1 起落盘 `adl:changes.activeWorkspace`，重启后仍在），
  // 未选中时回退到后端当前激活工作区。与 Files 面板 fileNavigatorActiveWorkspaceId 行为一致。
  // （位置提前：下方大纲回填 effect 与 persist 回调在词法上先出现，须先声明避 TDZ。）
  // 可见工作区同样提前：陈旧选中 id（已移除/隐藏）派生式回退，不写回 store。
  const visibleWorkspaces = useMemo(
    () => computeVisibleWorkspaces(recentWorkspaces),
    [recentWorkspaces],
  );
  const derivedActiveWorkspaceId = appInfo?.currentWorkspace?.path
    ? recentWorkspaces.find((w) => w.path === appInfo.currentWorkspace?.path)?.id
    : undefined;
  const storedActiveWorkspaceId =
    changesNavigatorActiveWorkspaceId &&
    visibleWorkspaces.some((w) => w.id === changesNavigatorActiveWorkspaceId)
      ? changesNavigatorActiveWorkspaceId
      : undefined;
  const activeWorkspaceId = storedActiveWorkspaceId ?? derivedActiveWorkspaceId;
  const changeOutline = useMemo(
    () =>
      // 大纲去重（事项4）：与 DiffEditorSection 本地大纲同输入，WeakMap 共享一次 walk。
      // 重型跳过语义不变（方案A-2：巨型 current 全文 walk 本身即主线程块）。
      changePreview
        ? outlineForChangePreview(
            changePreview,
            isHeavyDiffContent(changePreview.baseContent, changePreview.currentContent),
          )
        : [],
    [changePreview],
  );
  const defaultExpandedOutlineIds = useMemo(
    () => getDefaultExpandedOutlineIds(changeOutline),
    [changeOutline],
  );
  const [expandedOutlineIds, setExpandedOutlineIds] = useState<Set<string>>(() => {
    // 挂载时按工作区回填已存展开（`adl:changes.outlineExpanded`，Task 23），
    // 无记录时回退默认展开（与文件侧 persistOutlineIds 同形）。
    const stored =
      activeWorkspaceId !== undefined
        ? useAppStore.getState().changesOutlineExpanded[activeWorkspaceId]
        : undefined;
    return stored !== undefined ? new Set(stored) : defaultExpandedOutlineIds;
  });
  const prevOutlineDefaultsRef = useRef(defaultExpandedOutlineIds);
  useEffect(() => {
    if (prevOutlineDefaultsRef.current === defaultExpandedOutlineIds) {
      return;
    }
    prevOutlineDefaultsRef.current = defaultExpandedOutlineIds;
    // 预览内容切换导致默认展开变化：只重置本地视图，不写盘（同文件侧理由，
    // 见 FileNavigatorShell 的 persistOutlineIds 注释）。
    setExpandedOutlineIds(defaultExpandedOutlineIds);
  }, [defaultExpandedOutlineIds]);
  const hasExpandableOutlineItems = defaultExpandedOutlineIds.size > 0;
  const hasExpandedOutlineItems = expandedOutlineIds.size > 0;

  // 用户折叠/展开即写回 store（按当前选中工作区隔离）
  const persistChangesOutlineIds = useCallback(
    (ids: Set<string>) => {
      setExpandedOutlineIds(ids);
      const wsId =
        useAppStore.getState().changesNavigatorActiveWorkspaceId ?? derivedActiveWorkspaceId;
      if (wsId !== undefined) {
        useAppStore.getState().setChangesOutlineExpanded(wsId, [...ids]);
      }
    },
    [derivedActiveWorkspaceId],
  );

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
    setExpandedOutlineIds: persistChangesOutlineIds,
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
