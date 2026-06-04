import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from './useAppActions';
import { filterDiagnosticsForPath, findFirstDiagnostic } from '../utils/workspacePaths';
import {
  findPatchFileByPath,
  getAdjacentPatchHunk,
  getPatchHunkTargetLine,
  type PatchDirection,
  type PatchReviewFilter,
  setCollapsedHunksForFile,
  toggleCollapsedHunkId,
} from '../features/patch-review';

export function usePatchReview(setPendingReveal: (path: string, line: number) => void) {
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));
  const rightCollapsed = useAppStore((state) => state.rightCollapsed);
  const activeRightTool = useAppStore((state) => state.activeRightTool);
  const setActiveRightTool = useAppStore((state) => state.setActiveRightTool);
  const actions = useAppActions();

  const [editorHint, setEditorHint] = useState<string>();
  const [selectedPatchFilePath, setSelectedPatchFilePath] = useState<string>();
  const [selectedPatchHunkId, setSelectedPatchHunkId] = useState<string>();
  const [collapsedPatchHunkIds, setCollapsedPatchHunkIds] = useState<string[]>([]);
  const [patchReviewFilter, setPatchReviewFilter] = useState<PatchReviewFilter>('all');

  const validation = latestPatchApplication?.validation;
  const selectedDiagnostics = useMemo(
    () => filterDiagnosticsForPath(validation?.diagnostics ?? [], selectedFilePath),
    [selectedFilePath, validation?.diagnostics]
  );
  const activeDiagnostic = useMemo(
    () => findFirstDiagnostic(selectedDiagnostics),
    [selectedDiagnostics]
  );

  useEffect(() => {
    if (!activePatchSet) return;
    if (rightCollapsed) return;
    if (activeRightTool === 'changes') return;
    setActiveRightTool('changes');
  }, [activePatchSet, activeRightTool, rightCollapsed, setActiveRightTool]);

  useEffect(() => {
    if (!activePatchSet) {
      setSelectedPatchFilePath(undefined);
      setSelectedPatchHunkId(undefined);
      setCollapsedPatchHunkIds([]);
      setPatchReviewFilter('all');
      return;
    }

    const fallbackFile = findPatchFileByPath(
      activePatchSet,
      selectedPatchFilePath ?? selectedFilePath
    );
    const nextFilePath = fallbackFile?.relativePath;
    setSelectedPatchFilePath((current) => {
      if (
        current &&
        activePatchSet.filePatches.some((filePatchItem) => filePatchItem.relativePath === current)
      ) {
        return current;
      }
      return nextFilePath;
    });
    setSelectedPatchHunkId((current) => {
      if (
        current &&
        activePatchSet.filePatches.some((filePatchItem) =>
          filePatchItem.hunks.some((hunk) => hunk.id === current)
        )
      ) {
        return current;
      }
      return fallbackFile?.hunks[0]?.id;
    });
    setCollapsedPatchHunkIds((current) =>
      current.filter((hunkId) =>
        activePatchSet.filePatches.some((filePatchItem) =>
          filePatchItem.hunks.some((hunk) => hunk.id === hunkId)
        )
      )
    );
  }, [activePatchSet, selectedFilePath, selectedPatchFilePath]);

  useEffect(() => {
    if (!activePatchSet || !selectedFilePath) return;
    if (
      activePatchSet.filePatches.some(
        (filePatchItem) => filePatchItem.relativePath === selectedFilePath
      )
    ) {
      setSelectedPatchFilePath(selectedFilePath);
    }
  }, [activePatchSet, selectedFilePath]);

  const handleSelectPatchFile = useCallback(
    (
      relativePath: string,
      options?: { activateTool?: boolean; line?: number; hunkId?: string }
    ) => {
      const matchingFile = findPatchFileByPath(activePatchSet, relativePath);
      const nextHunkId = options?.hunkId ?? matchingFile?.hunks[0]?.id;
      setSelectedPatchFilePath(relativePath);
      if (nextHunkId) {
        setSelectedPatchHunkId(nextHunkId);
      }
      if (typeof options?.line === 'number') {
        setPendingReveal(relativePath, options.line);
      }
      if (options?.activateTool) {
        setActiveRightTool('files');
        void actions.openFile(relativePath);
      }
    },
    [activePatchSet, actions.openFile, setActiveRightTool, setPendingReveal]
  );

  const handleSelectPatchHunk = useCallback(
    (relativePath: string, hunkId: string, line: number, options?: { activateTool?: boolean }) => {
      setSelectedPatchFilePath(relativePath);
      setSelectedPatchHunkId(hunkId);
      setPendingReveal(relativePath, line);
      if (options?.activateTool) {
        setActiveRightTool('files');
        void actions.openFile(relativePath);
      }
    },
    [actions.openFile, setActiveRightTool, setPendingReveal]
  );

  const handleTogglePatchHunkCollapse = useCallback((hunkId: string) => {
    setCollapsedPatchHunkIds((current) => toggleCollapsedHunkId(current, hunkId));
  }, []);

  const handleSetAllPatchHunksCollapsed = useCallback(
    (collapsed: boolean, relativePath?: string) => {
      const targetFile = findPatchFileByPath(
        activePatchSet,
        relativePath ?? selectedPatchFilePath ?? selectedFilePath
      );
      setCollapsedPatchHunkIds((current) =>
        setCollapsedHunksForFile(current, targetFile, collapsed)
      );
    },
    [activePatchSet, selectedFilePath, selectedPatchFilePath]
  );

  const handleJumpPatchHunk = useCallback(
    (direction: PatchDirection) => {
      const nextHunk = getAdjacentPatchHunk(activePatchSet, selectedPatchHunkId, direction);
      if (!nextHunk) return;
      handleSelectPatchHunk(nextHunk.relativePath, nextHunk.id, getPatchHunkTargetLine(nextHunk), {
        activateTool: true,
      });
    },
    [activePatchSet, handleSelectPatchHunk, selectedPatchHunkId]
  );

  return {
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    editorHint,
    setEditorHint,
    selectedDiagnostics,
    activeDiagnostic,
    setPatchReviewFilter,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    handleJumpPatchHunk,
  };
}
