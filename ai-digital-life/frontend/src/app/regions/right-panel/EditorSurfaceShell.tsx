import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { FilePreviewRenderers } from './FilePreviewRenderers';
import {
  TEXT_HEAVY_PREVIEW_CHARS,
  confirmHeavyPreview,
  isHeavyPreviewConfirmed,
  isHeavyTextCategory,
} from './heavyPreviewLimits';
import { formatBytes } from '@root/design-system/html';
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
  | 'fileMedia'
  | 'fileMediaLoading'
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
    fileMedia,
    fileMediaLoading,
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
  const editorViewport = useAppStore((s) => s.editorViewport);
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

  useEditorStateCache(cmViewRef, selectedFilePath, selectedFileWorkspaceId);

  // 文本重型门确认：模块级 Set 记忆（Phase 4 审查 F2），多重型文件往返不重复打扰；
  // tick 仅用于确认后触发重渲染。
  const [, setHeavyConfirmTick] = useState(0);
  const heavyTextBytes = useMemo(() => {
    if (!fileContent || fileContent.length <= TEXT_HEAVY_PREVIEW_CHARS) {
      return 0;
    }
    try {
      return new TextEncoder().encode(fileContent).length;
    } catch {
      return fileContent.length;
    }
  }, [fileContent]);

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

  // 开文件失败优先：主区展示友好错误，不回退显示旧文件内容（事项 46 调整项，用户决策）。
  // 必须在重型门之前——失败时 store 可能残留旧 fileContent，门会遮蔽错误视图。
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

  // 文本重型门：txt/md/代码超 1MB 时先显示友好提示 + "仍然打开"，确认后才渲染。
  // 补丁 diff 分支内容来自变更预览（服务端 1MB 钳制），不受此门影响。
  if (
    fileContent !== undefined &&
    fileContent.length > TEXT_HEAVY_PREVIEW_CHARS &&
    isHeavyTextCategory(fileCategory) &&
    !isHeavyPreviewConfirmed(selectedFileWorkspaceId, selectedFilePath)
  ) {
    return (
      <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
        <div className="adl-unsupported-preview">
          <svg
            className="adl-unsupported-preview__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <path d="M12 11v6" />
            <path d="M9 14h6" />
          </svg>
          <span className="adl-unsupported-preview__text">{t.heavyPreviewTitle as string}</span>
          <span className="adl-unsupported-preview__hint">
            {formatT(t, 'heavyPreviewHint', {
              name: selectedFilePath,
              size: formatBytes(heavyTextBytes),
            })}
          </span>
          <button
            type="button"
            className="adl-unsupported-preview__action"
            onClick={() => {
              confirmHeavyPreview(selectedFileWorkspaceId, selectedFilePath);
              setHeavyConfirmTick((tick) => tick + 1);
            }}
          >
            {t.heavyPreviewOpen as string}
          </button>
        </div>
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
    fileCategory === 'image' ||
    fileCategory === 'audio' ||
    fileCategory === 'video' ||
    fileCategory === 'spreadsheet' ||
    fileCategory === 'presentation' ||
    fileCategory === 'binary'
  ) {
    return (
      <FilePreviewRenderers
        editorSurfaceRef={editorSurfaceRef}
        fileCategory={fileCategory}
        fileContent={fileContent ?? null}
        fileMedia={fileMedia ?? null}
        fileMediaLoading={fileMediaLoading}
        filePath={selectedFilePath}
        workspaceId={selectedFileWorkspaceId}
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
          workspaceId={selectedFileWorkspaceId}
          viewport={editorViewport}
          onChange={props.onEditorChange}
          onMount={handleStandardEditorMount}
        />
      </Suspense>
    </div>
  );
});

export { EditorSurfaceShell };
export type { EditorSurfaceShellProps };
