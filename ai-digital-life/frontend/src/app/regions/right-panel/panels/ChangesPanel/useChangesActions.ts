import { useCallback, type MutableRefObject } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { RecentWorkspaceEntry, WorkspaceChangePreview } from '@ai-digital-life/kernel';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import {
  revealOutlineLine,
  selectNavigatorNode,
  toggleAllDirectories,
  toggleAllOutlineItems,
  toggleWorkspaceExpand,
  refreshOneWorkspace,
  refreshAllChanges,
} from './useChangesPanelStateUtils';

export interface UseChangesActionsParams {
  editorRef: MutableRefObject<DiffEditorRef | EditorRef | null>;
  changesPreviewContainerRef: MutableRefObject<HTMLDivElement | null>;
  changePreview: WorkspaceChangePreview | undefined;
  previewEnabled: boolean;
  directoryPaths: string[];
  hasExpandedDirectories: boolean;
  hasExpandableOutlineItems: boolean;
  hasExpandedOutlineItems: boolean;
  defaultExpandedOutlineIds: Set<string>;
  setExpandedOutlineIds: (ids: Set<string>) => void;
  collapsedPatchHunkIds: string[];
  onSelectPatchFile: (
    relativePath: string,
    options?: { activateTool?: boolean; line?: number; hunkId?: string },
  ) => void;
  recentWorkspaces: RecentWorkspaceEntry[];
  visibleWorkspaces: RecentWorkspaceEntry[];
  collapseAllChangesTreePaths: () => void;
  setChangesTreePathExpanded: (path: string, expanded: boolean) => void;
  toggleChangesTreePath: (path: string) => void;
}

export function useChangesActions(params: UseChangesActionsParams) {
  const {
    editorRef,
    changesPreviewContainerRef,
    changePreview,
    previewEnabled,
    directoryPaths,
    hasExpandedDirectories,
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    defaultExpandedOutlineIds,
    setExpandedOutlineIds,
    collapsedPatchHunkIds,
    onSelectPatchFile,
    recentWorkspaces,
    visibleWorkspaces,
    collapseAllChangesTreePaths,
    setChangesTreePathExpanded,
    toggleChangesTreePath,
  } = params;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Failed to copy to clipboard');
    }
  }, []);

  const handleDiffMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      editorRef.current = editor;
    },
    [editorRef],
  );

  const getModifiedEditor = useCallback((): EditorRef | null => {
    const ref = editorRef.current;
    if (!ref) {
      return null;
    }
    if ('getModifiedEditor' in ref) {
      return (ref as DiffEditorRef).getModifiedEditor();
    }
    return ref as EditorRef;
  }, [editorRef]);

  const handleRevealOutlineLine = useCallback(
    (line: number) => {
      revealOutlineLine(
        line,
        changePreview,
        previewEnabled,
        editorRef,
        changesPreviewContainerRef,
        getModifiedEditor,
      );
    },
    [getModifiedEditor, changePreview, previewEnabled, editorRef, changesPreviewContainerRef],
  );

  const handleToggleAllDirectories = useCallback(() => {
    toggleAllDirectories(
      directoryPaths,
      hasExpandedDirectories,
      collapseAllChangesTreePaths,
      setChangesTreePathExpanded,
    );
  }, [
    directoryPaths,
    hasExpandedDirectories,
    collapseAllChangesTreePaths,
    setChangesTreePathExpanded,
  ]);

  const handleToggleAllOutlineItems = useCallback(() => {
    toggleAllOutlineItems(
      hasExpandableOutlineItems,
      hasExpandedOutlineItems,
      defaultExpandedOutlineIds,
      setExpandedOutlineIds,
    );
  }, [
    hasExpandableOutlineItems,
    hasExpandedOutlineItems,
    defaultExpandedOutlineIds,
    setExpandedOutlineIds,
  ]);

  const onSelectNavigatorNode = useCallback(
    (workspacePath: string, relativePath: string) => {
      const s = useAppStore.getState();
      selectNavigatorNode(
        workspacePath,
        relativePath,
        collapsedPatchHunkIds,
        onSelectPatchFile,
        s.activePatchSets,
        s.activePatchSet,
        s.openChangePreviewForWorkspace,
      );
    },
    [collapsedPatchHunkIds, onSelectPatchFile],
  );

  const onToggleExpand = useCallback(
    (workspaceId: string) => {
      toggleWorkspaceExpand(workspaceId, recentWorkspaces, (id, p) =>
        useAppStore.getState().expandWorkspaceChangesInFileNav(id, p),
      );
    },
    [recentWorkspaces],
  );

  const onRefreshOne = useCallback(
    (workspaceId: string) => {
      refreshOneWorkspace(workspaceId, recentWorkspaces, (id, p) =>
        useAppStore.getState().refreshGitSnapshot(id, p),
      );
    },
    [recentWorkspaces],
  );

  const handleToggleFileTreePath = useCallback(
    (_wsId: string, path: string) => {
      toggleChangesTreePath(path);
    },
    [toggleChangesTreePath],
  );

  const onRefreshAll = useCallback(() => {
    refreshAllChanges(visibleWorkspaces, (id, p) =>
      useAppStore.getState().refreshGitSnapshot(id, p),
    );
  }, [visibleWorkspaces]);

  return {
    copyToClipboard,
    handleDiffMount,
    getModifiedEditor,
    handleRevealOutlineLine,
    handleToggleAllDirectories,
    handleToggleAllOutlineItems,
    onSelectNavigatorNode,
    onToggleExpand,
    onRefreshOne,
    handleToggleFileTreePath,
    onRefreshAll,
  };
}
