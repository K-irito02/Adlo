import type React from 'react';
import type { EditorView } from '@codemirror/view';
import { getChunks, uncollapseUnchanged } from '@codemirror/merge';
import type { ChangeTreeNode, ChangeFileState } from '@regions/right-panel/changesTree';
import {
  buildChangeEntries,
  buildChangeTree,
  buildFlatChangeNodes,
} from '@regions/right-panel/changesTree';
import type { FileTreeRenderableNode } from '@features/file-tree';
import type {
  WorkspaceChangePreview,
  RecentWorkspaceEntry,
  GitSnapshot,
  PatchSet,
} from '@ai-digital-life/kernel';
import { summarizePatchSet } from '@features/patch-review';
import type { CopyDict } from '@app/i18n';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { categorizeFile } from '@regions/right-panel/fileTypeRouter';
import { normalizeWorkspaceRelativePath } from '@app/utils/workspacePaths';

export function findCollapsedSectionStart(view: EditorView, targetLine: number): number | null {
  const margin = 3;
  const minSize = 4;
  const chunks = getChunks(view.state)?.chunks ?? [];
  let prevLine = 1;
  for (let i = 0; ; i++) {
    const chunk = i < chunks.length ? chunks[i] : null;
    const collapseFrom = i > 0 ? prevLine + margin : 1;
    const collapseTo = chunk
      ? Math.max(
          view.state.doc.lineAt(Math.min(view.state.doc.length, chunk.fromB)).number - 1 - margin,
          collapseFrom
        )
      : view.state.doc.lines;
    const lineCount = collapseTo - collapseFrom + 1;
    if (lineCount >= minSize && collapseFrom <= targetLine && targetLine <= collapseTo) {
      return view.state.doc.line(collapseFrom).from;
    }
    if (!chunk) {
      break;
    }
    prevLine = view.state.doc.lineAt(Math.min(view.state.doc.length, chunk.toB)).number;
  }
  return null;
}

export function isNodeDeleted(node: FileTreeRenderableNode): boolean {
  return (node as ChangeTreeNode).patchSummary?.changeKind === 'deleted';
}

export function computeChangesMenuItems(
  t: CopyDict,
  lineNumbersEnabled: boolean,
  wordWrapEnabled: boolean,
  toggleLineNumbers: () => void,
  toggleWordWrap: () => void
) {
  return [
    {
      id: 'line-numbers',
      label: t.fileLineNumbers,
      checked: lineNumbersEnabled,
      action: toggleLineNumbers,
    },
    {
      id: 'word-wrap',
      label: t.fileWordWrap,
      checked: wordWrapEnabled,
      action: toggleWordWrap,
    },
  ];
}

export function computeVisibleWorkspaces(recentWorkspaces: RecentWorkspaceEntry[]) {
  return recentWorkspaces.filter(
    (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
  );
}

export function computeAllChangesExpanded(
  visibleWorkspaces: RecentWorkspaceEntry[],
  workspaceChangesExpanded: Record<string, boolean>
): boolean {
  return (
    visibleWorkspaces.length > 0 && visibleWorkspaces.every((w) => workspaceChangesExpanded[w.id])
  );
}

export function computeCanToggleNavigatorStructure(
  changesNavigatorMode: 'tree' | 'list' | 'outline',
  visibleWorkspaces: RecentWorkspaceEntry[],
  hasExpandableOutlineItems: boolean
): boolean {
  if (changesNavigatorMode === 'tree' || changesNavigatorMode === 'list') {
    return visibleWorkspaces.length > 0;
  }
  if (changesNavigatorMode === 'outline') {
    return hasExpandableOutlineItems;
  }
  return false;
}

export function computeStructureToggleExpanded(
  changesNavigatorMode: 'tree' | 'list' | 'outline',
  allChangesExpanded: boolean,
  hasExpandedOutlineItems: boolean
): boolean {
  if (changesNavigatorMode === 'tree' || changesNavigatorMode === 'list') {
    return allChangesExpanded;
  }
  if (changesNavigatorMode === 'outline') {
    return hasExpandedOutlineItems;
  }
  return false;
}

export function computeChangesNavigatorTitle(
  changesNavigatorMode: 'tree' | 'list' | 'outline',
  t: CopyDict
): string {
  if (changesNavigatorMode === 'outline') {
    return t.outline;
  }
  if (changesNavigatorMode === 'list') {
    return t.changesListView;
  }
  return t.changesFileTree;
}

export function computeChangesTreeData(
  workspaceChangesExpanded: Record<string, boolean>,
  gitSnapshots: Record<string, GitSnapshot>,
  activePatchSets: Record<string, PatchSet | undefined>,
  collapsedPatchHunkIds: string[],
  changesNavigatorMode: 'tree' | 'list' | 'outline',
  changesStatusFilter: Set<ChangeFileState>
): Record<string, ChangeTreeNode[]> {
  const result: Record<string, ChangeTreeNode[]> = {};
  for (const wsId of Object.keys(workspaceChangesExpanded)) {
    if (workspaceChangesExpanded[wsId]) {
      const snapshot = gitSnapshots[wsId];
      const patchSet = activePatchSets[wsId];
      const patchSummaries = patchSet ? summarizePatchSet(patchSet, collapsedPatchHunkIds) : [];
      const entries = snapshot ? buildChangeEntries(snapshot, patchSummaries) : [];
      const filtered =
        changesStatusFilter.size > 0 && changesStatusFilter.size < 3
          ? entries.filter((entry) => entry.states.some((state) => changesStatusFilter.has(state)))
          : entries;
      if (changesNavigatorMode === 'tree') {
        result[wsId] = buildChangeTree(filtered);
      } else {
        result[wsId] = buildFlatChangeNodes(filtered);
      }
    }
  }
  return result;
}

export function computeChangeCounts(
  visibleWorkspaces: RecentWorkspaceEntry[],
  gitSnapshots: Record<string, GitSnapshot>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ws of visibleWorkspaces) {
    const snapshot = gitSnapshots[ws.id];
    if (snapshot) {
      result[ws.id] =
        snapshot.staged.length +
        snapshot.unstaged.length +
        snapshot.untracked.length +
        snapshot.conflicts.length;
    } else {
      result[ws.id] = 0;
    }
  }
  return result;
}

