import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileOutlineItem } from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';
import type { EditorRef } from '@stores/types';
import type { PreviewDiffVisualRange } from '@features/diff-viewer';
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
}

function useStickyContext(input: UseStickyContextInput): StickyContextModel | null {
  const { t } = useTCopy();
  const [model, setModel] = useState<StickyContextModel | null>(null);
  const contentKeyRef = useRef('');
  const editorRefCache = useRef<(() => EditorRef | null) | null>(null);
  const scrollSeqRef = useRef(0);

  const {
    selectedFilePath,
    content,
    outline,
    getStickySourceEditor,
    wordWrapEnabled,
    diffSideBySide,
    editorSurfaceRef,
    stickyDiffRanges,
  } = input;

  useEffect(() => {
    editorRefCache.current = getStickySourceEditor;
  }, [getStickySourceEditor]);

  const refresh = useCallback(() => {
    const getEditor = editorRefCache.current;
    scrollSeqRef.current += 1;
    if (!selectedFilePath) {
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
      content,
      outline,
      visibleStartLine,
      maxContextRows: 3,
      diffRanges: stickyDiffRanges,
    });

    const contentKey = `${selectedFilePath}:${visibleStartLine}:${entries
      .map((e) => `${e.line}:${e.kind}:${e.tone}`)
      .join('|')}:${canScrollToTop}`;

    contentKeyRef.current = contentKey;

    setModel(
      createStickyContextModel({
        modelId: `${contentKey}:${scrollSeqRef.current}`,
        canScrollToTop,
        onNavigateLine: (line) => navigateToLine(editorRefCache.current?.() ?? null, line),
        topLabel: t.stickyContextTop as string,
      })
    );
  }, [selectedFilePath, content, outline, stickyDiffRanges, t]);

  useEffect(() => {
    const getEditor = () => editorRefCache.current?.() ?? null;

    refresh();
    if (!selectedFilePath) {
      return;
    }
    const editor = getEditor();
    if (!editor) {
      return;
    }

    const disposables = [
      editor.onDidScrollChange?.(refresh),
      editor.onDidChangeHiddenAreas?.(refresh),
      editor.onDidLayoutChange?.(refresh),
    ].filter(Boolean) as Array<{ dispose(): void }>;

    const shell = editorSurfaceRef.current;
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
  }, [refresh, selectedFilePath, wordWrapEnabled, diffSideBySide, editorSurfaceRef]);

  return model;
}

export { useStickyContext };
export type { UseStickyContextInput };
