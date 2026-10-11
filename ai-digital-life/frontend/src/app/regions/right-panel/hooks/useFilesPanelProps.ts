import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { captureError } from '@stores/cacheHelpers';
import { useAppActions } from '@hooks/useAppActions';
import { findPatchFileByPath } from '@features/patch-review';
import { filterDiagnosticsForPath, detectEditorLanguage } from '@utils/workspacePaths';
import { asWorkspaceID } from '@shared/branded';
import type { FilesPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';
import type { EditorRef } from '@stores/types';

export function useFilesPanelProps(
  panelProps: RightPanelProps,
  diffSideBySide: boolean,
  onSetDiffLayout: (sideBySide: boolean) => void,
): FilesPanelProps {
  const {
    standardEditorRef,
    onOpenFileAtLine,
    onDiffMount,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    onJumpPatchHunk,
  } = panelProps;

  const actions = useAppActions();
  const appInfo = useAppStore(useShallow((s) => s.appInfo));
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileWorkspaceId = useAppStore((s) => s.selectedFileWorkspaceId);
  const fileContent = useAppStore((s) => s.fileContent);
  const fileMedia = useAppStore(useShallow((s) => s.fileMedia));
  const fileMediaLoading = useAppStore((s) => s.fileMediaLoading);
  const fileOpenError = useAppStore(useShallow((s) => s.fileOpenError));
  const positioningPath = useAppStore((s) => s.positioningPath);
  const externalFileChange = useAppStore(useShallow((s) => s.externalFileChange));
  const outline = useAppStore(useShallow((s) => s.outline));
  const workspaceTrees = useAppStore(useShallow((s) => s.workspaceTrees));
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const workspaceTreeExpandedInFileNav = useAppStore(
    useShallow((s) => s.workspaceTreeExpandedInFileNav),
  );
  const workspaceTreeLoading = useAppStore(useShallow((s) => s.workspaceTreeLoading));
  const workspaceTreeErrors = useAppStore(useShallow((s) => s.workspaceTreeErrors));
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchEntries = useAppStore(useShallow((s) => s.searchEntries));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
  const activePatchSet = useAppStore(useShallow((s) => s.activePatchSet));
  const latestPatchApplication = useAppStore(useShallow((s) => s.latestPatchApplication));

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const editorDirtyTimerRef = useRef<number | undefined>(undefined);

  const allExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available);
    return visible.length > 0 && visible.every((w) => workspaceTreeExpandedInFileNav[w.id]);
  }, [recentWorkspaces, workspaceTreeExpandedInFileNav]);

  const filePatch = useMemo(() => {
    if (!activePatchSet) {
      return undefined;
    }
    return findPatchFileByPath(activePatchSet, selectedPatchFilePath ?? selectedFilePath);
  }, [activePatchSet, selectedFilePath, selectedPatchFilePath]);

  const selectedDiagnostics = useMemo(
    () =>
      filterDiagnosticsForPath(
        latestPatchApplication?.validation?.diagnostics ?? [],
        selectedFilePath,
      ),
    [selectedFilePath, latestPatchApplication?.validation?.diagnostics],
  );

  const editorLanguage = useMemo(
    () => detectEditorLanguage(selectedFilePath, filePatch?.language),
    [filePatch?.language, selectedFilePath],
  );

  const editorHint = undefined;

  const handleEditorMount = useCallback(
    (editor: EditorRef) => {
      standardEditorRef.current = editor;
    },
    [standardEditorRef],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const pathAtEdit = selectedFilePath;
      if (!pathAtEdit) {
        return;
      }
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) {
          return;
        }
        const baseline = useAppStore.getState().fileContent ?? '';
        const dirty = (value ?? '') !== baseline;
        actions.notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [actions, selectedFilePath],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      void actions.openFile(path);
    },
    [actions],
  );

  const handleOpenFileForWorkspace = useCallback(
    (workspaceId: string, workspacePath: string, path: string) => {
      void actions.openFileForWorkspace(workspaceId, workspacePath, path);
    },
    [actions],
  );

  const handleSearch = useCallback(
    (query: string) => {
      void actions.searchFiles(query);
    },
    [actions],
  );

  const handleRefreshWorkspaceTree = useCallback(() => {
    void actions.refreshWorkspaceTree();
  }, [actions]);

  const handleExpandAll = useCallback(() => {
    void actions.expandAllWorkspaceTreesInFileNav();
  }, [actions]);

  const handleCollapseAll = useCallback(() => {
    void actions.collapseAllWorkspaceTreesInFileNav();
  }, [actions]);

  const handleRefreshAll = useCallback(() => {
    void (async () => {
      try {
        await actions.refreshAllWorkspaceTrees();
        // 检索文件模式：树刷新后原位重跑当前检索（文件增删/改名/内容变更后手动更新结果，
        // 悬浮加载覆盖在原位不动的已显示内容上）；退出检索模式后文件树显示的即刚刷新的树。
        if (useAppStore.getState().filesNavigatorMode === 'search') {
          await actions.refreshSearchResults();
        }
      } catch (error) {
        // 双 await 结构上不抛（allSettled＋runContentSearch 内建 catch），此处仅满足
        // error-handling.md“Promise 链必须有 .catch()”的硬性规则。
        captureError(useAppStore.getState, error, 'files-panel');
      }
    })();
  }, [actions]);

  const handleRefreshOneWorkspace = useCallback(
    (workspaceId: string) => {
      const ws = recentWorkspaces.find((r) => r.id === workspaceId);
      if (ws) {
        void actions.refreshOneWorkspaceTree(asWorkspaceID(workspaceId), ws.path);
      }
    },
    [recentWorkspaces, actions],
  );

  const handleToggleExpandInFileNav = useCallback(
    (workspaceId: string) => {
      const ws = recentWorkspaces.find((r) => r.id === workspaceId);
      if (ws) {
        void actions.expandWorkspaceTreeInFileNav(asWorkspaceID(workspaceId), ws.path);
      }
    },
    [recentWorkspaces, actions],
  );

  const handleHideFromRightPanels = useCallback(
    (workspaceId: string) => {
      void actions.removeWorkspaceFromSidebar(asWorkspaceID(workspaceId));
    },
    [actions],
  );

  const handleCreateWorkspaceFile = useCallback(
    (
      relativePath: string,
      content?: string,
      workspacePath?: string,
    ): Promise<string | undefined> => {
      return actions.createWorkspaceFile(relativePath, content, workspacePath);
    },
    [actions],
  );

  const handleCreateWorkspaceFolder = useCallback(
    (relativePath: string, workspacePath?: string): Promise<string | undefined> => {
      return actions.createWorkspaceFolder(relativePath, workspacePath);
    },
    [actions],
  );

  useEffect(() => () => window.clearTimeout(editorDirtyTimerRef.current), [selectedFilePath]);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  const baseProps = useMemo(
    () => ({
      appInfo,
      selectedFilePath,
      selectedFileWorkspaceId,
      fileContent,
      fileMedia,
      fileMediaLoading,
      fileOpenError,
      positioningPath,
      filePatch,
      editorLanguage,
      diffSideBySide,
      diagnostics: selectedDiagnostics,
      editorHint,
      outline,
      workspaceTrees,
      recentWorkspaces,
      allExpanded,
      workspaceTreeExpandedInFileNav,
      workspaceTreeLoading,
      workspaceTreeErrors,
      searchQuery: localSearchQuery,
      searchEntries,
      dirtyEditorPaths,
      externalChangePath: externalFileChange?.path,
      onOpenFile: handleOpenFile,
      onOpenFileForWorkspace: handleOpenFileForWorkspace,
      onOpenFileAtLine,
      onDiffMount,
      onSearch: handleSearch,
      onSearchChange: setLocalSearchQuery,
      onRefreshWorkspaceTree: handleRefreshWorkspaceTree,
      onExpandAll: handleExpandAll,
      onCollapseAll: handleCollapseAll,
      onRefreshAll: handleRefreshAll,
      onRefreshOneWorkspace: handleRefreshOneWorkspace,
      onToggleExpandInFileNav: handleToggleExpandInFileNav,
      onHideFromRightPanels: handleHideFromRightPanels,
      onCreateWorkspaceFile: handleCreateWorkspaceFile,
      onCreateWorkspaceFolder: handleCreateWorkspaceFolder,
      onSetDiffLayout,
      onJumpPatchHunk,
      onSelectPatchHunk,
      onTogglePatchHunkCollapse,
      onSetAllPatchHunksCollapsed,
      activePatchSet,
      selectedPatchFilePath,
      selectedPatchHunkId,
      collapsedPatchHunkIds,
    }),
    [
      appInfo,
      editorHint,
      selectedFilePath,
      selectedFileWorkspaceId,
      fileContent,
      fileMedia,
      fileMediaLoading,
      fileOpenError,
      positioningPath,
      filePatch,
      editorLanguage,
      diffSideBySide,
      selectedDiagnostics,
      outline,
      workspaceTrees,
      recentWorkspaces,
      allExpanded,
      workspaceTreeExpandedInFileNav,
      workspaceTreeLoading,
      workspaceTreeErrors,
      localSearchQuery,
      searchEntries,
      dirtyEditorPaths,
      externalFileChange?.path,
      handleOpenFile,
      handleOpenFileForWorkspace,
      onOpenFileAtLine,
      onDiffMount,
      handleSearch,
      setLocalSearchQuery,
      handleRefreshWorkspaceTree,
      handleExpandAll,
      handleCollapseAll,
      handleRefreshAll,
      handleRefreshOneWorkspace,
      handleToggleExpandInFileNav,
      handleHideFromRightPanels,
      handleCreateWorkspaceFile,
      handleCreateWorkspaceFolder,
      onSetDiffLayout,
      onJumpPatchHunk,
      onSelectPatchHunk,
      onTogglePatchHunkCollapse,
      onSetAllPatchHunksCollapsed,
      activePatchSet,
      selectedPatchFilePath,
      selectedPatchHunkId,
      collapsedPatchHunkIds,
    ],
  );

  return {
    ...baseProps,
    standardEditorRef,
    onEditorChange: handleEditorChange,
    onEditorMount: handleEditorMount,
  };
}
