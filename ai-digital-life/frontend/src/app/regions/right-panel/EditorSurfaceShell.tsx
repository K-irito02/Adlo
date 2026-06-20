import React, { lazy, Suspense, useCallback, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import {
  getAgentDecorationExtensions,
  type AgentHunkDecoration,
} from './editor-support/agentDecorations';
import { categorizeFile } from './fileTypeRouter';
import { FilePreviewRenderers } from './FilePreviewRenderers';
import type { EditorRef, DiffEditorRef } from '../../stores/types';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { StickyContext } from './editor-support/stickyContextView';
import { DiffToolbar } from './DiffToolbar';
import {
  derivePatchHunkChangeKind,
  summarizePatchFile,
  type PatchHunkSummary,
} from '../../features/patch-review';
import { useStickyContext, useWrapColumn, useAgentDecorations, useEditorStateCache } from './hooks';
import type { UseEditorOptionsResult } from './hooks';
import type { PreviewDiffVisualRange } from '../../features/diff-viewer';
import { IconChevronDown, IconChevronRight } from '../../icons';
import type { RightPanelViewProps } from './types';
import { useTCopy } from '../../i18n/useTCopy';

const CodeEditor = lazy(() =>
  import('../../features/editor').then((m) => ({ default: m.CodeEditor }))
);
const DiffViewer = lazy(() =>
  import('../../features/diff-viewer').then((m) => ({ default: m.DiffViewer }))
);

interface EditorSurfaceShellProps extends Pick<
  RightPanelViewProps,
  | 'selectedFilePath'
  | 'fileContent'
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

function buildStickyDiffRangesFromHunks(
  hunks: NonNullable<ReturnType<typeof summarizePatchFile>>['hunks']
): PreviewDiffVisualRange[] {
  return hunks.flatMap((hunk) => {
    const anchorLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
    const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
    if (hunk.changeKind === 'added') {
      return [
        {
          startLine: anchorLine,
          endLine: anchorLine + lineSpan - 1,
          type: 'insert' as const,
          tone: 'strong' as const,
          contentColumns: 1,
        },
      ];
    }
    if (hunk.changeKind === 'deleted') {
      return [
        {
          startLine: anchorLine,
          endLine: anchorLine,
          type: 'delete' as const,
          tone: 'base' as const,
          contentColumns: 1,
        },
      ];
    }
    return [
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: 'insert' as const,
        tone: 'strong' as const,
        contentColumns: 1,
      },
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: 'delete' as const,
        tone: 'base' as const,
        contentColumns: 1,
      },
    ];
  });
}

