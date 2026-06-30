import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
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

export const InlineDiffViewer = memo(function InlineDiffViewer({
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
  const viewRef = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [langExtensions, setLangExtensions] = useState<Extension[]>(() =>
    getLanguageExtensionSync(language)
  );
  const [editorReady, setEditorReady] = useState(false);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const foldMarkerState = useFoldMarkerAutoHide(
    wrapperRef,
    fileKey ?? original + modified,
    editorView
  );

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
      .catch((_err) => {
        /* language load failed */
        setEditorReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // 扩展配置 - 语言扩展直接包含在内
  const staticExtensions = useMemo<Extension[]>(() => {
    const base = buildSharedExtensions(
      language,
      theme,
      readOnly,
      lineNumbersEnabled,
      wordWrap,
      locale,
      langExtensions
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
            })
          );
        }
      }),
      unifiedMergeView({
        original,
        highlightChanges: true,
        gutter: true,
        mergeControls: true,
        collapseUnchanged: collapseUnchanged ? COLLAPSE_UNCHANGED_CONFIG : undefined,
      }),
    ];
  }, [
    language,
    theme,
    readOnly,
    lineNumbersEnabled,
    wordWrap,
    locale,
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
          : []
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
  }, [editorReady, language, original, modified, staticExtensions, collapseUnchanged]);

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

  return (
    <div
      ref={wrapperRef}
      className={`adl-cm-diff-viewer-wrapper${wordWrap ? ' adl-cm-word-wrap' : ' adl-cm-no-word-wrap'}`}
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
