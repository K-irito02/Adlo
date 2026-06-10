import React, { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { ChangesPanelProps } from '../types';
import type { DiffEditorRef, EditorRef } from '../../../stores/types';

import { detectEditorLanguage } from '../../../utils/workspacePaths';
import { categorizeFile } from '../fileTypeRouter';
import { computePreviewDiffVisualRanges } from '../../../features/diff-viewer';
import type { PreviewDiffCollapsedRange } from '../../../features/diff-viewer';
import { LazyMarkdownPreviewWrapper } from '../../../features/preview';
import { StickyContext } from '../editor-support/stickyContextView';
import { useStickyContext } from '../hooks';
import { buildOutlineFromContent } from '../../../features/outline';
import { ChangesEmptyState } from './ChangesEmptyState';

const CodeEditor = lazy(() =>
  import('../../../features/editor').then((m) => ({ default: m.CodeEditor }))
);
const DiffViewer = lazy(() =>
  import('../../../features/diff-viewer').then((m) => ({ default: m.DiffViewer }))
);

interface DiffEditorSectionProps extends Pick<
  ChangesPanelProps,
  | 't'
  | 'changePreview'
  | 'changePreviewLoading'
  | 'diffSideBySide'
  | 'latestPatchApplication'
  | 'appInfo'
  | 'onDiffMount'
> {
  totalChangeCount: number;
  visibleWorkspacesLength: number;
  previewEnabled: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  previewContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const DiffEditorSection = React.memo(function DiffEditorSection({
  t,
  changePreview,
  changePreviewLoading,
  diffSideBySide,
  latestPatchApplication,
  appInfo,
  totalChangeCount,
  visibleWorkspacesLength,
  previewEnabled,
  lineNumbersEnabled,
  wordWrapEnabled,
  onDiffMount,
  previewContainerRef,
}: DiffEditorSectionProps) {
  const localPreviewShellRef = useRef<HTMLDivElement | null>(null);
  const localEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const setPreviewShellRef = useCallback(
    (el: HTMLDivElement | null) => {
      localPreviewShellRef.current = el;
      if (previewContainerRef) {
        (previewContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    },
    [previewContainerRef]
  );
  const [_collapsedUnchangedDiffRanges, setCollapsedUnchangedDiffRanges] = useState<
    PreviewDiffCollapsedRange[]
  >([]);

  const validation = latestPatchApplication?.validation;
  const changePreviewContent = changePreview?.currentContent ?? '';

  const changePreviewLanguage = useMemo(() => {
    return detectEditorLanguage(changePreview?.path);
  }, [changePreview?.path]);

  const changePreviewTheme =
    appInfo?.config.resolvedTheme === 'dark' ? ('dark' as const) : ('light' as const);
  const changePreviewLocale = appInfo?.config.language ?? 'zh-CN';

  const changePreviewDiffRanges = useMemo(
    () =>
      changePreview
        ? computePreviewDiffVisualRanges(changePreview.baseContent, changePreview.currentContent)
        : [],
    [changePreview]
  );

  const outline = useMemo(
    () =>
      changePreview
        ? buildOutlineFromContent(changePreview.currentContent, changePreview.path)
        : [],
    [changePreview]
  );

  const getStickySourceEditor = useCallback(() => {
    const ref = localEditorRef.current;
    if (!ref) return null;
    if ('getModifiedEditor' in ref) {
      return (ref as DiffEditorRef).getModifiedEditor();
    }
    return ref as EditorRef;
  }, []);

  const handleEditorMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      localEditorRef.current = editor;
      onDiffMount(editor);
    },
    [onDiffMount]
  );

  const stickyContextInput = useMemo(
    () => ({
      selectedFilePath: changePreview?.path,
      content: changePreviewContent,
      outline,
      wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef: localPreviewShellRef,
      stickyDiffRanges: changePreviewDiffRanges,
      getStickySourceEditor,
      t,
    }),
    [
      changePreview?.path,
      changePreviewContent,
      outline,
      wordWrapEnabled,
      diffSideBySide,
      localPreviewShellRef,
      changePreviewDiffRanges,
      getStickySourceEditor,
      t,
    ]
  );

  const stickyContextModel = useStickyContext(stickyContextInput);
  const diffExtensions = useMemo(() => [], []);

  if (!changePreview) {
    if (changePreviewLoading) return null;
    if (totalChangeCount === 0) {
      return <ChangesEmptyState hasWorkspaces={visibleWorkspacesLength > 0} />;
    }
    return null;
  }

  return (
    <>
      {validation ? (
        <div className="adl-banner adl-banner--info">
          <strong>{validation.status}</strong>
          <span>{validation.summary}</span>
          {latestPatchApplication?.rolledBack ? (
            <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span>
          ) : null}
          {latestPatchApplication?.patchSet.status === 'applied' ? (
            <span className="adl-chip adl-chip--success">{t.changesApplied}</span>
          ) : null}
        </div>
      ) : null}
      <div
        ref={setPreviewShellRef}
        className="adl-tool-editor adl-tool-editor--changes"
        data-testid="changes-preview-shell"
      >
        {previewEnabled && categorizeFile(changePreview.path) === 'markdown' ? (
          <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
            <LazyMarkdownPreviewWrapper
              content={changePreview.currentContent}
              theme={changePreviewTheme}
            />
          </div>
        ) : previewEnabled ? (
          <div className="adl-tool-editor__surface">
            <Suspense fallback={null}>
              <CodeEditor
                value={changePreview.currentContent}
                language={changePreviewLanguage}
                theme={changePreviewTheme}
                locale={changePreviewLocale}
                readOnly={true}
                lineNumbers={lineNumbersEnabled}
                wordWrap={wordWrapEnabled}
                onMount={handleEditorMount}
              />
            </Suspense>
          </div>
        ) : (
          <div className="adl-tool-editor__surface">
            {stickyContextModel ? (
              <StickyContext
                data-testid="changes-sticky-context"
                model={stickyContextModel}
                t={t}
              />
            ) : null}
            <Suspense fallback={null}>
              <DiffViewer
                original={changePreview.baseContent}
                modified={changePreview.currentContent}
                language={changePreviewLanguage}
                theme={changePreviewTheme}
                locale={changePreviewLocale}
                sideBySide={diffSideBySide}
                collapseUnchanged={true}
                readOnly={true}
                lineNumbers={lineNumbersEnabled}
                wordWrap={wordWrapEnabled}
                onMount={handleEditorMount}
                extensions={diffExtensions}
                onCollapsedUnchangedRangesChange={setCollapsedUnchangedDiffRanges}
              />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
});

export { DiffEditorSection };