export function computeTotalChangesStats(
  visibleWorkspaces: RecentWorkspaceEntry[],
  gitSnapshots: Record<string, GitSnapshot>
): { staged: number; unstaged: number; untracked: number } {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const ws of visibleWorkspaces) {
    const snapshot = gitSnapshots[ws.id];
    if (snapshot) {
      staged += snapshot.staged.length;
      unstaged += snapshot.unstaged.length;
      untracked += snapshot.untracked.length;
    }
  }
  return { staged, unstaged, untracked };
}

export function computeExpandedPathsByWs(
  workspaceChangesExpanded: Record<string, boolean>,
  expandedPaths: Record<string, boolean>
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  for (const wsId of Object.keys(workspaceChangesExpanded)) {
    result[wsId] = expandedPaths;
  }
  return result;
}

export function computeDirtyPathsSet(dirtyEditorPaths: string[]): Set<string> {
  return new Set(dirtyEditorPaths.map((p) => normalizeWorkspaceRelativePath(p)));
}

export function computeFilteredChangeEntries(
  changeEntries: ReturnType<typeof buildChangeEntries>,
  changesStatusFilter: Set<ChangeFileState>
) {
  if (changesStatusFilter.size === 0 || changesStatusFilter.size === 3) {
    return changeEntries;
  }
  return changeEntries.filter((entry) =>
    entry.states.some((state) => changesStatusFilter.has(state))
  );
}

export function computeHasExpandedDirectories(
  directoryPaths: string[],
  expandedPaths: Record<string, boolean>
): boolean {
  return directoryPaths.some((pathValue) => expandedPaths[pathValue]);
}

