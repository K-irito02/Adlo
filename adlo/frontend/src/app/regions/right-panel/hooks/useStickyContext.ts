import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileOutlineItem } from '@adlo/kernel';
import { useTCopy } from '@i18n/useTCopy';
import type { EditorRef } from '@stores/types';
import type { PreviewDiffVisualRange } from '@features/diff-viewer';
import {
  buildStickyContextEntries,
  createStickyContextModel,
  getVisibleStartLine,
  navigateToLine,
  scrollEditorToTop,
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
  /**
   * 编辑器挂载版本：编辑器由 lazy 组件异步挂载，首个 effect 可能拿不到实例。
   * 每次 mount 自增一次，驱动 effect 重新挂滚动订阅。
   */
  editorMountVersion?: number;
}

function useStickyContext(input: UseStickyContextInput): StickyContextModel | null {
  const { t } = useTCopy();
  const [model, setModel] = useState<StickyContextModel | null>(null);
  const editorRefCache = useRef<(() => EditorRef | null) | null>(null);
  const scrollSeqRef = useRef(0);
  const revealSeqRef = useRef(0);

  const {
    selectedFilePath,
    content,
    outline,
    getStickySourceEditor,
    wordWrapEnabled,
    diffSideBySide,
    editorSurfaceRef,
    stickyDiffRanges,
    editorMountVersion,
  } = input;

  useEffect(() => {
    editorRefCache.current = getStickySourceEditor;
  }, [getStickySourceEditor]);

  const refresh = useCallback(
    (source: 'scroll' | 'layout') => {
      const getEditor = editorRefCache.current;
      scrollSeqRef.current += 1;
      if (source === 'scroll') {
        revealSeqRef.current += 1;
      }
      if (!selectedFilePath) {
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

      setModel(
        createStickyContextModel({
          modelId: `${contentKey}:${scrollSeqRef.current}`,
          canScrollToTop,
          revealSignal: revealSeqRef.current,
          onNavigateLine: (line) => navigateToLine(editorRefCache.current?.() ?? null, line),
          scrollToTop: () => scrollEditorToTop(editorRefCache.current?.() ?? null),
          topLabel: t.stickyContextTop as string,
        }),
      );
    },
    [selectedFilePath, content, outline, stickyDiffRanges, t],
  );

  useEffect(() => {
    const getEditor = () => editorRefCache.current?.() ?? null;

    refresh('layout');
    if (!selectedFilePath) {
      return;
    }
    const editor = getEditor();
    if (!editor) {
      return;
    }

    const disposables = [
      editor.onDidScrollChange?.(() => refresh('scroll')),
      editor.onDidChangeHiddenAreas?.(() => refresh('layout')),
      editor.onDidLayoutChange?.(() => refresh('layout')),
    ].filter(Boolean) as { dispose(): void }[];

    const shell = editorSurfaceRef.current;
    const observer =
      shell && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refresh('layout'))
        : null;
    if (observer && shell) {
      observer.observe(shell);
    }

    const handleResize = () => refresh('layout');
    window.addEventListener('resize', handleResize);
    return () => {
      disposables.forEach((d) => d.dispose());
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [
    refresh,
    selectedFilePath,
    wordWrapEnabled,
    diffSideBySide,
    editorSurfaceRef,
    editorMountVersion,
  ]);

  return model;
}

export { useStickyContext };
export type { UseStickyContextInput };
