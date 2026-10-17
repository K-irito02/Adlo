import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
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
  activeWorkspaceId: string | undefined;
  collapseAllChangesTreePaths: (workspaceId: string) => void;
  setChangesTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
  toggleChangesTreePath: (workspaceId: string, path: string) => void;
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
    activeWorkspaceId,
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
      activeWorkspaceId,
      directoryPaths,
      hasExpandedDirectories,
      collapseAllChangesTreePaths,
      setChangesTreePathExpanded,
    );
  }, [
    activeWorkspaceId,
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

  // hover 意图预取（事项4）：悬停 150ms 未移走才预取变更预览进缓存，
  // 点击时命中缓存即同步渲染；只写缓存，不碰选择态/加载态。
  // 说明（P4-R1-F03）：鼠标直接离树不取消已武装的 timer，一次多余预取无害
  //（纯写缓存、重型不入，点击链不受影响），故不另铺 onHoverEnd 通道。
  const hoverPrefetchTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverPrefetchTimer.current), []);
  const onHoverChangePreview = useCallback((workspacePath: string, relativePath: string) => {
    window.clearTimeout(hoverPrefetchTimer.current);
    hoverPrefetchTimer.current = window.setTimeout(() => {
      void useAppStore.getState().prefetchChangePreviewForWorkspace(workspacePath, relativePath);
    }, 150);
  }, []);

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
    (wsId: string, path: string) => {
      toggleChangesTreePath(wsId, path);
    },
    [toggleChangesTreePath],
  );

  const onRefreshAll = useCallback(() => {
    const s = useAppStore.getState();
    void refreshAllChanges(
      visibleWorkspaces,
      new Set(
        Object.keys(s.workspaceChangesExpanded).filter((id) => s.workspaceChangesExpanded[id]),
      ),
      s.setRefreshingAllChanges,
      (id, p, opts) => s.refreshGitSnapshot(id, p, opts),
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
    onHoverChangePreview,
    onToggleExpand,
    onRefreshOne,
    handleToggleFileTreePath,
    onRefreshAll,
  };
}
