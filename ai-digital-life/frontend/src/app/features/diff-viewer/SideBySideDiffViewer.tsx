import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { MergeView, uncollapseUnchanged } from '@codemirror/merge';
import { forceParsing } from '@codemirror/language';
import { createFoldGutterExtension } from '../editor/cmFoldGutter';
import { FoldTooltipOverlay } from '../editor/FoldTooltipOverlay';
import { useFoldMarkerAutoHide } from '../editor/useFoldMarkerAutoHide';
import { createDiffEditorRef } from '../editor/editorAdapters';
import type { DiffEditorRef, EditorRef } from '../../stores/types';
import type { PreviewDiffCollapsedRange } from './changePreviewDiffRanges';
import { getLanguageExtension, getLanguageExtensionSync } from '../editor/cmLanguages';
import {
  buildSharedExtensions,
  lineNumbersCompartment,
  wordWrapCompartment,
  foldGutterCompartment,
  COLLAPSE_UNCHANGED_CONFIG,
} from './sharedExtensions';
import {
  syncHorizontalScroll,
  buildCollapsedUnchangedRanges,
  syncScrollPosition,
  getMergeChunks,
} from './diffViewerUtils';

export const SideBySideDiffViewer = memo(function SideBySideDiffViewer({
  original,
  modified,
  language,
  theme,
  locale,
  readOnly,
  lineNumbersEnabled,
  wordWrap,
  fileKey,
  collapseUnchanged,
  onMount,
  extraExtensions,
  onCollapsedUnchangedRangesChange,
}: {
  original: string;
  modified: string;
  language: string;
  theme: 'light' | 'dark';
  locale: string;
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  fileKey?: string;
  collapseUnchanged: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const mergeViewARef = useRef<EditorView | null>(null);
  const mergeViewBRef = useRef<EditorView | null>(null);
  const [editorViewA, setEditorViewA] = useState<EditorView | null>(null);
  const [editorViewB, setEditorViewB] = useState<EditorView | null>(null);
  const scrollHandlersRef = useRef<{
    handleScrollA: () => void;
    handleScrollB: () => void;
  } | null>(null);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const foldMarkerState = useFoldMarkerAutoHide(
    wrapperRef,
    fileKey ?? original + modified,
    editorViewA || editorViewB
  );
  const [langExtensions, setLangExtensions] = useState<Extension[]>(() =>
    getLanguageExtensionSync(language)
  );
  const [editorReady, setEditorReady] = useState(false);

  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;
  const onCollapsedRef = useRef(onCollapsedUnchangedRangesChange);
  onCollapsedRef.current = onCollapsedUnchangedRangesChange;

  // 先加载语言扩展，完成后才允许创建编辑器
  useEffect(() => {
    let cancelled = false;
    getLanguageExtension(language)
      .then((exts) => {
        if (!cancelled) {
          setLangExtensions(exts);
          setEditorReady(true);
        }
      })
      .catch((err) => {
        console.error(`[DiffViewer] failed to load language "${language}":`, err);
        setEditorReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // 扩展配置 - 语言扩展直接包含在内
  const sharedExts = useMemo(
    () =>
      buildSharedExtensions(
        language,
        theme,
        readOnly,
        lineNumbersEnabled,
        wordWrap,
        locale,
        langExtensions
      ),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale, langExtensions]
  );

  const emitCollapsedUnchangedRanges = useCallback(
    (view: EditorView) => {
      if (!onCollapsedUnchangedRangesChange) {
        return;
      }
      if (!collapseUnchanged) {
        onCollapsedUnchangedRangesChange([]);
        return;
      }
      onCollapsedUnchangedRangesChange(
        buildCollapsedUnchangedRanges({
          chunks: getMergeChunks(view.state),
          doc: view.state.doc,
          expandedLines: expandedCollapsedLinesRef.current,
        })
      );
    },
    [collapseUnchanged, onCollapsedUnchangedRangesChange]
  );

  // 只有在语言加载完成后才创建编辑器
  useEffect(() => {
    if (!editorReady || !containerRef.current) {
      return;
    }

    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }

    let syncing = false;
    expandedCollapsedLinesRef.current = new Set();

    const aExts: Extension[] = [...sharedExts];
    const bExts: Extension[] = [
      ...sharedExts,
      ...extraExtensions,
      EditorView.updateListener.of((update) => {
        const expandedLines = update.transactions
          .flatMap((transaction) => transaction.effects)
          .filter((effect) => effect.is(uncollapseUnchanged))
          .map((effect) => update.state.doc.lineAt(effect.value).number);
        if (expandedLines.length > 0) {
          expandedLines.forEach((line) => expandedCollapsedLinesRef.current.add(line));
        }
        if (expandedLines.length > 0 || update.docChanged) {
          emitCollapsedUnchangedRanges(update.view);
        }
      }),
    ];

    const mv = new MergeView({
      a: { doc: original, extensions: aExts },
      b: { doc: modified, extensions: bExts },
      parent: containerRef.current,
      collapseUnchanged: collapseUnchanged ? COLLAPSE_UNCHANGED_CONFIG : undefined,
      gutter: true,
      highlightChanges: true,
    });

    const handleScrollA = () => {
      if (syncing) {
        return;
      }
      syncing = true;
      if (mv.b) {
        syncScrollPosition(mv.a.scrollDOM, mv.b.scrollDOM);
        syncHorizontalScroll(mv.a.scrollDOM, mv.b.scrollDOM);
      }
      syncing = false;
    };
    const handleScrollB = () => {
      if (syncing) {
        return;
      }
      syncing = true;
      if (mv.a) {
        syncScrollPosition(mv.b.scrollDOM, mv.a.scrollDOM);
        syncHorizontalScroll(mv.b.scrollDOM, mv.a.scrollDOM);
      }
      syncing = false;
    };
    scrollHandlersRef.current = { handleScrollA, handleScrollB };

    mv.a.scrollDOM.addEventListener('scroll', handleScrollA, { passive: true });
    mv.b.scrollDOM.addEventListener('scroll', handleScrollB, { passive: true });

    const editorsContainer = mv.dom.querySelector<HTMLElement>('.cm-mergeViewEditors');
    const resizerEl = document.createElement('div');
    let resizerCleanup: (() => void) | null = null;
    const wrapperB = mv.b.dom?.parentNode as HTMLElement | null;
    if (editorsContainer && wrapperB && editorsContainer.contains(wrapperB)) {
      const wrapperA = mv.a.dom.parentNode as HTMLElement;
      resizerEl.className = 'adl-cm-diff-resizer';
      editorsContainer.insertBefore(resizerEl, wrapperB);

      const SAVED_RATIO_KEY = 'adl-diff-resizer-ratio';
      const MIN_WIDTH = 200;
      const resizerWidth = 6;
      let ratio = parseFloat(localStorage.getItem(SAVED_RATIO_KEY) ?? '0.5');
      if (Number.isNaN(ratio) || ratio <= 0 || ratio >= 1) {
        ratio = 0.5;
      }

      const applyRatio = (totalWidth: number) => {
        const avail = totalWidth - resizerWidth;
        const widthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, avail * ratio));
        wrapperA.style.flex = 'none';
        wrapperA.style.width = `${widthA}px`;
        wrapperB.style.flex = '1 1 0';
        wrapperB.style.width = 'auto';
      };

      const applyCurrentRatio = () => {
        applyRatio(editorsContainer.offsetWidth);
      };

      applyCurrentRatio();

      const startResize = (clientX: number) => {
        const startX = clientX;
        const startWidthA = wrapperA.offsetWidth;
        const totalWidth = editorsContainer.offsetWidth;

        resizerEl.classList.add('adl-cm-diff-resizer--dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (currentX: number) => {
          const deltaX = currentX - startX;
          const avail = totalWidth - resizerWidth;
          const newWidthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, startWidthA + deltaX));
          ratio = newWidthA / avail;
          localStorage.setItem(SAVED_RATIO_KEY, ratio.toString());
          wrapperA.style.flex = 'none';
          wrapperA.style.width = `${newWidthA}px`;
          wrapperB.style.flex = '1 1 0';
          wrapperB.style.width = 'auto';
        };

        const onEnd = () => {
          resizerEl.classList.remove('adl-cm-diff-resizer--dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
        };

        const onMouseMove = (moveEvent: MouseEvent) => {
          onMove(moveEvent.clientX);
        };
        const onMouseUp = () => onEnd();

        const onTouchMove = (touchEvent: TouchEvent) => {
          onMove(touchEvent.touches[0].clientX);
        };
        const onTouchEnd = () => onEnd();

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
      };

      const onResizerMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        startResize(e.clientX);
      };

      const onResizerTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        startResize(e.touches[0].clientX);
      };

      resizerEl.addEventListener('mousedown', onResizerMouseDown);
      resizerEl.addEventListener('touchstart', onResizerTouchStart, { passive: false });

      const resizeObserver = new ResizeObserver(applyCurrentRatio);
      resizeObserver.observe(editorsContainer);

      resizerCleanup = () => {
        resizerEl.removeEventListener('mousedown', onResizerMouseDown);
        resizerEl.removeEventListener('touchstart', onResizerTouchStart);
        resizeObserver.disconnect();
      };
    }

    mergeViewRef.current = mv;
    mergeViewARef.current = mv.a;
    mergeViewBRef.current = mv.b;
    setEditorViewA(mv.a);
    setEditorViewB(mv.b);
    emitCollapsedUnchangedRanges(mv.b);

    if (onMountRef.current) {
      onMountRef.current(createDiffEditorRef(mv));
    }

    return () => {
      if (mergeViewRef.current && scrollHandlersRef.current) {
        mergeViewRef.current.a.scrollDOM.removeEventListener(
          'scroll',
          scrollHandlersRef.current.handleScrollA
        );
        mergeViewRef.current.b.scrollDOM.removeEventListener(
          'scroll',
          scrollHandlersRef.current.handleScrollB
        );
        scrollHandlersRef.current = null;
      }
      if (resizerCleanup) {
        resizerCleanup();
        resizerCleanup = null;
      }
      if (mergeViewRef.current) {
        mergeViewRef.current.destroy();
        mergeViewRef.current = null;
      }
      mergeViewARef.current = null;
      mergeViewBRef.current = null;
      setEditorViewA(null);
      setEditorViewB(null);
      onCollapsedRef.current?.([]);
    };
  }, [
    editorReady,
    language,
    original,
    modified,
    sharedExts,
    extraExtensions,
    collapseUnchanged,
    emitCollapsedUnchangedRanges,
  ]);

  useEffect(() => {
    const mv = mergeViewRef.current;
    if (!mv) {
      return;
    }
    const reconfigure = (view: EditorView | null) => {
      if (!view) {
        return;
      }
      view.dispatch({
        effects: [
          lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : []),
          foldGutterCompartment.reconfigure(lineNumbersEnabled ? createFoldGutterExtension() : []),
          wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        ],
      });
    };
    reconfigure(mv.a);
    reconfigure(mv.b);
    mv.a.requestMeasure();
    mv.b.requestMeasure();
  }, [lineNumbersEnabled, wordWrap]);

  // Also force-parse syntax tree and reconfigure fold gutter for the right panel (view B).
  // (view A is handled by useFoldMarkerAutoHide's internal poll loop.)
  useEffect(() => {
    if (!editorViewB) {
      return;
    }
    let cancelled = false;
    const duration = editorViewB.state.doc.length;
    Promise.resolve(forceParsing(editorViewB, duration, 2000)).then(() => {
      if (cancelled) {
        return;
      }
      editorViewB.dispatch({
        effects: [
          foldGutterCompartment.reconfigure(lineNumbersEnabled ? createFoldGutterExtension() : []),
        ],
      });
      editorViewB.requestMeasure();
    });
    return () => {
      cancelled = true;
    };
  }, [editorViewB, lineNumbersEnabled]);

  return (
    <div
      ref={wrapperRef}
      className={`adl-cm-diff-viewer-wrapper${wordWrap ? ' adl-cm-word-wrap' : ' adl-cm-no-word-wrap'}`}
      data-fold-marker-state={foldMarkerState}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div
        ref={containerRef}
        className="adl-cm-diff-viewer adl-cm-diff-viewer--side-by-side"
        data-dl-lang={language}
        data-dl-exts={langExtensions.length}
      />
      <FoldTooltipOverlay view={editorViewA} />
      <FoldTooltipOverlay view={editorViewB} />
    </div>
  );
});
