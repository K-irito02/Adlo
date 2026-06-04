import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { unifiedMergeView, uncollapseUnchanged } from '@codemirror/merge';
import { createFoldGutterExtension } from '../editor/cmFoldGutter';
import { rebuildThemes } from '../editor/cmTheme';
import { FoldTooltipOverlay } from '../editor/FoldTooltipOverlay';
import { useFoldMarkerAutoHide } from '../editor/useFoldMarkerAutoHide';
import { createEditorRef } from '../editor/editorAdapters';
import type { DiffEditorRef, EditorRef } from '../../stores/types';
import type { PreviewDiffCollapsedRange } from './changePreviewDiffRanges';
import { getLanguageExtension } from '../editor/cmLanguages';
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
  const [langExtensions, setLangExtensions] = useState<Extension[]>([]);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const foldMarkerState = useFoldMarkerAutoHide(wrapperRef, fileKey ?? original + modified);

  useEffect(() => {
    let cancelled = false;
    getLanguageExtension(language).then((exts) => {
      if (!cancelled) setLangExtensions(exts);
    }).catch((err) => {
      console.error(`[DiffViewer] failed to load language "${language}":`, err);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const extensions = useMemo<Extension[]>(() => {
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
        if (!onCollapsedUnchangedRangesChange) return;
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
    original,
    collapseUnchanged,
    extraExtensions,
    langExtensions,
    onCollapsedUnchangedRangesChange,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    containerRef.current.innerHTML = '';
    expandedCollapsedLinesRef.current = new Set();

    const state = EditorState.create({
      doc: modified,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setEditorView(view);
    if (onCollapsedUnchangedRangesChange) {
      onCollapsedUnchangedRangesChange(
        collapseUnchanged
          ? buildCollapsedUnchangedRanges({
              chunks: getMergeChunks(view.state),
              doc: view.state.doc,
            })
          : []
      );
    }

    if (onMount) {
      onMount(createEditorRef(view));
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      setEditorView(null);
      onCollapsedUnchangedRangesChange?.([]);
    };
  }, [
    original,
    modified,
    extensions,
    collapseUnchanged,
    onCollapsedUnchangedRangesChange,
    onMount,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : []),
        foldGutterCompartment.reconfigure(lineNumbersEnabled ? createFoldGutterExtension() : []),
        wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      ],
    });
    view.requestMeasure();
  }, [lineNumbersEnabled, wordWrap]);

  useEffect(() => {
    rebuildThemes();
  }, [theme]);

  return (
    <div
      ref={wrapperRef}
      className={`adl-cm-diff-viewer-wrapper${wordWrap ? ' adl-cm-word-wrap' : ' adl-cm-no-word-wrap'}`}
      data-fold-marker-state={foldMarkerState}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div ref={containerRef} className="adl-cm-diff-viewer adl-cm-diff-viewer--inline" />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
});
