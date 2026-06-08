import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../stores/slicedStore';
import { useAppActions } from '../../../hooks/useAppActions';
import type { ChangesPanelProps } from '../types';
import type { RightPanelProps } from '../../RightPanel';

export function useChangesPanelProps(
  panelProps: RightPanelProps,
  diffSideBySide: boolean,
  onSetDiffLayout: (sideBySide: boolean) => void
): ChangesPanelProps {
  const {
    t,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    onSelectPatchFile,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onJumpPatchHunk,
    onDiffMount,
  } = panelProps;

  const actions = useAppActions();
  const appInfo = useAppStore((s) => s.appInfo);
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));
  const selectedChangePreviewPath = useAppStore((s) => s.selectedChangePreviewPath);
  const selectedChangePreviewWorkspaceId = useAppStore((s) => s.selectedChangePreviewWorkspaceId);
  const changePreview = useAppStore(useShallow((s) => s.changePreview));
  const changePreviewLoading = useAppStore((s) => s.changePreviewLoading);
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const workspaceChangesExpanded = useAppStore(useShallow((s) => s.workspaceChangesExpanded));
  const gitSnapshot = useAppStore(useShallow((s) => s.gitSnapshot));
  const gitSnapshots = useAppStore(useShallow((s) => s.gitSnapshots));
  const activePatchSets = useAppStore(useShallow((s) => s.activePatchSets));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
  const externalFileChange = useAppStore(useShallow((s) => s.externalFileChange));

  const handleApplyPatchSet = useCallback(() => {
    const currentPatchSet = useAppStore.getState().activePatchSet;
    if (currentPatchSet) void actions.applyPatchSet(currentPatchSet.id);
  }, [actions]);

  const handleRollbackPatchSet = useCallback(() => {
    const currentPatchSet = useAppStore.getState().activePatchSet;
    if (currentPatchSet) void actions.rollbackPatchSet(currentPatchSet.id);
  }, [actions]);

  const handleSetHunkDecision = useCallback(
    (hunkId: string, decision: 'pending' | 'accepted' | 'rejected') => {
      const currentPatchSet = useAppStore.getState().activePatchSet;
      if (currentPatchSet) void actions.setHunkDecision(currentPatchSet.id, hunkId, decision);
    },
    [actions]
  );

  const handleAcceptAllHunks = useCallback(() => {
    void actions.acceptAllHunks();
  }, [actions]);

  const handleRejectAllHunks = useCallback(() => {
    void actions.rejectAllHunks();
  }, [actions]);

  const handleOpenChangePreview = useCallback(
    (path: string) => {
      void actions.openChangePreview(path);
    },
    [actions]
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      void actions.openFile(path);
    },
    [actions]
  );

  const handleRefreshWorkspaceTree = useCallback(() => {
    void actions.refreshWorkspaceTree();
  }, [actions]);

  const handleHideFromRightPanels = useCallback(
    (workspaceId: string) => {
      void actions.hideWorkspaceFromRightPanels(workspaceId);
    },
    [actions]
  );

  return useMemo(
    () => ({
      t,
      appInfo,
      activePatchSet,
      latestPatchApplication,
      selectedPatchFilePath,
      selectedChangePreviewPath,
      selectedChangePreviewWorkspaceId,
      changePreview,
      changePreviewLoading,
      selectedPatchHunkId,
      collapsedPatchHunkIds,
      patchReviewFilter,
      onSetHunkDecision: handleSetHunkDecision,
      onApplyPatchSet: handleApplyPatchSet,
      onRollbackPatchSet: handleRollbackPatchSet,
      onAcceptAllHunks: handleAcceptAllHunks,
      onRejectAllHunks: handleRejectAllHunks,
      onSelectPatchFile,
      onOpenChangePreview: handleOpenChangePreview,
      onSelectPatchHunk,
      onTogglePatchHunkCollapse,
      onSetAllPatchHunksCollapsed,
      onSetPatchReviewFilter,
      onOpenFile: handleOpenFile,
      onRefreshWorkspaceTree: handleRefreshWorkspaceTree,
      recentWorkspaces,
      workspaceChangesExpanded,
      gitSnapshot,
      gitSnapshots,
      activePatchSets,
      onHideFromRightPanels: handleHideFromRightPanels,
      diffSideBySide,
      onSetDiffLayout,
      dirtyEditorPaths,
      externalChangePath: externalFileChange?.path,
      onJumpPatchHunk,
      onDiffMount,
    }),
    [
      t,
      appInfo,
      activePatchSet,
      onDiffMount,
      latestPatchApplication,
      selectedPatchFilePath,
      selectedChangePreviewPath,
      selectedChangePreviewWorkspaceId,
      changePreview,
      changePreviewLoading,
      selectedPatchHunkId,
      collapsedPatchHunkIds,
      patchReviewFilter,
      handleSetHunkDecision,
      handleApplyPatchSet,
      handleRollbackPatchSet,
      handleAcceptAllHunks,
      handleRejectAllHunks,
      onSelectPatchFile,
      handleOpenChangePreview,
      onSelectPatchHunk,
      onTogglePatchHunkCollapse,
      onSetAllPatchHunksCollapsed,
      onSetPatchReviewFilter,
      handleOpenFile,
      handleRefreshWorkspaceTree,
      recentWorkspaces,
      workspaceChangesExpanded,
      gitSnapshot,
      gitSnapshots,
      activePatchSets,
      handleHideFromRightPanels,
      diffSideBySide,
      onSetDiffLayout,
      dirtyEditorPaths,
      externalFileChange?.path,
      onJumpPatchHunk,
    ]
  );
}
