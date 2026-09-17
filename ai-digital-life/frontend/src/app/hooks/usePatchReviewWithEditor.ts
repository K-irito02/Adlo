import { useCallback, useRef } from 'react';
import { useAppStore } from '../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppActions } from './useAppActions';
import { usePatchReview } from './usePatchReview';
import { useEditorReveal } from './useEditorReveal';

export function usePatchReviewWithEditor() {
  const { selectedFilePath, fileLastModifiedAt, fileContent } = useAppStore(
    useShallow((s) => ({
      selectedFilePath: s.selectedFilePath,
      fileLastModifiedAt: s.fileLastModifiedAt,
      fileContent: s.fileContent,
    })),
  );
  const actions = useAppActions();

  const pendingRevealRef = useRef<{ path: string; line: number } | null>(null);
  const setPendingReveal = useCallback((path: string, line: number) => {
    pendingRevealRef.current = { path, line };
  }, []);

  const {
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    activeDiagnostic,
    setPatchReviewFilter,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    handleJumpPatchHunk,
  } = usePatchReview(setPendingReveal);

  const { standardEditorRef, handleOpenFileAtLine, handleDiffMount } = useEditorReveal(
    selectedFilePath,
    activeDiagnostic,
    fileLastModifiedAt,
    { openFile: actions.openFile },
    pendingRevealRef,
    setPendingReveal,
    fileContent,
  );

  return {
    standardEditorRef,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    handleOpenFileAtLine,
    handleDiffMount,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    setPatchReviewFilter,
    handleJumpPatchHunk,
  };
}