export function revealOutlineLine(
  line: number,
  changePreview: WorkspaceChangePreview | undefined,
  previewEnabled: boolean,
  editorRef: { current: DiffEditorRef | EditorRef | null },
  changesPreviewContainerRef: { current: HTMLDivElement | null },
  getModifiedEditor: () => EditorRef | null
): void {
  if (changePreview && categorizeFile(changePreview.path) === 'markdown' && previewEnabled) {
    const container = changesPreviewContainerRef.current;
    if (container) {
      const heading = container.querySelector(`[data-source-line="${line}"]`) as HTMLElement | null;
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }
  const editor = getModifiedEditor();
  if (editor) {
    const view = editor.getView?.() as EditorView | undefined;
    if (view) {
      const collapseFrom = findCollapsedSectionStart(view, line);
      if (collapseFrom !== null) {
        view.dispatch({ effects: uncollapseUnchanged.of(collapseFrom) });
      }
    }
    const diffRef = editorRef.current;
    if (diffRef && 'getOriginalEditor' in diffRef) {
      const originalEditor = (diffRef as DiffEditorRef).getOriginalEditor();
      const originalView = originalEditor?.getView?.() as EditorView | undefined;
      if (originalView) {
        const originalCollapseFrom = findCollapsedSectionStart(originalView, line);
        if (originalCollapseFrom !== null) {
          originalView.dispatch({ effects: uncollapseUnchanged.of(originalCollapseFrom) });
        }
      }
    }
    editor.revealLineInCenter?.(line);
    editor.setPosition?.({ lineNumber: line, column: 1 });
    editor.focus?.();
  }
}

export function selectNavigatorNode(
  workspacePath: string,
  relativePath: string,
  collapsedPatchHunkIds: string[],
  onSelectPatchFile: (path: string, opts: { line?: number; hunkId?: string }) => void,
  activePatchSets: Record<string, PatchSet | undefined>,
  activePatchSet: PatchSet | undefined,
  openChangePreviewForWorkspace: (wsPath: string, relPath: string) => void
): void {
  const patchSet = activePatchSets[workspacePath] ?? activePatchSet;
  const summaries = patchSet ? summarizePatchSet(patchSet, collapsedPatchHunkIds) : [];
  const patchSummary = summaries.find((summary) => summary.relativePath === relativePath);
  if (patchSummary) {
    onSelectPatchFile(relativePath, {
      line: patchSummary.hunks[0]?.targetLine,
      hunkId: patchSummary.hunks[0]?.id,
    });
    return;
  }
  openChangePreviewForWorkspace(workspacePath, relativePath);
}

export function toggleAllDirectories(
  directoryPaths: string[],
  hasExpandedDirectories: boolean,
  collapseAllChangesTreePaths: () => void,
  setChangesTreePathExpanded: (path: string, expanded: boolean) => void
): void {
  if (!directoryPaths.length) {
    return;
  }
  if (hasExpandedDirectories) {
    collapseAllChangesTreePaths();
    return;
  }
  directoryPaths.forEach((pathValue) => setChangesTreePathExpanded(pathValue, true));
}

export function toggleAllOutlineItems(
  hasExpandableOutlineItems: boolean,
  hasExpandedOutlineItems: boolean,
  defaultExpandedOutlineIds: Set<string>,
  setExpandedOutlineIds: (ids: Set<string>) => void
): void {
  if (!hasExpandableOutlineItems) {
    return;
  }
  setExpandedOutlineIds(hasExpandedOutlineItems ? new Set() : new Set(defaultExpandedOutlineIds));
}

export function toggleNavigatorStructure(
  changesNavigatorMode: 'tree' | 'list' | 'outline',
  allChangesExpanded: boolean,
  handleCollapseAll: () => void,
  handleExpandAll: () => void,
  handleToggleAllOutlineItems: () => void
): void {
  if (changesNavigatorMode === 'tree' || changesNavigatorMode === 'list') {
    if (allChangesExpanded) {
      handleCollapseAll();
    } else {
      handleExpandAll();
    }
    return;
  }
  if (changesNavigatorMode === 'outline') {
    handleToggleAllOutlineItems();
  }
}

export function handleStatusFilterClick(
  filter: ChangeFileState,
  setChangesStatusFilter: React.Dispatch<React.SetStateAction<Set<ChangeFileState>>>
): void {
  setChangesStatusFilter((current) => {
    const next = new Set(current);
    if (next.has(filter)) {
      next.delete(filter);
    } else {
      next.add(filter);
    }
    return next;
  });
}

export function toggleWorkspaceExpand(
  workspaceId: string,
  recentWorkspaces: RecentWorkspaceEntry[],
  expandWorkspaceChangesInFileNav: (id: string, path: string) => void
): void {
  const ws = recentWorkspaces.find((w) => w.id === workspaceId);
  if (ws) {
    expandWorkspaceChangesInFileNav(workspaceId, ws.path);
  }
}

export function refreshOneWorkspace(
  workspaceId: string,
  recentWorkspaces: RecentWorkspaceEntry[],
  refreshGitSnapshot: (id: string, path: string) => void
): void {
  const ws = recentWorkspaces.find((w) => w.id === workspaceId);
  if (ws) {
    refreshGitSnapshot(workspaceId, ws.path);
  }
}

export function refreshAllChanges(
  visibleWorkspaces: RecentWorkspaceEntry[],
  refreshGitSnapshot: (id: string, path: string) => void
): void {
  visibleWorkspaces.forEach((ws) => {
    refreshGitSnapshot(ws.id, ws.path);
  });
}

export function handleChangesRenameConfirm(
  changesRenamingPath: string | null,
  setChangesRenamingPath: (v: string | null) => void,
  setChangesRenameDialogOpen: (v: boolean) => void,
  clearMenuHighlight: () => void,
  renameWorkspaceFile: (path: string, newName: string) => Promise<void>,
  newName: string
): Promise<void> {
  if (!changesRenamingPath) {
    return Promise.resolve();
  }
  const path = changesRenamingPath;
  setChangesRenamingPath(null);
  setChangesRenameDialogOpen(false);
  clearMenuHighlight();
  return renameWorkspaceFile(path, newName);
}

export function handleChangesDeleteConfirm(
  changesDeleteConfirmPath: string | null,
  setChangesDeleteConfirmPath: (v: string | null) => void,
  clearMenuHighlight: () => void,
  deleteWorkspaceFile: (path: string) => Promise<void>
): Promise<void> {
  if (!changesDeleteConfirmPath) {
    return Promise.resolve();
  }
  const path = changesDeleteConfirmPath;
  setChangesDeleteConfirmPath(null);
  clearMenuHighlight();
  return deleteWorkspaceFile(path);
}

export function handleChangesCancel(
  setPath: (v: string | null) => void,
  setDialogOpen: (v: boolean) => void,
  clearMenuHighlight: () => void
): void {
  setPath(null);
  setDialogOpen(false);
  clearMenuHighlight();
}
