import { useCallback, useRef } from 'react';
import type { Locale } from '../i18n';
import { useAppStore } from '../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppActions } from './useAppActions';
import { usePatchReview } from './usePatchReview';
import { useEditorReveal } from './useEditorReveal';

export function usePatchReviewWithEditor(locale: Locale) {
  const { selectedFilePath, fileLastModifiedAt } = useAppStore(
    useShallow((s) => ({
      selectedFilePath: s.selectedFilePath,
      fileLastModifiedAt: s.fileLastModifiedAt,
    }))
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
    setEditorHint,
    activeDiagnostic,
    setPatchReviewFilter,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    handleJumpPatchHunk,
  } = usePatchReview(setPendingReveal);

  const { standardEditorRef, handleOpenFileAtLine, handleSendSelection, handleDiffMount } =
    useEditorReveal(
      selectedFilePath,
      activeDiagnostic,
      fileLastModifiedAt,
      { sendMessage: actions.sendMessage, openFile: actions.openFile },
      locale,
      setEditorHint,
      pendingRevealRef,
      setPendingReveal
    );

  return {
    standardEditorRef,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    patchReviewFilter,
    handleOpenFileAtLine,
    handleDiffMount,
    handleSendSelection,
    handleSelectPatchFile,
    handleSelectPatchHunk,
    handleTogglePatchHunkCollapse,
    handleSetAllPatchHunksCollapsed,
    setPatchReviewFilter,
    handleJumpPatchHunk,
  };
}
