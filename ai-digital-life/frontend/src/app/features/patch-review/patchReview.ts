import type { FilePatch, PatchHunk, PatchHunkDecision, PatchSet } from '@ai-digital-life/kernel';

export type PatchChangeKind = 'added' | 'modified' | 'deleted';
export type PatchReviewFilter = 'all' | 'pending' | 'accepted' | 'rejected';
export type PatchDirection = 'previous' | 'next';

export interface PatchReviewState {
  selectedPatchFilePath?: string;
  selectedHunkId?: string;
  collapsedHunkIds: string[];
  reviewFilter: PatchReviewFilter;
}

export interface PatchHunkSummary {
  id: string;
  filePath: string;
  preview: string;
  decision: PatchHunkDecision;
  changeKind: PatchChangeKind;
  targetLine: number;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldLines: number;
  newLines: number;
  isCollapsed: boolean;
}

export interface PatchFileSummary {
  relativePath: string;
  changeKind: PatchChangeKind;
  totalHunks: number;
  acceptedHunks: number;
  rejectedHunks: number;
  pendingHunks: number;
  dominantDecision: PatchHunkDecision;
  reviewedRatio: number;
  hunks: PatchHunkSummary[];
}

const REVIEW_FILTER_ORDER: PatchReviewFilter[] = ['all', 'pending', 'accepted', 'rejected'];

export function isPatchReviewFilter(value: string): value is PatchReviewFilter {
  return REVIEW_FILTER_ORDER.includes(value as PatchReviewFilter);
}

export function derivePatchHunkChangeKind(hunk: PatchHunk): PatchChangeKind {
  if (hunk.oldLines === 0 && hunk.newLines > 0) {
    return 'added';
  }
  if (hunk.newLines === 0 && hunk.oldLines > 0) {
    return 'deleted';
  }
  return 'modified';
}

export function derivePatchFileChangeKind(filePatch: FilePatch): PatchChangeKind {
  const kinds = new Set(filePatch.hunks.map(derivePatchHunkChangeKind));
  if (kinds.size === 1) {
    return [...kinds][0]!;
  }
  return 'modified';
}

export function getPatchHunkTargetLine(hunk: PatchHunk, contextLines = 3): number {
  const anchor = hunk.newStart > 0 ? hunk.newStart : hunk.oldStart > 0 ? hunk.oldStart : 1;
  return Math.max(1, anchor - contextLines);
}

export function getPatchHunkLineSpan(hunk: PatchHunk): { oldEnd: number; newEnd: number } {
  return {
    oldEnd: Math.max(hunk.oldStart, hunk.oldStart + Math.max(hunk.oldLines, 1) - 1),
    newEnd: Math.max(hunk.newStart, hunk.newStart + Math.max(hunk.newLines, 1) - 1),
  };
}

export function summarizePatchHunk(
  hunk: PatchHunk,
  collapsedHunkIds: string[] = []
): PatchHunkSummary {
  const span = getPatchHunkLineSpan(hunk);
  return {
    id: hunk.id,
    filePath: hunk.relativePath,
    preview: hunk.preview,
    decision: hunk.decision,
    changeKind: derivePatchHunkChangeKind(hunk),
    targetLine: getPatchHunkTargetLine(hunk),
    oldStart: hunk.oldStart,
    oldEnd: span.oldEnd,
    newStart: hunk.newStart,
    newEnd: span.newEnd,
    oldLines: hunk.oldLines,
    newLines: hunk.newLines,
    isCollapsed: collapsedHunkIds.includes(hunk.id),
  };
}

