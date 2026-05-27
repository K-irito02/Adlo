import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../stores/slicedStore";
import { useAppActions } from "../../../hooks/useAppActions";
import type { ChangesPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useChangesPanelProps(
  panelProps: RightPanelProps,
  diffSideBySide: boolean,
  onSetDiffLayout: (sideBySide: boolean) => void
): ChangesPanelProps {
  const {
    t,
    selectedPatchFilePath, selectedPatchHunkId, collapsedPatchHunkIds,
    patchReviewFilter,
    onSelectPatchFile, onSelectPatchHunk, onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed, onSetPatchReviewFilter, onJumpPatchHunk
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
  }, [actions.applyPatchSet]);

  const handleRollbackPatchSet = useCallback(() => {
    const currentPatchSet = useAppStore.getState().activePatchSet;
    if (currentPatchSet) void actions.rollbackPatchSet(currentPatchSet.id);
  }, [actions.rollbackPatchSet]);

  const handleSetHunkDecision = useCallback(
    (hunkId: string, decision: "pending" | "accepted" | "rejected") => {
      const currentPatchSet = useAppStore.getState().activePatchSet;
      if (currentPatchSet) void actions.setHunkDecision(currentPatchSet.id, hunkId, decision);
    },
    [actions.setHunkDecision]
  );

  return {
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
    onAcceptAllHunks: () => void actions.acceptAllHunks(),
    onRejectAllHunks: () => void actions.rejectAllHunks(),
    onSelectPatchFile,
    onOpenChangePreview: (path) => void actions.openChangePreview(path),
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onSetPatchReviewFilter,
    onOpenFile: (path) => void actions.openFile(path),
    onRefreshWorkspaceTree: () => void actions.refreshWorkspaceTree(),
    recentWorkspaces,
    workspaceChangesExpanded,
    gitSnapshot,
    gitSnapshots,
    activePatchSets,
    onHideFromRightPanels: (workspaceId) => void actions.hideWorkspaceFromRightPanels(workspaceId),
    diffSideBySide,
    onSetDiffLayout,
    dirtyEditorPaths,
    externalChangePath: externalFileChange?.path,
    onJumpPatchHunk,
  };
}
