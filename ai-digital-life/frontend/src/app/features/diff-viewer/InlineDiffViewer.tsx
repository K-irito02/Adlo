import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { unifiedMergeView, uncollapseUnchanged } from '@codemirror/merge';
import { createFoldGutterExtension } from '../editor/cmFoldGutter';
import { FoldTooltipOverlay } from '../editor/FoldTooltipOverlay';
import { useFoldMarkerAutoHide } from '../editor/useFoldMarkerAutoHide';
import { createEditorRef } from '../editor/editorAdapters';
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
import { buildCollapsedUnchangedRanges, getMergeChunks } from './diffViewerUtils';
import { isHeavyDiffContent } from '../../regions/right-panel/heavyPreviewLimits';
import { useTCopy } from '@app/i18n/useTCopy';
import { cn } from '@/lib/utils';

export const InlineDiffViewer = memo(function InlineDiffViewer({
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
  // 重型差异降级（方案A）：任一侧超限即重型（与确认门同阈值），挂载时关高开销选项。
  // 只读预览里 chunk 合并按钮（接受/拒绝）落不了盘，纯摆设，重型下一并关闭。
  const isHeavy = isHeavyDiffContent(original, modified);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [langExtensions, setLangExtensions] = useState<Extension[]>(() =>
    isHeavy ? [] : getLanguageExtensionSync(language),
  );
  const [editorReady, setEditorReady] = useState(false);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const foldMarkerState = useFoldMarkerAutoHide(
    wrapperRef,
    fileKey ?? original + modified,
    editorView,
    // 重型 plaintext 下 fold 标记永不出现，跳过 100ms×60 轮询风暴（方案A）。
    isHeavy,
  );

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
  const staticExtensions = useMemo<Extension[]>(() => {
    const base = buildSharedExtensions(
      language,
      theme,
      readOnly,
      lineNumbersEnabled,
      wordWrap,
      cmPhrases,
      isHeavy ? [] : langExtensions,
    );
    return [
      ...base,
      ...extraExtensions,
      EditorView.updateListener.of((update) => {
        if (!onCollapsedUnchangedRangesChange) {
          return;
        }
        const expandedLines = update.transactions
          .flatMap((transaction) => transaction.effects)
          .filter((effect) => effect.is(uncollapseUnchanged))
          .map((effect) => update.state.doc.lineAt(effect.value).number);
        if (expandedLines.length > 0) {
          expandedLines.forEach((line) => expandedCollapsedLinesRef.current.add(line));
        }
        if (!collapseUnchanged) {
          onCollapsedUnchangedRangesChange([]);
          return;
        }
        if (expandedLines.length > 0 || update.docChanged) {
          onCollapsedUnchangedRangesChange(
            buildCollapsedUnchangedRanges({
              chunks: getMergeChunks(update.state),
              doc: update.state.doc,
              expandedLines: expandedCollapsedLinesRef.current,
            }),
          );
        }
      }),
      unifiedMergeView({
        original,
        highlightChanges: !isHeavy,
        gutter: !isHeavy,
        mergeControls: isHeavy && readOnly ? false : true,
        syntaxHighlightDeletions: !isHeavy,
        collapseUnchanged: collapseUnchanged ? COLLAPSE_UNCHANGED_CONFIG : undefined,
      }),
    ];
  }, [
    language,
    theme,
    readOnly,
    lineNumbersEnabled,
    wordWrap,
    cmPhrases,
    isHeavy,
    langExtensions,
    original,
    collapseUnchanged,
    extraExtensions,
    onCollapsedUnchangedRangesChange,
  ]);

  // 只有在语言加载完成后才创建编辑器
  useEffect(() => {
    if (!editorReady || !containerRef.current) {
      return;
    }

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    containerRef.current.innerHTML = '';
    expandedCollapsedLinesRef.current = new Set();

    const state = EditorState.create({
      doc: modified,
      extensions: staticExtensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setEditorView(view);

    if (onCollapsedRef.current) {
      onCollapsedRef.current(
        collapseUnchanged
          ? buildCollapsedUnchangedRanges({
              chunks: getMergeChunks(view.state),
              doc: view.state.doc,
            })
          : [],
      );
    }

    if (onMountRef.current) {
      onMountRef.current(createEditorRef(view));
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      setEditorView(null);
      onCollapsedRef.current?.([]);
    };
  }, [editorReady, language, original, modified, staticExtensions, collapseUnchanged, isHeavy]);

  useEffect(() => {
    const view = viewRef.current;
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
    view.requestMeasure();
  }, [lineNumbersEnabled, wordWrap]);

  // 容器尺寸变化（窗口最大化/还原、面板拖拽）后重测量（方案A）：
  // 此前只在挂载与行号/换行切换时 requestMeasure，陈旧尺寸导致
  // "最大化仍按小尺寸渲染 / 还原被裁剪"，数秒后才被附带事务纠正。
  // rAF 节流：拖拽中 RO 高频触发，逐帧重测会把缩放拖成幻灯片。
  const measureRafRef = useRef(0);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (typeof requestAnimationFrame === 'undefined') {
        viewRef.current?.requestMeasure();
        return;
      }
      cancelAnimationFrame(measureRafRef.current);
      measureRafRef.current = requestAnimationFrame(() => {
        viewRef.current?.requestMeasure();
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(measureRafRef.current);
      }
    };
  }, [editorView]);

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
        className="adl-cm-diff-viewer adl-cm-diff-viewer--inline"
        data-dl-lang={language}
        data-dl-exts={langExtensions.length}
      />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
});
