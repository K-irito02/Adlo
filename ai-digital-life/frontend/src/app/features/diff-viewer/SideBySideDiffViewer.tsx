import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { MergeView, uncollapseUnchanged } from '@codemirror/merge';
import { forceParsing } from '@codemirror/language';
import { createFoldGutterExtension } from '../editor/cmFoldGutter';
import { FoldTooltipOverlay } from '../editor/FoldTooltipOverlay';
import { useFoldMarkerAutoHide } from '../editor/useFoldMarkerAutoHide';
import { createDiffEditorRef } from '../editor/editorAdapters';
import type { DiffEditorRef, EditorRef } from '@stores/types';
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
import { isHeavyDiffContent } from '../../regions/right-panel/heavyPreviewLimits';
import { setupDiffResizer } from './useDiffResizer';
import { useTCopy } from '@app/i18n/useTCopy';
import { cn } from '@/lib/utils';

export const SideBySideDiffViewer = memo(function SideBySideDiffViewer({
  original,
  modified,
  language,
  theme,
  locale: _locale,
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
  const { t } = useTCopy();
  // 重型差异降级（方案A）：任一侧超限即重型（与确认门同阈值），双 pane 双倍成本。
  const isHeavy = isHeavyDiffContent(original, modified);
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
    editorViewA || editorViewB,
    // 重型 plaintext 下 fold 标记永不出现，跳过 100ms×60 轮询风暴（方案A）。
    isHeavy,
  );
  const [langExtensions, setLangExtensions] = useState<Extension[]>(() =>
    isHeavy ? [] : getLanguageExtensionSync(language),
  );
  const [editorReady, setEditorReady] = useState(false);

  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;
  const onCollapsedRef = useRef(onCollapsedUnchangedRangesChange);
  onCollapsedRef.current = onCollapsedUnchangedRangesChange;

  // 先加载语言扩展，完成后才允许创建编辑器；重型直接 plaintext，不解析巨型文档。
  useEffect(() => {
    if (isHeavy) {
      setLangExtensions([]);
      setEditorReady(true);
      return;
    }
    let cancelled = false;
    getLanguageExtension(language)
      .then((exts) => {
        if (!cancelled) {
          setLangExtensions(exts);
          setEditorReady(true);
        }
      })
      .catch((_err) => {
        /* language load failed */
        setEditorReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language, isHeavy]);

  const cmPhrases = useMemo(
    () => ({
      unchangedLines: t.cmFoldNoChanges,
      restoreBlock: t.cmFoldRestore,
      accept: t.cmFoldAccept,
      reject: t.cmFoldReject,
    }),
    [t],
  );

  // 扩展配置 - 语言扩展直接包含在内；重型传空（plaintext，见上）。
  const sharedExts = useMemo(
    () =>
      buildSharedExtensions(
        language,
        theme,
        readOnly,
        lineNumbersEnabled,
        wordWrap,
        cmPhrases,
        isHeavy ? [] : langExtensions,
      ),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap, cmPhrases, isHeavy, langExtensions],
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
        }),
      );
    },
    [collapseUnchanged, onCollapsedUnchangedRangesChange],
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
      gutter: !isHeavy,
      highlightChanges: !isHeavy,
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

    const resizerCleanup = setupDiffResizer(mv);

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
          scrollHandlersRef.current.handleScrollA,
        );
        mergeViewRef.current.b.scrollDOM.removeEventListener(
          'scroll',
          scrollHandlersRef.current.handleScrollB,
        );
        scrollHandlersRef.current = null;
      }
      resizerCleanup();
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
    // isHeavy 经 sharedExts 间接覆盖，此处显式声明以满足 exhaustive-deps
    // （重型↔普通切换必须重建 MergeView，否则新旧选项混用）。
    isHeavy,
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
  // 重型跳过：plaintext 下无解析器，且整篇 forceParsing（2000ms 预算）本身即主线程块。
  useEffect(() => {
    if (!editorViewB || isHeavy) {
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
  }, [editorViewB, lineNumbersEnabled, isHeavy]);

  // 容器尺寸变化（窗口最大化/还原、面板拖拽）后重测量（方案A，同 inline 理由）。
  // rAF 节流：拖拽中 RO 高频触发，逐帧重测会把缩放拖成幻灯片。
  const measureRafRef = useRef(0);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (typeof requestAnimationFrame === 'undefined') {
        mergeViewRef.current?.a.requestMeasure();
        mergeViewRef.current?.b.requestMeasure();
        return;
      }
      cancelAnimationFrame(measureRafRef.current);
      measureRafRef.current = requestAnimationFrame(() => {
        mergeViewRef.current?.a.requestMeasure();
        mergeViewRef.current?.b.requestMeasure();
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(measureRafRef.current);
      }
    };
  }, [editorViewA, editorViewB]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'adl-cm-diff-viewer-wrapper',
        wordWrap ? 'adl-cm-word-wrap' : 'adl-cm-no-word-wrap',
        !lineNumbersEnabled && 'adl-cm-no-gutters',
      )}
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