export function summarizePatchFile(
  filePatch: FilePatch,
  collapsedHunkIds: string[] = []
): PatchFileSummary {
  const hunks = filePatch.hunks.map((hunk) => summarizePatchHunk(hunk, collapsedHunkIds));
  const acceptedHunks = hunks.filter((hunk) => hunk.decision === 'accepted').length;
  const rejectedHunks = hunks.filter((hunk) => hunk.decision === 'rejected').length;
  const pendingHunks = hunks.length - acceptedHunks - rejectedHunks;
  const dominantDecision =
    pendingHunks > 0
      ? 'pending'
      : rejectedHunks > 0 && acceptedHunks === 0
        ? 'rejected'
        : 'accepted';

  return {
    relativePath: filePatch.relativePath,
    changeKind: derivePatchFileChangeKind(filePatch),
    totalHunks: hunks.length,
    acceptedHunks,
    rejectedHunks,
    pendingHunks,
    dominantDecision,
    reviewedRatio: hunks.length === 0 ? 1 : (acceptedHunks + rejectedHunks) / hunks.length,
    hunks,
  };
}

export function summarizePatchSet(
  patchSet?: PatchSet,
  collapsedHunkIds: string[] = []
): PatchFileSummary[] {
  return (
    patchSet?.filePatches.map((filePatch) => summarizePatchFile(filePatch, collapsedHunkIds)) ?? []
  );
}

export function filterPatchFileSummaries(
  summaries: PatchFileSummary[],
  filter: PatchReviewFilter
): PatchFileSummary[] {
  if (filter === 'all') {
    return summaries;
  }
  return summaries
    .map((summary) => ({
      ...summary,
      hunks: summary.hunks.filter((hunk) => hunk.decision === filter),
    }))
    .filter((summary) => summary.hunks.length > 0);
}

export function findPatchFileByPath(
  patchSet: PatchSet | undefined,
  relativePath?: string
): FilePatch | undefined {
  if (!patchSet) {
    return undefined;
  }
  if (!relativePath) {
    return patchSet.filePatches[0];
  }
  return (
    patchSet.filePatches.find((filePatch) => filePatch.relativePath === relativePath) ??
    patchSet.filePatches[0]
  );
}

export function flattenPatchHunks(patchSet?: PatchSet): PatchHunk[] {
  return patchSet?.filePatches.flatMap((filePatch) => filePatch.hunks) ?? [];
}

export function getAdjacentPatchHunk(
  patchSet: PatchSet | undefined,
  selectedHunkId: string | undefined,
  direction: PatchDirection
): PatchHunk | undefined {
  const flattened = flattenPatchHunks(patchSet);
  if (flattened.length === 0) {
    return undefined;
  }
  if (!selectedHunkId) {
    return direction === 'previous' ? flattened[flattened.length - 1] : flattened[0];
  }
  const currentIndex = flattened.findIndex((hunk) => hunk.id === selectedHunkId);
  if (currentIndex < 0) {
    return direction === 'previous' ? flattened[flattened.length - 1] : flattened[0];
  }
  const nextIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= flattened.length) {
    return flattened[currentIndex];
  }
  return flattened[nextIndex];
}

export function toggleCollapsedHunkId(collapsedHunkIds: string[], hunkId: string): string[] {
  return collapsedHunkIds.includes(hunkId)
    ? collapsedHunkIds.filter((currentId) => currentId !== hunkId)
    : [...collapsedHunkIds, hunkId];
}

export function setCollapsedHunksForFile(
  collapsedHunkIds: string[],
  filePatch: FilePatch | undefined,
  collapsed: boolean
): string[] {
  if (!filePatch) {
    return collapsed ? collapsedHunkIds : [];
  }
  const fileHunkIds = new Set(filePatch.hunks.map((hunk) => hunk.id));
  if (collapsed) {
    const merged = new Set(collapsedHunkIds);
    filePatch.hunks.forEach((hunk) => merged.add(hunk.id));
    return [...merged];
  }
  return collapsedHunkIds.filter((hunkId) => !fileHunkIds.has(hunkId));
}

export function countReviewedHunks(patchSet?: PatchSet): {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
} {
  const hunks = flattenPatchHunks(patchSet);
  const accepted = hunks.filter((hunk) => hunk.decision === 'accepted').length;
  const rejected = hunks.filter((hunk) => hunk.decision === 'rejected').length;
  return {
    total: hunks.length,
    accepted,
    rejected,
    pending: hunks.length - accepted - rejected,
  };
}
