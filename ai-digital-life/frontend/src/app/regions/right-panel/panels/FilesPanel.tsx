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
import { FileContextMenu, type FileMenuItem, type FileMenuDivider } from '../FileContextMenu';
import { FileHistoryNav } from '../FileHistoryNav';
import type { FilesPanelProps } from '../types';
import { useTCopy } from '@i18n/useTCopy';
import { joinPathSegments } from '@utils/workspacePaths';
import {
  findLineForQuery,
  revealEditorLineSafely,
  revealSourceLine,
  scrollAndFlash,
} from '@features/preview/revealSourceLine';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

const FilesPanel = React.memo(function FilesPanel(props: FilesPanelProps) {
  const { t } = useTCopy();
  const {
    appInfo,
    selectedFilePath,
    selectedFileWorkspaceId,
    fileContent,
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
  } | null>(null);
  /** 编辑器链路的事后校验：文件打开后内容到达时验证命中是否仍在（已揭示无法撤回，只标 stale/纠正落点）。 */
  const pendingSearchValidateRef = useRef<{
    path: string;
    line: number;
    nonce: number;
    query: { text: string; matchCase: boolean; wholeWord: boolean; useRegex: boolean };
  } | null>(null);
  // 预览块级锚点由懒加载预览渲染后出现，故按"重试直到锚点就绪"处理（上限 2.5s）
  const previewRevealTimerRef = useRef<number | undefined>(undefined);
  const searchValidateNonceRef = useRef(0);
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
      // 点击校验/重定位（事项 45）：live 内容可用时先校验，命中消失则标失效并停止，
      // 重定位成功则后续流程使用重定位后的行号。
      const liveContent =
        state.selectedFilePath === relativePath && state.fileContent !== undefined
          ? state.fileContent
          : undefined;
      let targetLine = line;
      const querySnap = {
        text: state.searchQuery,
        matchCase: state.searchMatchCase,
        wholeWord: state.searchMatchWholeWord,
        useRegex: state.searchUseRegex,
      };
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
          nonce: (searchValidateNonceRef.current += 1),
          query: querySnap,
        };
      }
      onOpenFileAtLine(relativePath, targetLine);
    },
    [isPreviewModeForPath, onOpenFile, onOpenFileAtLine, revealInPreview],
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
    if (!isPreviewModeForPath(pending.path)) {
      pendingPreviewRevealRef.current = null;
      return;
    }
    // 内容到达后补校验（未打开文件的 stale 标记）：消失则标失效并停止，
    // 移位则用重定位行号继续（事项 45 Phase 4 1.4）。
    const validatePending = (content: string): number | null =>
      findLineForQuery(content, pending.query.text, pending.query, pending.line);
    const settleStale = () => {
      const state = useAppStore.getState();
      state.markSearchHitStale(pending.path, pending.line, state.searchWorkspaceId);
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
              state.markSearchHitStale(current.path, current.line, state.searchWorkspaceId);
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
    if (isPreviewModeForPath(validating.path)) {
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
      state.markSearchHitStale(validating.path, validating.line, state.searchWorkspaceId);
      return;
    }
    if (relocated !== validating.line) {
      handleNavigateLine(relocated);
    }
  }, [selectedFilePath, fileContent, isPreviewModeForPath, handleNavigateLine]);

  const fileMenuItems: (FileMenuItem | FileMenuDivider)[] = useMemo(
    () => [
      {
        id: 'copy-relative',
        label: t.fileCopyRelativePath as string,
        shortcut: 'Ctrl+Shift+C',
        disabled: !selectedFilePath,
        action: () => void handleCopyPath(selectedFilePath),
      },
      {
        id: 'copy-full',
        label: t.fileCopyFullPath as string,
        shortcut: 'Ctrl+Alt+C',
        disabled: !selectedAbsolutePath,
        action: () => void handleCopyPath(selectedAbsolutePath),
      },
      { id: 'sep-2', separator: true },
      {
        id: 'line-numbers',
        label: t.fileLineNumbers as string,
        checked: editorOptions.lineNumbersEnabled,
        action: () => editorOptions.setLineNumbersEnabled((v) => !v),
      },
      {
        id: 'word-wrap',
        label: t.fileWordWrap as string,
        shortcut: t.fileWordWrapShortcut as string,
        checked: editorOptions.wordWrapEnabled,
        action: () => editorOptions.setWordWrapEnabled((v) => !v),
      },
    ],
    [t, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath],
  );

  const resolvedTheme = useResolvedTheme();
  const resolvedLocale = appInfo?.config?.language ?? 'zh-CN';

  return (
    <div className="adl-tool-panel adl-tool-panel--files">
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
          {editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null}

          <div ref={editorShellRef} className="adl-tool-editor" data-testid="editor-shell">
            <SuspenseWrapper>
              <LazyEditorSurface
                selectedFilePath={selectedFilePath}
                fileContent={fileContent}
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
