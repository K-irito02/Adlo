import { useMemo } from 'react';
import type { FileOutlineItem, FilePatch, PatchSet } from '@ai-digital-life/kernel';
import {
  derivePatchHunkChangeKind,
  summarizePatchFile,
  type PatchFileSummary,
} from '@features/patch-review';
import type { PreviewDiffVisualRange } from '@features/diff-viewer';
import type { EditorRef } from '@stores/types';
import type { FilePreviewModeState } from '@stores/slices/uiSlice';
import type { FileCategory } from './fileTypeRouter';
import { categorizeFile } from './fileTypeRouter';
import type { AgentHunkDecoration } from './editor-support/agentDecorations';
import type { UseStickyContextInput } from './hooks';

export interface UseDiffStickyRangesInput {
  selectedFilePath: string | undefined;
  fileContent: string | undefined;
  filePatch: FilePatch | undefined;
  filePreviewModeByPath: FilePreviewModeState;
  activePatchSet: PatchSet | undefined;
  selectedPatchFilePath: string | undefined;
  collapsedPatchHunkIds: string[];
  selectedPatchHunkId: string | undefined;
  outline: FileOutlineItem[];
  getStickySourceEditor: () => EditorRef | null;
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  wordWrapEnabled: boolean;
  diffSideBySide: boolean;
}

export interface UseDiffStickyRangesOutput {
  fileCategory: FileCategory;
  previewEnabled: boolean;
  hasActivePatch: boolean;
  activeFilePatch: FilePatch | undefined;
  activeFilePatchSummary: PatchFileSummary | undefined;
  stickyDiffRanges: PreviewDiffVisualRange[] | undefined;
  agentHunkDecorations: AgentHunkDecoration[];
  stickyContextContent: string;
  stickyContextInput: UseStickyContextInput;
}

export function buildStickyDiffRangesFromHunks(
  hunks: PatchFileSummary['hunks']
): PreviewDiffVisualRange[] {
  return hunks.flatMap((hunk) => {
    const anchorLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
    const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
    if (hunk.changeKind === 'added') {
      return [
        {
          startLine: anchorLine,
          endLine: anchorLine + lineSpan - 1,
          type: 'insert' as const,
          tone: 'strong' as const,
          contentColumns: 1,
        },
      ];
    }
    if (hunk.changeKind === 'deleted') {
      return [
        {
          startLine: anchorLine,
          endLine: anchorLine,
          type: 'delete' as const,
          tone: 'base' as const,
          contentColumns: 1,
        },
      ];
    }
    return [
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: 'insert' as const,
        tone: 'strong' as const,
        contentColumns: 1,
      },
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: 'delete' as const,
        tone: 'base' as const,
        contentColumns: 1,
      },
    ];
  });
}

export function useDiffStickyRanges(input: UseDiffStickyRangesInput): UseDiffStickyRangesOutput {
  const {
    selectedFilePath,
    fileContent,
    filePatch,
    filePreviewModeByPath,
    activePatchSet,
    selectedPatchFilePath,
    collapsedPatchHunkIds,
    selectedPatchHunkId,
    outline,
    getStickySourceEditor,
    editorSurfaceRef,
    wordWrapEnabled,
    diffSideBySide,
  } = input;

  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);

  const previewEnabled = selectedFilePath
    ? (filePreviewModeByPath[selectedFilePath] ?? fileCategory === 'markdown')
    : false;

  const hasActivePatch = !!(filePatch && filePatch.relativePath === selectedFilePath);

  const activeFilePatch = useMemo(() => {
    if (!activePatchSet || !selectedPatchFilePath) {
      return undefined;
    }
    return activePatchSet.filePatches.find((c) => c.relativePath === selectedPatchFilePath);
  }, [activePatchSet, selectedPatchFilePath]);

  const activeFilePatchSummary = useMemo(
    () =>
      activeFilePatch ? summarizePatchFile(activeFilePatch, collapsedPatchHunkIds) : undefined,
    [activeFilePatch, collapsedPatchHunkIds]
  );

  const stickyDiffRanges = useMemo(
    () =>
      activeFilePatchSummary
        ? buildStickyDiffRangesFromHunks(activeFilePatchSummary.hunks)
        : undefined,
    [activeFilePatchSummary]
  );

  const agentHunkDecorations = useMemo<AgentHunkDecoration[]>(() => {
    if (!activeFilePatch || !selectedFilePath) {
      return [];
    }
    return activeFilePatch.hunks.map((hunk) => {
      const changeKind = derivePatchHunkChangeKind(hunk);
      const startLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
      const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
      const endLine = startLine + lineSpan - 1;
      return {
        startLine,
        endLine,
        changeKind,
        decision: (hunk.decision === 'accepted'
          ? 'accepted'
          : hunk.decision === 'rejected'
            ? 'rejected'
            : 'pending') as 'accepted' | 'rejected' | 'pending',
        isSelected: selectedPatchHunkId === hunk.id,
        hunkId: hunk.id,
      };
    });
  }, [activeFilePatch, selectedPatchHunkId, selectedFilePath]);

  const stickyContextContent =
    filePatch && filePatch.relativePath === selectedFilePath
      ? (filePatch.afterContent ?? '')
      : (fileContent ?? '');

  const stickyContextInput = useMemo(
    () => ({
      selectedFilePath,
      content: stickyContextContent,
      outline,
      getStickySourceEditor,
      wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef,
      stickyDiffRanges,
    }),
    [
      selectedFilePath,
      stickyContextContent,
      outline,
      getStickySourceEditor,
      wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef,
      stickyDiffRanges,
    ]
  );

  return {
    fileCategory,
    previewEnabled,
    hasActivePatch,
    activeFilePatch,
    activeFilePatchSummary,
    stickyDiffRanges,
    agentHunkDecorations,
    stickyContextContent,
    stickyContextInput,
  };
}