const EditorSurfaceShell = React.memo(function EditorSurfaceShell(props: EditorSurfaceShellProps) {
  const { t } = useTCopy();
  const {
    selectedFilePath,
    fileContent,
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
  } = props;

  const filePreviewModeByPath = useAppStore(useShallow((s) => s.filePreviewModeByPath));

  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);

  const previewEnabled = selectedFilePath
    ? (filePreviewModeByPath[selectedFilePath] ?? fileCategory === 'markdown')
    : false;

  const hasActivePatch = !!(filePatch && filePatch.relativePath === selectedFilePath);

  const activeFilePatch = useMemo(() => {
    if (!props.activePatchSet || !props.selectedPatchFilePath) {
      return undefined;
    }
    return props.activePatchSet.filePatches.find(
      (c) => c.relativePath === props.selectedPatchFilePath
    );
  }, [props.activePatchSet, props.selectedPatchFilePath]);

  const activeFilePatchSummary = useMemo(
    () =>
      activeFilePatch
        ? summarizePatchFile(activeFilePatch, props.collapsedPatchHunkIds)
        : undefined,
    [activeFilePatch, props.collapsedPatchHunkIds]
  );

  const stickyDiffRanges = useMemo(
    () =>
      activeFilePatchSummary
        ? buildStickyDiffRangesFromHunks(activeFilePatchSummary.hunks)
        : undefined,
    [activeFilePatchSummary]
  );

  const agentHunkDecorations = useMemo<AgentHunkDecoration[]>(() => {
    if (!activeFilePatch || !selectedFilePath) {
      return [];
    }
    return activeFilePatch.hunks.map((hunk) => {
      const changeKind = derivePatchHunkChangeKind(hunk);
      const startLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
      const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
      const endLine = startLine + lineSpan - 1;
      return {
        startLine,
        endLine,
        changeKind,
        decision: (hunk.decision === 'accepted'
          ? 'accepted'
          : hunk.decision === 'rejected'
            ? 'rejected'
            : 'pending') as 'accepted' | 'rejected' | 'pending',
        isSelected: props.selectedPatchHunkId === hunk.id,
        hunkId: hunk.id,
      };
    });
  }, [activeFilePatch, props.selectedPatchHunkId, selectedFilePath]);

  const editorExtensions = useMemo(() => [...getAgentDecorationExtensions()], []);

  const diffEditorExtensions = useMemo(() => [...getAgentDecorationExtensions()], []);

  const stickyContextContent =
    filePatch && filePatch.relativePath === selectedFilePath
      ? (filePatch.afterContent ?? '')
      : (fileContent ?? '');

  const stickyContextInput = useMemo(
    () => ({
      selectedFilePath,
      content: stickyContextContent,
      outline,
      getStickySourceEditor,
      wordWrapEnabled: editorOptions.wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef,
      stickyDiffRanges,
    }),
    [
      selectedFilePath,
      stickyContextContent,
      outline,
      getStickySourceEditor,
      editorOptions.wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef,
      stickyDiffRanges,
    ]
  );

  const stickyContextModel = useStickyContext(stickyContextInput);

  useWrapColumn({
    getStickySourceEditor,
    wordWrapEnabled: editorOptions.wordWrapEnabled,
    diffSideBySide,
    selectedFilePath,
  });

  useAgentDecorations({
    cmViewRef,
    agentAnnotationsEnabled: editorOptions.agentAnnotationsEnabled,
    agentHunkDecorations,
    hasActivePatch,
  });

  useEditorStateCache(cmViewRef, selectedFilePath);

  const handleStandardEditorMount = useCallback(
    (editor: EditorRef) => {
      const domNode = editor.getDomNode?.();
      cmViewRef.current = domNode ? (EditorView.findFromDOM(domNode) ?? null) : null;
      standardEditorRef.current = editor;
      onEditorMount(editor);
    },
    [onEditorMount, cmViewRef, standardEditorRef]
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
    [onDiffMount, localDiffEditorRef]
  );

  const hasCollapsedHunks = !!activeFilePatchSummary?.hunks.some((h) => h.isCollapsed);

  if (!selectedFilePath) {
    return editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null;
  }

  if (hasActivePatch && filePatch) {
    return (
      <>
        <DiffToolbar
          diffSideBySide={diffSideBySide}
          lineNumbersEnabled={editorOptions.lineNumbersEnabled}
          wordWrapEnabled={editorOptions.wordWrapEnabled}
          agentAnnotationsEnabled={editorOptions.agentAnnotationsEnabled}
          hasCollapsedHunks={hasCollapsedHunks}
          activePatchRelativePath={activeFilePatch?.relativePath}
          onSetDiffLayout={props.onSetDiffLayout}
          onToggleLineNumbers={() => editorOptions.setLineNumbersEnabled((v) => !v)}
          onToggleWordWrap={() => editorOptions.setWordWrapEnabled((v) => !v)}
          onToggleAgentAnnotations={() => editorOptions.setAgentAnnotationsEnabled((v) => !v)}
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
                          { activateTool: false }
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
                )
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
              extensions={diffEditorExtensions}
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
    <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
      {stickyContextModel ? (
        <StickyContext data-testid="files-sticky-context" model={stickyContextModel} />
      ) : null}
      <Suspense fallback={null}>
        <CodeEditor
          value={fileContent ?? ''}
          language={editorLanguage}
          theme={resolvedTheme}
          locale={resolvedLocale}
          readOnly={previewEnabled || editorOptions.standardOptions.readOnly}
          lineNumbers={editorOptions.standardOptions.lineNumbers}
          wordWrap={editorOptions.standardOptions.wordWrap}
          fileKey={selectedFilePath}
          onChange={props.onEditorChange}
          onMount={handleStandardEditorMount}
          extensions={editorExtensions}
        />
      </Suspense>
    </div>
  );
});

export { EditorSurfaceShell };
export type { EditorSurfaceShellProps };
