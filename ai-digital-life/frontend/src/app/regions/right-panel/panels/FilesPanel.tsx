import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { categorizeFile } from '../fileTypeRouter';
import { IconEye, IconPanelLeft, IconPanelLeftClose, IconReturn, IconSearch } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useEditorOptions, useFileHistory } from '../hooks';
import { FileNavigatorShell } from '../FileNavigatorShell';
import { LazyEditorSurface, SuspenseWrapper } from '@components/LazyComponents';
import { warmRightPanelEditors } from '@components/warmRightPanelEditors';
import { FileContextMenu, type FileMenuItem, type FileMenuDivider } from '../FileContextMenu';
import { FileHistoryNav } from '../FileHistoryNav';
import type { FilesPanelProps } from '../types';
import { useTCopy } from '@i18n/useTCopy';
import { resolveAppLanguage } from '@i18n/resolveLanguage';
import { joinPathSegments } from '@utils/workspacePaths';
import {
  findLineForQuery,
  revealEditorLineSafely,
  revealSourceLine,
  scrollAndFlash,
} from '@features/preview/revealSourceLine';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import { EMPTY_KEYBINDS } from '@shared/keybinds';
import { displayShortcut } from '../../../commands/defaultCommands';
import { useFilesPanelShortcuts } from './useFilesPanelShortcuts';

