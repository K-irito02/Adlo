import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { captureError } from '@stores/cacheHelpers';
import { peekPendingEditorText } from '@stores/actions/editorActions';
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
  const fileMedia = useAppStore((s) => s.fileMedia);
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
  const editorAutosaveTimerRef = useRef<number | undefined>(undefined);

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
      // 存盘链内容来源：typing 文本同步暂存（Ctrl+S / 自动保存消费）。
      actions.noteEditorText(pathAtEdit, value ?? '');
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        const state = useAppStore.getState();
        if (state.selectedFilePath !== pathAtEdit) {
          return;
        }
        // 脏比较读现值（事项 13 收敛）：闭包旧值在保存移动基线后会误判，
        // 以暂存缓冲里的最新击键文本为准。
        const current =
          peekPendingEditorText(pathAtEdit, state.appInfo?.currentWorkspace?.id) ?? value ?? '';
        const baseline = state.fileContent ?? '';
        actions.notifyEditorBufferDirty(pathAtEdit, current !== baseline);
      }, 300);
      // 空闲自动保存（默认开启）：停顿 1s 落盘，蓝点即清。
      window.clearTimeout(editorAutosaveTimerRef.current);
      editorAutosaveTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) {
          return;
        }
        void actions.saveFile(pathAtEdit);
      }, 1000);
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

  // 输入框被清空即提交清空（事项 6）：否则草稿空而提交词仍是旧非空值，
  // 设置保存会按旧提交词重跑，空输入下冒出"检索中..."。仅在"变为空"且提交词
  // 仍非空时触发一次（输入 onChange 只在值变化时 firing，不会重复提交）。
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearchQuery(value);
      if (!value.trim() && useAppStore.getState().searchQuery.trim()) {
        void actions.searchFiles('');
      }
    },
    [actions],
  );

  const handleRefreshWorkspaceTree = useCallback(() => {
    void (async () => {
      await actions.refreshWorkspaceTree();
      await actions.reconcileSelectedFile();
    })();
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
        await actions.reconcileSelectedFile();
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
        void (async () => {
          await actions.refreshOneWorkspaceTree(asWorkspaceID(workspaceId), ws.path);
          await actions.reconcileSelectedFile();
        })();
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

  // 关闭前 best-effort 落盘：异步桥接未必写完才退出，日常由空闲自动保存兜底。
  useEffect(() => {
    const onBeforeUnload = () => {
      window.clearTimeout(editorDirtyTimerRef.current);
      window.clearTimeout(editorAutosaveTimerRef.current);
      void useAppStore.getState().saveDirtyEditors();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(editorAutosaveTimerRef.current);
    };
  }, []);

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
      onSearchChange: handleSearchChange,
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
      handleSearchChange,
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
