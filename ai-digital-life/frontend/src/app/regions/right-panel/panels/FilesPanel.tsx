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
import { findLineForQuery, revealSourceLine } from '@features/preview/revealSourceLine';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

// 临时调试日志（用户指定：本轮排查用，收尾前需移除）
function debugNavigate(event: string, data?: Record<string, unknown>): void {
  console.warn('[ADL-DEBUG][navigate]', event, data ?? {});
}

const FilesPanel = React.memo(function FilesPanel(props: FilesPanelProps) {
  const { t } = useTCopy();
  const {
    appInfo,
    selectedFilePath,
    selectedFileWorkspaceId,
    fileContent,
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
          ? (s.filePreviewModeByPath[selectedFilePath] ?? fileCategory === 'markdown')
          : false,
      [selectedFilePath, fileCategory],
    ),
  );

  const setPreviewEnabled = useCallback(
    (enabled: boolean) => {
      if (!selectedFilePath) {
        return;
      }
      setFilePreviewModeForPath(selectedFilePath, enabled);
    },
    [selectedFilePath, setFilePreviewModeForPath],
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
    (line: number) => {
      debugNavigate('enter', {
        line,
        path: selectedFilePath,
        fileCategory,
        previewEnabled,
      });
      // For markdown preview mode, use DOM-based scrolling directly
      // (stale editor ref may exist from edit mode, but no CodeMirror is visible)
      if (fileCategory === 'markdown' && previewEnabled) {
        const surface = editorSurfaceRef.current;
        if (!surface) {
          console.warn('[ADL-DEBUG][navigate] preview mode but no editor surface');
          return;
        }
        // 块级源行映射（data-source-line-start/end）由 markdownPreviewUtils 生成；
        // end 为闭区间末行号（单行块 start === end）。找不到包含该行的块时按业界做法
        // 回退到"最近的前置块"，最后兜底按比例滚动。
        const candidates = Array.from(
          surface.querySelectorAll<HTMLElement>('[data-source-line-start]'),
        );
        let target: HTMLElement | null = null;
        let fallback: HTMLElement | null = null;
        for (const el of candidates) {
          const start = Number(el.dataset.sourceLineStart);
          const end = Number(el.dataset.sourceLineEnd);
          if (start <= line && line <= end) {
            // 取最内层（文档顺序中最后一个）包含该行的元素
            target = el;
          } else if (end < line) {
            fallback = el;
          }
        }
        const resolved = target ?? fallback ?? candidates[0] ?? null;
        debugNavigate('preview', {
          line,
          candidates: candidates.length,
          resolvedStart: resolved?.dataset.sourceLineStart,
          resolvedEnd: resolved?.dataset.sourceLineEnd,
          exact: !!target,
        });
        if (resolved) {
          resolved.scrollIntoView({ behavior: 'smooth', block: 'center' });
          resolved.classList.remove('adl-md-flash');
          // 强制重排以便连续跳转时动画可重放
          void resolved.offsetWidth;
          resolved.classList.add('adl-md-flash');
          window.setTimeout(() => resolved.classList.remove('adl-md-flash'), 1400);
        } else {
          // 无任何块级锚点（极端情况）：按行占比估算滚动位置
          const scroller = surface;
          const total = surface.querySelectorAll('[data-source-line-start]').length;
          const ratio = total > 0 ? line / total : 0;
          scroller.scrollTop = Math.max(0, ratio * (scroller.scrollHeight - scroller.clientHeight));
        }
        return;
      }
      const editor = getStickySourceEditor();
      if (editor) {
        const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
        debugNavigate('editor', {
          line,
          lineCount: Number.isFinite(lineCount) ? lineCount : 'unknown',
        });
        // stale 行不丢弃，钳制到最近有效行（越界行会抛 RangeError，且无错误边界）
        let target = line;
        if (line < 1) {
          target = 1;
        } else if (Number.isFinite(lineCount) && line > lineCount) {
          target = lineCount;
          console.warn(
            `[FilesPanel] stale navigate line clamped: requested=${line}, applied=${target}, path=${selectedFilePath ?? 'unknown'}`,
          );
        }
        editor.revealLineInCenter?.(target);
        editor.setPosition?.({ lineNumber: target, column: 1 });
        editor.focus?.();
        return;
      }
    },
    [getStickySourceEditor, fileCategory, previewEnabled, editorSurfaceRef, selectedFilePath],
  );

  // 检索结果行跳转：预览模式（markdown 且该路径预览开启）下编辑器不可见，
  // 原 onOpenFileAtLine 的 editor reveal 不生效，改走预览 DOM 跳转
  const pendingPreviewRevealRef = useRef<{
    path: string;
    line: number;
    from: string | undefined;
    baseline: string | undefined;
    nonce: number;
  } | null>(null);
  // 预览块级锚点由懒加载预览渲染后出现，故按"重试直到锚点就绪"处理（上限 2.5s）
  const previewRevealTimerRef = useRef<number | undefined>(undefined);

  const isPreviewModeForPath = useCallback((relativePath: string): boolean => {
    if (categorizeFile(relativePath) !== 'markdown') {
      return false;
    }
    const previewByPath = useAppStore.getState().filePreviewModeByPath;
    return previewByPath[relativePath] ?? true;
  }, []);

  const revealInPreview = useCallback(
    (line: number) => {
      if (previewRevealTimerRef.current !== undefined) {
        window.clearInterval(previewRevealTimerRef.current);
        previewRevealTimerRef.current = undefined;
      }
      const startedAt = Date.now();
      const attempt = () => {
        const surface = editorSurfaceRef.current;
        if (surface && revealSourceLine(surface, line, { flash: true })) {
          debugNavigate('preview', { line });
          if (previewRevealTimerRef.current !== undefined) {
            window.clearInterval(previewRevealTimerRef.current);
            previewRevealTimerRef.current = undefined;
          }
          return;
        }
        // 未挂载（懒加载）→ 保持 60ms 重试，上限 2.5s 后放弃
        if (Date.now() - startedAt > 2500) {
          debugNavigate('preview-give-up', { line });
          if (previewRevealTimerRef.current !== undefined) {
            window.clearInterval(previewRevealTimerRef.current);
            previewRevealTimerRef.current = undefined;
          }
        }
      };
      attempt();
      if (previewRevealTimerRef.current === undefined) {
        previewRevealTimerRef.current = window.setInterval(attempt, 60);
      }
    },
    [editorSurfaceRef],
  );

  useEffect(
    () => () => {
      if (previewRevealTimerRef.current !== undefined) {
        window.clearInterval(previewRevealTimerRef.current);
      }
    },
    [],
  );

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
      if (liveContent !== undefined) {
        const relocated = findLineForQuery(
          liveContent,
          state.searchQuery,
          {
            matchCase: state.searchMatchCase,
            wholeWord: state.searchMatchWholeWord,
            useRegex: state.searchUseRegex,
          },
          line,
        );
        if (relocated === null) {
          state.markSearchHitStale(relativePath, line);
          return;
        }
        targetLine = relocated;
      }
      if (isPreviewModeForPath(relativePath)) {
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
          nonce: Date.now(),
        };
        // 预览模式不挂编辑器：只打开文件，行定位交给 revealInPreview
        // （若走 onOpenFileAtLine，会在隐藏/陈旧的编辑器上做一次无意义的揭示）
        onOpenFile(relativePath);
        return;
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
    if (fileContent === pending.baseline) {
      // 仍是旧内容（新内容加载中）：给加载留 800ms，超时按相同文本处理
      debugNavigate('pending-wait-new-content', { path: pending.path, line: pending.line });
      const timer = window.setTimeout(() => {
        const current = pendingPreviewRevealRef.current;
        if (current && current.nonce === pending.nonce) {
          pendingPreviewRevealRef.current = null;
          revealInPreview(current.line);
        }
      }, 800);
      return () => window.clearTimeout(timer);
    }
    pendingPreviewRevealRef.current = null;
    debugNavigate('pending-fire', { path: pending.path, line: pending.line });
    revealInPreview(pending.line);
  }, [selectedFilePath, fileContent, isPreviewModeForPath, revealInPreview]);

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