const FilesPanel = React.memo(function FilesPanel(props: FilesPanelProps) {
  const { t } = useTCopy();
  const {
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
    diagnostics,
    editorHint,
    outline,
    workspaceTrees,
    recentWorkspaces,
    allExpanded,
    workspaceTreeExpandedInFileNav,
    workspaceTreeLoading,
    workspaceTreeErrors,
    searchQuery,
    searchEntries,
    dirtyEditorPaths,
    externalChangePath,
    onOpenFile,
    onOpenFileForWorkspace,
    onOpenFileAtLine,
    onEditorChange,
    onEditorMount,
    onDiffMount,
    onSearch,
    onSearchChange,
    onExpandAll,
    onCollapseAll,
    onRefreshAll,
    onRefreshOneWorkspace,
    onToggleExpandInFileNav,
    onHideFromRightPanels,
    onCreateWorkspaceFile,
    onCreateWorkspaceFolder,
    onSetDiffLayout,
    onJumpPatchHunk,
    onSelectPatchHunk,
    onTogglePatchHunkCollapse,
    onSetAllPatchHunksCollapsed,
    activePatchSet,
    selectedPatchFilePath,
    selectedPatchHunkId,
    collapsedPatchHunkIds,
  } = props;

  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);

  const localDiffEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);

  const {
    setFilePreviewModeForPath,
    navigatorCollapsed,
    toggleNavigator,
    navigatorMode,
    setNavigatorMode,
    filesNavigatorWidth,
  } = useAppStore(
    useShallow((s) => ({
      setFilePreviewModeForPath: s.setFilePreviewModeForPath,
      navigatorCollapsed: s.navigatorCollapsedByTool.files,
      toggleNavigator: s.toggleNavigator,
      navigatorMode: s.filesNavigatorMode,
      setNavigatorMode: s.setFilesNavigatorMode,
      filesNavigatorWidth: s.filesNavigatorWidth,
    })),
  );

  const editorOptions = useEditorOptions();
  const fileHistory = useFileHistory(selectedFilePath, onOpenFile);

  // 编辑器 chunk 空闲预热（事项4）：挂载后即预取，首切不再付懒加载代价。
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => warmRightPanelEditors());
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => warmRightPanelEditors(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const hasActivePatch = !!(filePatch && filePatch.relativePath === selectedFilePath);

  const getStickySourceEditor = useCallback((): EditorRef | null => {
    if (hasActivePatch) {
      const diffRef = localDiffEditorRef.current;
      if (diffRef && 'getModifiedEditor' in diffRef) {
        return (diffRef as DiffEditorRef).getModifiedEditor();
      }
      if (diffRef && 'getVisibleRanges' in diffRef) {
        return diffRef as EditorRef;
      }
      return null;
    }
    return props.standardEditorRef.current;
  }, [hasActivePatch, props.standardEditorRef]);

  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);
  const previewEnabled = useAppStore(
    useCallback(
      (s) =>
        selectedFilePath
          ? (s.filePreviewModeByPath[selectedFileWorkspaceId ?? '']?.[selectedFilePath] ??
            fileCategory === 'markdown')
          : false,
      [selectedFilePath, selectedFileWorkspaceId, fileCategory],
    ),
  );

  const setPreviewEnabled = useCallback(
    (enabled: boolean) => {
      if (!selectedFilePath || !selectedFileWorkspaceId) {
        return;
      }
      setFilePreviewModeForPath(selectedFileWorkspaceId, selectedFilePath, enabled);
    },
    [selectedFilePath, selectedFileWorkspaceId, setFilePreviewModeForPath],
  );

  const selectedAbsolutePath = useMemo(() => {
    const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
    if (!rootPath || !selectedFilePath) {
      return undefined;
    }
    return joinPathSegments(rootPath, selectedFilePath);
  }, [appInfo?.currentWorkspace?.path, appInfo?.currentWorkspace?.rootPath, selectedFilePath]);

  const handleCopyPath = useCallback(async (value?: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      console.warn('[FilesPanel] clipboard write failed');
    }
  }, []);

  const handleSaveFile = useCallback(() => {
    void useAppStore.getState().saveFile();
  }, []);

  const handleNavigateLine = useCallback(
    (line: number, options?: { flash?: boolean }) => {
      // For markdown preview mode, use DOM-based scrolling directly
      // (stale editor ref may exist from edit mode, but no CodeMirror is visible)
      if (fileCategory === 'markdown' && previewEnabled) {
        const surface = editorSurfaceRef.current;
        if (!surface) {
          return;
        }
        // 块级源行映射与最近前置块回退复用 helper（与检索跳转同语义，防分叉）；
        // 全无锚点的极端情况按行占比估算（分母用内容行数，不用块数）。
        // 落点高亮只由检索文件模式显式开启（大纲/诊断导航只需定位，不需要闪烁）。
        if (!revealSourceLine(surface, line, { flash: options?.flash })) {
          const lineCount = fileContent?.split('\n').length ?? 0;
          const ratio = lineCount > 0 ? Math.min(line / lineCount, 1) : 0;
          surface.scrollTop = Math.max(0, ratio * (surface.scrollHeight - surface.clientHeight));
        }
        return;
      }
      const editor = getStickySourceEditor();
      if (editor) {
        // 越界钳制复用共享 helper（与 ChangesPanel 同语义，事项 45 Phase 4 C6）。
        revealEditorLineSafely(editor, line, { scope: 'navigate', path: selectedFilePath });
        return;
      }
    },
    [
      getStickySourceEditor,
      fileCategory,
      previewEnabled,
      editorSurfaceRef,
      selectedFilePath,
      fileContent,
    ],
  );

  // 检索结果行跳转：预览模式（markdown 且该路径预览开启）下编辑器不可见，
  // 原 onOpenFileAtLine 的 editor reveal 不生效，改走预览 DOM 跳转
  const pendingPreviewRevealRef = useRef<{
    path: string;
    line: number;
    from: string | undefined;
    baseline: string | undefined;
    nonce: number;
    /** 点击时刻的检索词快照：内容到达后补校验（未打开文件的 stale 标记，事项 45 Phase 4 1.4） */
    query: { text: string; matchCase: boolean; wholeWord: boolean; useRegex: boolean };
    /** 点击时刻的检索工作区：内容到达后判定预览/编辑器分支用（P4-R1-F6）。 */
    workspaceId: string | undefined;
  } | null>(null);
  /** 编辑器链路的事后校验：文件打开后内容到达时验证命中是否仍在（已揭示无法撤回，只标 stale/纠正落点）。 */
  const pendingSearchValidateRef = useRef<{
    path: string;
    line: number;
    query: { text: string; matchCase: boolean; wholeWord: boolean; useRegex: boolean };
    /** 显式工作区打开后内容到达即揭示（不限于行号纠正时，事项 9 后续）。 */
    forceNavigate?: boolean;
    /** 点击时刻的检索工作区：同上（P4-R1-F6）。 */
    workspaceId: string | undefined;
  } | null>(null);
  // 预览块级锚点由懒加载预览渲染后出现，故按"重试直到锚点就绪"处理（上限 2.5s）
  const previewRevealTimerRef = useRef<number | undefined>(undefined);
  // （P4-R1-F10：searchValidate 侧 nonce 只写不读，单槽 ref + 路径门已足够，删除以免
  // 误导为竞态保护；preview 侧 nonce 仍在消费处比对，保留。）
  // pending 辨识 nonce 用单调计数器（Date.now 同毫秒连点可碰撞，事项 45 Phase 4 2.5）。
  const previewRevealNonceRef = useRef(0);

  const isPreviewModeForPath = useCallback(
    (relativePath: string, workspaceId?: string): boolean => {
      if (categorizeFile(relativePath) !== 'markdown') {
        return false;
      }
      const state = useAppStore.getState();
      const wsId = workspaceId ?? state.selectedFileWorkspaceId ?? '';
      return state.filePreviewModeByPath[wsId]?.[relativePath] ?? true;
    },
    [],
  );

  /** 终结预览揭示轮询（成功/兜底/放弃共用，事项 45 Phase 4 C6）。 */
  const finishPreviewRevealTimer = useCallback(() => {
    if (previewRevealTimerRef.current !== undefined) {
      window.clearInterval(previewRevealTimerRef.current);
      previewRevealTimerRef.current = undefined;
    }
  }, []);

  const revealInPreview = useCallback(
    (line: number) => {
      finishPreviewRevealTimer();
      const startedAt = Date.now();
      // 返回是否已终结（成功/兜底/放弃）：首轮同步成功即不再建 interval，
      // 否则每次成功揭示执行两次（滚动＋闪烁重放，事项 45 Phase 4 1.1）。
      const attempt = (): boolean => {
        const surface = editorSurfaceRef.current;
        if (surface && revealSourceLine(surface, line, { flash: true })) {
          finishPreviewRevealTimer();
          return true;
        }
        // 锚点已挂载但 helper 未命中（行在首块之前）：兜底首块并闪烁
        const firstAnchor = surface?.querySelector<HTMLElement>('[data-source-line-start]');
        if (firstAnchor && surface) {
          scrollAndFlash(surface, firstAnchor, { flash: true });
          finishPreviewRevealTimer();
          return true;
        }
        // 未挂载（懒加载）→ 保持 60ms 重试，上限 2.5s 后放弃
        if (Date.now() - startedAt > 2500) {
          finishPreviewRevealTimer();
          return true;
        }
        return false;
      };
      if (!attempt() && previewRevealTimerRef.current === undefined) {
        const id = window.setInterval(() => {
          if (attempt() && previewRevealTimerRef.current === id) {
            window.clearInterval(id);
            previewRevealTimerRef.current = undefined;
          }
        }, 60);
        previewRevealTimerRef.current = id;
      }
    },
    [editorSurfaceRef, finishPreviewRevealTimer],
  );

  useEffect(() => () => finishPreviewRevealTimer(), [finishPreviewRevealTimer]);

  const handleOpenSearchResultAtLine = useCallback(
    (relativePath: string, line: number) => {
      const state = useAppStore.getState();
      const querySnap = {
        text: state.searchQuery,
        matchCase: state.searchFlags.matchCase,
        wholeWord: state.searchFlags.matchWholeWord,
        useRegex: state.searchFlags.useRegex,
      };
      // 检索命中归属检索工作区；当它与后端当前工作区不一致（id 或 path 任一不同）
      // 时，必须用显式工作区打开，否则会解析到错误的根（事项 9 后续：搜到但打不开，
      // "failed to resolve workspace root"）。一致时走原后端当前链路（零改动）。
      const searchWs = state.searchWorkspaceId
        ? state.recentWorkspaces.find(
            (w) => w.id === state.searchWorkspaceId && !w.removedFromSidebar && w.available,
          )
        : undefined;
      const backendWs = state.appInfo?.currentWorkspace;
      if (
        searchWs !== undefined &&
        (searchWs.id !== backendWs?.id || searchWs.path !== backendWs?.path)
      ) {
        const searchWsId = searchWs.id;
        const searchWsPath = searchWs.path;
        const explicitLive =
          state.selectedFilePath === relativePath &&
          state.selectedFileWorkspaceId === searchWsId &&
          state.fileContent !== undefined
            ? state.fileContent
            : undefined;
        let explicitLine = line;
        if (explicitLive !== undefined) {
          const relocated = findLineForQuery(explicitLive, querySnap.text, querySnap, line);
          if (relocated === null) {
            state.markSearchHitStale(relativePath, line, state.searchWorkspaceId);
            return;
          }
          explicitLine = relocated;
        }
        if (isPreviewModeForPath(relativePath, state.searchWorkspaceId)) {
          if (explicitLive !== undefined) {
            revealInPreview(explicitLine);
            return;
          }
          pendingPreviewRevealRef.current = {
            path: relativePath,
            line: explicitLine,
            from: state.selectedFilePath,
            baseline: state.fileContent,
            nonce: (previewRevealNonceRef.current += 1),
            query: querySnap,
            workspaceId: state.searchWorkspaceId,
          };
          // 预览模式只打开文件，行定位由内容到达后的 pendingPreview effect 接管。
          void useAppStore
            .getState()
            .openFileForWorkspace(searchWsId, searchWsPath, relativePath)
            .catch(() => {
              // 打开失败已由 store 置 fileOpenError + 错误卡。
            });
          return;
        }
        if (explicitLive !== undefined) {
          // 已打开：直接揭示（事项 10；重开只会拿到相同内容，不触发变更，
          // 等内容到达的 pending 永不触发）。点击处理是同步的，闭包内容即最新。
          handleNavigateLine(explicitLine);
          return;
        }
        // 未打开：显式打开后，由内容到达的 pendingSearchValidate effect 揭示
        //（forceNavigate）。
        pendingSearchValidateRef.current = {
          path: relativePath,
          line: explicitLine,
          query: querySnap,
          forceNavigate: true,
          workspaceId: state.searchWorkspaceId,
        };
        void useAppStore
          .getState()
          .openFileForWorkspace(searchWsId, searchWsPath, relativePath)
          .catch(() => {});
        return;
      }
      // 点击校验/重定位（事项 45）：live 内容可用时先校验，命中消失则标失效并停止，
      // 重定位成功则后续流程使用重定位后的行号。
      const liveContent =
        state.selectedFilePath === relativePath && state.fileContent !== undefined
          ? state.fileContent
          : undefined;
      let targetLine = line;
      if (liveContent !== undefined) {
        const relocated = findLineForQuery(liveContent, querySnap.text, querySnap, line);
        if (relocated === null) {
          state.markSearchHitStale(relativePath, line, state.searchWorkspaceId);
          return;
        }
        targetLine = relocated;
      }
      if (isPreviewModeForPath(relativePath, state.searchWorkspaceId)) {
        if (state.selectedFilePath === relativePath && state.fileContent !== undefined) {
          // 文件已打开：预览挂载即定位（含懒加载等待）
          revealInPreview(targetLine);
          return;
        }
        pendingPreviewRevealRef.current = {
          path: relativePath,
          line: targetLine,
          from: state.selectedFilePath,
          baseline: state.fileContent,
          nonce: (previewRevealNonceRef.current += 1),
          query: querySnap,
          workspaceId: state.searchWorkspaceId,
        };
        // 预览模式不挂编辑器：只打开文件，行定位交给 revealInPreview
        // （若走 onOpenFileAtLine，会在隐藏/陈旧的编辑器上做一次无意义的揭示）
        onOpenFile(relativePath);
        return;
      }
      if (liveContent === undefined) {
        // 未打开文件：内容到达后补一次校验（消失则标 stale，移位则纠正落点）。
        pendingSearchValidateRef.current = {
          path: relativePath,
          line: targetLine,
          query: querySnap,
          workspaceId: state.searchWorkspaceId,
        };
        onOpenFileAtLine(relativePath, targetLine);
      } else {
        // 已打开：直接揭示，不走 open 链（open 对已打开文件无内容变更，
        // pending 揭示永不触发；事项 10，大文件门确认后点片段即此情形）。
        handleNavigateLine(targetLine);
      }
    },
    [isPreviewModeForPath, onOpenFile, onOpenFileAtLine, revealInPreview, handleNavigateLine],
  );

  useEffect(() => {
    const pending = pendingPreviewRevealRef.current;
    if (!pending) {
      return;
    }
    // 切到了别的路径：放弃本次待跳转，避免误跳
    if (selectedFilePath !== pending.path && selectedFilePath !== pending.from) {
      pendingPreviewRevealRef.current = null;
      return;
    }
    // 新文件尚未打开：继续等待
    if (selectedFilePath !== pending.path) {
      return;
    }
    if (fileContent === undefined) {
      return;
    }
    if (!isPreviewModeForPath(pending.path, pending.workspaceId)) {
      pendingPreviewRevealRef.current = null;
      return;
    }
    // 内容到达后补校验（未打开文件的 stale 标记）：消失则标失效并停止，
    // 移位则用重定位行号继续（事项 45 Phase 4 1.4）。
    const validatePending = (content: string): number | null =>
      findLineForQuery(content, pending.query.text, pending.query, pending.line);
    const settleStale = () => {
      const state = useAppStore.getState();
      // P4-R1-R1：用点击时刻的工作区（pending 捕获），而非到达时刻的会话 id；
      // 重绑定+重搜发生在点击与到达之间时，避免误标新会话的同路径命中。
      state.markSearchHitStale(
        pending.path,
        pending.line,
        pending.workspaceId ?? state.searchWorkspaceId,
      );
      pendingPreviewRevealRef.current = null;
    };
    if (fileContent === pending.baseline) {
      // 仍是旧内容（新内容加载中）：给加载留 800ms，超时按到达的内容校验后揭示
      const timer = window.setTimeout(() => {
        const current = pendingPreviewRevealRef.current;
        if (current && current.nonce === pending.nonce) {
          pendingPreviewRevealRef.current = null;
          const live = useAppStore.getState().fileContent;
          if (live !== undefined && live !== current.baseline) {
            const relocated = findLineForQuery(
              live,
              current.query.text,
              current.query,
              current.line,
            );
            if (relocated === null) {
              const state = useAppStore.getState();
              state.markSearchHitStale(
                current.path,
                current.line,
                current.workspaceId ?? state.searchWorkspaceId,
              );
              return;
            }
            current.line = relocated;
          }
          revealInPreview(current.line);
        }
      }, 800);
      return () => window.clearTimeout(timer);
    }
    const relocated = validatePending(fileContent);
    if (relocated === null) {
      settleStale();
      return;
    }
    pending.line = relocated;
    pendingPreviewRevealRef.current = null;
    revealInPreview(pending.line);
  }, [selectedFilePath, fileContent, isPreviewModeForPath, revealInPreview]);

  // 编辑器链路的事后校验：未打开文件的点击走 onOpenFileAtLine 后，
  // 内容到达时验证一次（揭示已发生无法撤回：消失标 stale，移位纠正落点）。
  useEffect(() => {
    const validating = pendingSearchValidateRef.current;
    if (!validating || selectedFilePath !== validating.path || fileContent === undefined) {
      return;
    }
    if (isPreviewModeForPath(validating.path, validating.workspaceId)) {
      pendingSearchValidateRef.current = null;
      return;
    }
    pendingSearchValidateRef.current = null;
    const relocated = findLineForQuery(
      fileContent,
      validating.query.text,
      validating.query,
      validating.line,
    );
    const state = useAppStore.getState();
    if (relocated === null) {
      // 同上：用点击时刻工作区，避免误标重绑定后新会话的同路径命中。
      state.markSearchHitStale(
        validating.path,
        validating.line,
        validating.workspaceId ?? state.searchWorkspaceId,
      );
      return;
    }
    // 显式工作区打开（事项 9 后续）内容到达即揭示；原有链路仅在行号纠正时揭示。
    if (validating.forceNavigate || relocated !== validating.line) {
      handleNavigateLine(relocated);
    }
  }, [selectedFilePath, fileContent, isPreviewModeForPath, handleNavigateLine]);

  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds) ?? EMPTY_KEYBINDS;

  const fileMenuItems: (FileMenuItem | FileMenuDivider)[] = useMemo(
    () => [
      {
        id: 'copy-relative',
        label: t.fileCopyRelativePath as string,
        shortcut: displayShortcut(keybinds, 'file.copy-relative'),
        disabled: !selectedFilePath,
        action: () => void handleCopyPath(selectedFilePath),
      },
      {
        id: 'copy-full',
        label: t.fileCopyFullPath as string,
        shortcut: displayShortcut(keybinds, 'file.copy-full'),
        disabled: !selectedAbsolutePath,
        action: () => void handleCopyPath(selectedAbsolutePath),
      },
      { id: 'sep-2', separator: true },
      {
        id: 'line-numbers',
        label: t.fileLineNumbers as string,
        shortcut: displayShortcut(keybinds, 'file.toggle-line-numbers'),
        checked: editorOptions.lineNumbersEnabled,
        action: () => editorOptions.setLineNumbersEnabled((v) => !v),
      },
      {
        id: 'word-wrap',
        label: t.fileWordWrap as string,
        shortcut: displayShortcut(keybinds, 'file.toggle-word-wrap'),
        checked: editorOptions.wordWrapEnabled,
        action: () => editorOptions.setWordWrapEnabled((v) => !v),
      },
    ],
    [t, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath, keybinds],
  );

  useFilesPanelShortcuts({
    panelRef,
    selectedFilePath,
    selectedAbsolutePath,
    editorOptions,
    handleCopyPath,
    handleSaveFile,
    keybinds,
  });

  const resolvedTheme = useResolvedTheme();
  const resolvedLocale = resolveAppLanguage(appInfo?.config?.language);

  return (
    <div className="adl-tool-panel adl-tool-panel--files" ref={panelRef}>
      <div
        className="adl-tool-context adl-tool-context--files"
        aria-label={t.fileExplorerContext as string}
      >
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <TooltipSimple content={t.panelNavigatorToggle} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
              onClick={() => toggleNavigator('files')}
              aria-label={t.panelNavigatorToggle as string}
            >
              {navigatorCollapsed ? (
                <IconPanelLeftClose size={14} decorative />
              ) : (
                <IconPanelLeft size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-tool-context__separator" aria-hidden="true" />

          <TooltipSimple
            content={navigatorMode === 'search' ? t.browserBack : t.search}
            placement="top"
          >
            <button
              type="button"
              className={`adl-tool-context__iconbtn${navigatorMode === 'search' ? ' is-active' : ''}`}
              onClick={() => setNavigatorMode(navigatorMode === 'search' ? 'tree' : 'search')}
              aria-label={(navigatorMode === 'search' ? t.browserBack : t.search) as string}
            >
              {navigatorMode === 'search' ? (
                <IconReturn size={14} decorative />
              ) : (
                <IconSearch size={14} decorative />
              )}
            </button>
          </TooltipSimple>

          <FileHistoryNav
            canGoBack={fileHistory.canGoBack}
            canGoForward={fileHistory.canGoForward}
            onBack={fileHistory.navigateBack}
            onForward={fileHistory.navigateForward}
          />
        </div>

        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <div className="adl-tool-context__divider" />
          <TooltipSimple content={previewEnabled ? t.filePreview : t.fileEdit} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn${previewEnabled ? ' is-active' : ''}`}
              onClick={() => setPreviewEnabled(!previewEnabled)}
              aria-label={(previewEnabled ? t.filePreview : t.fileEdit) as string}
              aria-pressed={previewEnabled ? 'true' : 'false'}
            >
              <IconEye size={14} decorative />
            </button>
          </TooltipSimple>
          <FileContextMenu menuItems={fileMenuItems} />
        </div>
      </div>

      <div
        className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={{ '--adl-files-nav-width': `${filesNavigatorWidth}px` } as React.CSSProperties}
      >
        <FileNavigatorShell
          selectedFilePath={selectedFilePath}
          selectedFileWorkspaceId={selectedFileWorkspaceId}
          workspaceTrees={workspaceTrees}
          recentWorkspaces={recentWorkspaces}
          allExpanded={allExpanded}
          workspaceTreeExpandedInFileNav={workspaceTreeExpandedInFileNav}
          workspaceTreeLoading={workspaceTreeLoading}
          workspaceTreeErrors={workspaceTreeErrors}
          outline={outline}
          searchQuery={searchQuery}
          searchEntries={searchEntries}
          externalChangePath={externalChangePath}
          dirtyEditorPaths={dirtyEditorPaths}
          appInfo={appInfo}
          onOpenFile={onOpenFile}
          onOpenFileForWorkspace={onOpenFileForWorkspace}
          onOpenFileAtLine={handleOpenSearchResultAtLine}
          onSearch={onSearch}
          onSearchChange={onSearchChange}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
          onRefreshAll={onRefreshAll}
          onRefreshOneWorkspace={onRefreshOneWorkspace}
          onToggleExpandInFileNav={onToggleExpandInFileNav}
          onHideFromRightPanels={onHideFromRightPanels}
          onCreateWorkspaceFile={onCreateWorkspaceFile}
          onCreateWorkspaceFolder={onCreateWorkspaceFolder}
          onEditorChange={onEditorChange}
          onNavigateLine={handleNavigateLine}
        />

        <div className="adl-tool-primary">
          <div ref={editorShellRef} className="adl-tool-editor" data-testid="editor-shell">
            <SuspenseWrapper>
              <LazyEditorSurface
                selectedFilePath={selectedFilePath}
                fileContent={fileContent}
                fileMedia={fileMedia}
                fileMediaLoading={fileMediaLoading}
                fileOpenError={fileOpenError}
                positioningPath={positioningPath}
                filePatch={filePatch}
                editorLanguage={editorLanguage}
                diagnostics={diagnostics}
                editorHint={editorHint}
                outline={outline}
                activePatchSet={activePatchSet}
                selectedPatchFilePath={selectedPatchFilePath}
                selectedPatchHunkId={selectedPatchHunkId}
                collapsedPatchHunkIds={collapsedPatchHunkIds}
                onEditorChange={onEditorChange}
                onEditorMount={onEditorMount}
                onDiffMount={onDiffMount}
                onOpenFile={onOpenFile}
                onOpenFileForWorkspace={onOpenFileForWorkspace}
                onSetDiffLayout={onSetDiffLayout}
                onJumpPatchHunk={onJumpPatchHunk}
                onSelectPatchHunk={onSelectPatchHunk}
                onTogglePatchHunkCollapse={onTogglePatchHunkCollapse}
                onSetAllPatchHunksCollapsed={onSetAllPatchHunksCollapsed}
                onOpenFileAtLine={onOpenFileAtLine}
                resolvedTheme={resolvedTheme}
                resolvedLocale={resolvedLocale}
                diffSideBySide={diffSideBySide}
                getStickySourceEditor={getStickySourceEditor}
                cmViewRef={cmViewRef}
                localDiffEditorRef={localDiffEditorRef}
                editorSurfaceRef={editorSurfaceRef}
                standardEditorRef={props.standardEditorRef}
                editorOptions={editorOptions}
              />
            </SuspenseWrapper>
          </div>

          {diagnostics.length > 0 ? (
            <div className="adl-tool-diagnostics">
              <h5>{t.diagnostics as string}</h5>
              <ul>
                {diagnostics.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="adl-tool-diagnostics__item"
                      onClick={() => {
                        if (d.path && d.path !== selectedFilePath) {
                          onOpenFileAtLine(d.path, d.line ?? 1);
                          return;
                        }
                        handleNavigateLine(d.line ?? 1);
                      }}
                    >
                      <strong>{d.source}</strong>
                      <span>{d.message}</span>
                      <span>
                        {d.path ?? selectedFilePath}
                        {d.line ? `:${d.line}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export { FilesPanel };
