import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileOutlineItem } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../../i18n';
import type { EditorRef } from '../../../stores/types';
import type { PreviewDiffVisualRange } from '../../../features/diff-viewer';
import {
  buildStickyContextEntries,
  createStickyContextModel,
  getVisibleStartLine,
  navigateToLine,
  type StickyContextModel,
} from '../editor-support/stickyContext';

interface UseStickyContextInput {
  selectedFilePath: string | undefined;
  content: string;
  outline: FileOutlineItem[];
  getStickySourceEditor: () => EditorRef | null;
  wordWrapEnabled: boolean;
  diffSideBySide: boolean;
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  stickyDiffRanges: PreviewDiffVisualRange[] | undefined;
  t: CopyDict;
}

function useStickyContext(input: UseStickyContextInput): StickyContextModel | null {
  const [model, setModel] = useState<StickyContextModel | null>(null);
  const contentKeyRef = useRef('');
  const editorRefCache = useRef<(() => EditorRef | null) | null>(null);
  const scrollSeqRef = useRef(0);

  useEffect(() => {
    editorRefCache.current = input.getStickySourceEditor;
  }, [input.getStickySourceEditor]);

  const refresh = useCallback(() => {
    const getEditor = editorRefCache.current;
    scrollSeqRef.current += 1;
    if (!input.selectedFilePath) {
      contentKeyRef.current = '';
      setModel(null);
      return;
    }

    const editor = getEditor?.() ?? null;
    const visibleStartLine =
      getVisibleStartLine(editor) ?? editor?.getSelection?.()?.startLineNumber ?? 1;
    const scrollTop = editor?.getScrollTop() ?? 0;
    const canScrollToTop = scrollTop > 0;

    const entries = buildStickyContextEntries({
      content: input.content,
      outline: input.outline,
      visibleStartLine,
      maxContextRows: 3,
      diffRanges: input.stickyDiffRanges,
    });

    const contentKey = `${input.selectedFilePath}:${visibleStartLine}:${entries
      .map((e) => `${e.line}:${e.kind}:${e.tone}`)
      .join('|')}:${canScrollToTop}`;

    contentKeyRef.current = contentKey;

    setModel(
      createStickyContextModel({
        modelId: `${contentKey}:${scrollSeqRef.current}`,
        canScrollToTop,
        onNavigateLine: (line) => navigateToLine(input.getStickySourceEditor(), line),
        topLabel: input.t.stickyContextTop as string,
      })
    );
  }, [input]);

  useEffect(() => {
    const getEditor = () => editorRefCache.current?.() ?? null;

    refresh();
    if (!input.selectedFilePath) return;
    const editor = getEditor();
    if (!editor) {
      return;
    }

    const disposables = [
      editor.onDidScrollChange?.(refresh),
      editor.onDidChangeHiddenAreas?.(refresh),
      editor.onDidLayoutChange?.(refresh),
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const shell = input.editorSurfaceRef.current;
    const observer =
      shell && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null;
    if (observer && shell) {
      observer.observe(shell);
    }

    window.addEventListener('resize', refresh);
    return () => {
      disposables.forEach((d) => d.dispose());
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
    };
  }, [
    refresh,
    input.selectedFilePath,
    input.wordWrapEnabled,
    input.diffSideBySide,
    input.editorSurfaceRef,
  ]);

  return model;
}

export { useStickyContext };
export type { UseStickyContextInput };
