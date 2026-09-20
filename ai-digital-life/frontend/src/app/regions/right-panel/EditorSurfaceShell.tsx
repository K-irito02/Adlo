import React, { lazy, Suspense, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { FilePreviewRenderers } from './FilePreviewRenderers';
import type { EditorRef, DiffEditorRef } from '@stores/types';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { StickyContext } from './editor-support/stickyContextView';
import { DiffToolbar } from './DiffToolbar';
import type { PatchHunkSummary } from '@features/patch-review';
import { useStickyContext, useWrapColumn, useEditorStateCache } from './hooks';
import type { UseEditorOptionsResult } from './hooks';
import { IconChevronDown, IconChevronRight } from '@icons';
import type { RightPanelViewProps } from './types';
import { useTCopy } from '@i18n/useTCopy';
import { useDiffStickyRanges } from './useDiffStickyRanges';

/** 后端"不存在"类错误码归一化（Phase 4 审查 L3）：大小写/分隔符不敏感，另认 ENOENT。 */
function isNotFoundCode(code: string): boolean {
  const norm = code.toUpperCase().replace(/[^A-Z]/g, '_');
  return norm.includes('NOT_FOUND') || norm === 'ENOENT';
}

const CodeEditor = lazy(() =>
  import('../../features/editor').then((m) => ({ default: m.CodeEditor })),
);
const DiffViewer = lazy(() =>
  import('../../features/diff-viewer').then((m) => ({ default: m.DiffViewer })),
);

interface EditorSurfaceShellProps extends Pick<
  RightPanelViewProps,
  | 'selectedFilePath'
  | 'fileContent'
  | 'fileOpenError'
  | 'positioningPath'
  | 'filePatch'
  | 'editorLanguage'
  | 'diagnostics'
  | 'editorHint'
  | 'outline'
  | 'activePatchSet'
  | 'selectedPatchFilePath'
  | 'selectedPatchHunkId'
  | 'collapsedPatchHunkIds'
  | 'onEditorChange'
  | 'onEditorMount'
  | 'onDiffMount'
  | 'onOpenFile'
  | 'onOpenFileForWorkspace'
  | 'onSetDiffLayout'
  | 'onJumpPatchHunk'
  | 'onSelectPatchHunk'
  | 'onTogglePatchHunkCollapse'
  | 'onSetAllPatchHunksCollapsed'
  | 'onOpenFileAtLine'
> {
  resolvedTheme: 'dark' | 'light';
  resolvedLocale: string;
  diffSideBySide: boolean;
  getStickySourceEditor: () => EditorRef | null;
  cmViewRef: React.MutableRefObject<EditorView | null>;
  localDiffEditorRef: React.MutableRefObject<DiffEditorRef | EditorRef | null>;
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  standardEditorRef: React.MutableRefObject<EditorRef | null>;
  editorOptions: UseEditorOptionsResult;
}

const EditorSurfaceShell = React.memo(function EditorSurfaceShell(props: EditorSurfaceShellProps) {
  const { t, formatT } = useTCopy();
  const {
    selectedFilePath,
    fileContent,
    fileOpenError,
    positioningPath,
    filePatch,
    editorLanguage,
    editorHint,
    outline,
    resolvedTheme,
    resolvedLocale,
    diffSideBySide,
    getStickySourceEditor,
    cmViewRef,
    localDiffEditorRef,
    editorSurfaceRef,
    standardEditorRef,
    editorOptions,
    onEditorMount,
    onDiffMount,
    onOpenFile,
    onOpenFileForWorkspace,
  } = props;

  const selectedFileWorkspaceId = useAppStore((s) => s.selectedFileWorkspaceId);
  const filePreviewModeByPath = useAppStore(
    useShallow((s) => s.filePreviewModeByPath[selectedFileWorkspaceId ?? ''] ?? {}),
  );

  const {
    fileCategory,
    previewEnabled,
    hasActivePatch,
    activeFilePatch,
    activeFilePatchSummary,
    stickyContextInput,
  } = useDiffStickyRanges({
    selectedFilePath,
    fileContent,
    filePatch,
    filePreviewModeByPath,
    activePatchSet: props.activePatchSet,
    selectedPatchFilePath: props.selectedPatchFilePath,
    collapsedPatchHunkIds: props.collapsedPatchHunkIds,
    selectedPatchHunkId: props.selectedPatchHunkId,
    outline,
    getStickySourceEditor,
    editorSurfaceRef,
    wordWrapEnabled: editorOptions.wordWrapEnabled,
    diffSideBySide,
  });

  const stickyContextModel = useStickyContext(stickyContextInput);

  useWrapColumn({
    getStickySourceEditor,
    wordWrapEnabled: editorOptions.wordWrapEnabled,
    diffSideBySide,
    selectedFilePath,
  });

  useEditorStateCache(cmViewRef, selectedFilePath);

  const handleStandardEditorMount = useCallback(
    (editor: EditorRef) => {
      const domNode = editor.getDomNode?.();
      cmViewRef.current = domNode ? (EditorView.findFromDOM(domNode) ?? null) : null;
      standardEditorRef.current = editor;
      onEditorMount(editor);
    },
    [onEditorMount, cmViewRef, standardEditorRef],
  );

  const handleDiffEditorMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      localDiffEditorRef.current = editor;
      let editorRef: EditorRef;
      if ('getModifiedEditor' in editor) {
        editorRef =
          (editor as DiffEditorRef).getModifiedEditor() ?? (editor as unknown as EditorRef);
      } else {
        editorRef = editor as unknown as EditorRef;
      }
      onDiffMount(editorRef);
    },
    [onDiffMount, localDiffEditorRef],
  );

  const hasCollapsedHunks = !!activeFilePatchSummary?.hunks.some((h) => h.isCollapsed);

  if (!selectedFilePath) {
    return editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null;
  }

  // 开文件失败：主区展示友好错误，不回退显示旧文件内容（事项 46 调整项，用户决策）。
  if (fileOpenError && fileOpenError.path === selectedFilePath) {
    const isNotFound = isNotFoundCode(fileOpenError.code);
    // scoped 重试目标齐全才走工作区入口，否则回退单文件入口（Phase 4 审查 O3：无非空断言）。
    const retryTarget =
      fileOpenError.workspaceId !== undefined && fileOpenError.workspacePath !== undefined
        ? {
            workspaceId: fileOpenError.workspaceId,
            workspacePath: fileOpenError.workspacePath,
          }
        : undefined;
    return (
      <div className="adl-tool-editor__open-error" role="alert">
        <strong className="adl-tool-editor__open-error-title">{t.fileOpenErrorTitle}</strong>
        <span className="adl-tool-editor__open-error-path" title={fileOpenError.path}>
          {fileOpenError.path}
        </span>
        <p className="adl-tool-editor__open-error-detail">
          {isNotFound
            ? t.fileOpenErrorNotFound
            : formatT(t, 'fileOpenErrorDetail', {
                message: fileOpenError.message || fileOpenError.code,
              })}
        </p>
        <button
          type="button"
          className="adl-tool-editor__open-error-retry"
          title={fileOpenError.path}
          onClick={() => {
            if (retryTarget) {
              onOpenFileForWorkspace(
                retryTarget.workspaceId,
                retryTarget.workspacePath,
                fileOpenError.path,
              );
            } else {
              onOpenFile(fileOpenError.path);
            }
          }}
        >
          {t.fileOpenErrorRetry}
        </button>
      </div>
    );
  }

  if (hasActivePatch && filePatch) {
    return (
      <>
        <DiffToolbar
          diffSideBySide={diffSideBySide}
          lineNumbersEnabled={editorOptions.lineNumbersEnabled}
          wordWrapEnabled={editorOptions.wordWrapEnabled}
          hasCollapsedHunks={hasCollapsedHunks}
          activePatchRelativePath={activeFilePatch?.relativePath}
          onSetDiffLayout={props.onSetDiffLayout}
          onToggleLineNumbers={() => editorOptions.setLineNumbersEnabled((v) => !v)}
          onToggleWordWrap={() => editorOptions.setWordWrapEnabled((v) => !v)}
          onJumpPatchHunk={props.onJumpPatchHunk}
          onSetAllPatchHunksCollapsed={props.onSetAllPatchHunksCollapsed}
        />
        {activeFilePatchSummary ? (
          <div className="adl-diff-hunk-strip" aria-label={t.patchReview as string}>
            <div className="adl-diff-hunk-strip__header">
              <div>
                <strong>{activeFilePatchSummary.relativePath}</strong>
                <small>
                  {activeFilePatchSummary.totalHunks}
                  {' · '}
                  {activeFilePatchSummary.acceptedHunks + activeFilePatchSummary.rejectedHunks}
                  {'/'}
                  {activeFilePatchSummary.totalHunks}
                </small>
              </div>
            </div>
            <div className="adl-diff-hunk-strip__list">
              {activeFilePatchSummary.hunks.map(
                (hunk: PatchHunkSummary & { isCollapsed?: boolean }, index: number) => (
                  <div
                    key={hunk.id}
                    className={`adl-diff-hunk-pill adl-diff-hunk-pill--${hunk.changeKind}${
                      props.selectedPatchHunkId === hunk.id ? ' is-active' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="adl-diff-hunk-pill__main"
                      onClick={() =>
                        props.onSelectPatchHunk(
                          activeFilePatch!.relativePath,
                          hunk.id,
                          hunk.targetLine,
                          { activateTool: false },
                        )
                      }
                    >
                      <span className="adl-diff-hunk-pill__index">{index + 1}</span>
                      <span className="adl-diff-hunk-pill__body">
                        <strong>{hunk.preview}</strong>
                        <small>
                          {hunk.newStart || hunk.oldStart}
                          {hunk.isCollapsed ? ` · ${t.expandDetails}` : ''}
                        </small>
                      </span>
                      <span className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}>
                        {hunk.decision === 'accepted'
                          ? t.approvalApproved
                          : hunk.decision === 'rejected'
                            ? t.approvalRejected
                            : t.approvalPendingCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="adl-diff-hunk-pill__toggle"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onTogglePatchHunkCollapse(hunk.id);
                      }}
                      aria-label={
                        (hunk.isCollapsed ? t.expandDetails : t.collapseDetails) as string
                      }
                    >
                      {hunk.isCollapsed ? (
                        <IconChevronRight size={12} decorative />
                      ) : (
                        <IconChevronDown size={12} decorative />
                      )}
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null}
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
          {stickyContextModel ? (
            <StickyContext data-testid="files-sticky-context" model={stickyContextModel} />
          ) : null}
          <Suspense fallback={null}>
            <DiffViewer
              original={filePatch.beforeContent}
              modified={filePatch.afterContent}
              language={editorLanguage}
              theme={resolvedTheme}
              locale={resolvedLocale}
              sideBySide={diffSideBySide}
              collapseUnchanged={true}
              fileKey={selectedFilePath}
              readOnly={editorOptions.diffOptions.readOnly}
              lineNumbers={editorOptions.diffOptions.lineNumbers}
              wordWrap={editorOptions.diffOptions.wordWrap}
              onMount={handleDiffEditorMount}
            />
          </Suspense>
        </div>
      </>
    );
  }

  if (
    (fileCategory === 'markdown' && previewEnabled) ||
    fileCategory === 'docx' ||
    fileCategory === 'pdf' ||
    fileCategory === 'binary'
  ) {
    return (
      <FilePreviewRenderers
        editorSurfaceRef={editorSurfaceRef}
        fileCategory={fileCategory}
        fileContent={fileContent ?? null}
        theme={resolvedTheme}
      />
    );
  }

  return (
    <div
      ref={editorSurfaceRef}
      className="adl-tool-editor__surface"
      // 定位完成前隐藏表面（保布局可量测）：揭示成功/放弃即显现，全程无中间态
      style={
        positioningPath !== null && positioningPath === selectedFilePath
          ? { visibility: 'hidden' }
          : undefined
      }
      aria-busy={
        positioningPath !== null && positioningPath === selectedFilePath ? true : undefined
      }
    >
      {stickyContextModel ? (
        <StickyContext data-testid="files-sticky-context" model={stickyContextModel} />
      ) : null}
      <Suspense fallback={null}>
        <CodeEditor
          value={fileContent ?? ''}
          language={editorLanguage}
          theme={resolvedTheme}
          readOnly={previewEnabled || editorOptions.standardOptions.readOnly}
          lineNumbers={editorOptions.standardOptions.lineNumbers}
          wordWrap={editorOptions.standardOptions.wordWrap}
          fileKey={selectedFilePath}
          onChange={props.onEditorChange}
          onMount={handleStandardEditorMount}
        />
      </Suspense>
    </div>
  );
});

export { EditorSurfaceShell };
export type { EditorSurfaceShellProps };
