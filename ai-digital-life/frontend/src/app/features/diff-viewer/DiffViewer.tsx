import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MergeView, getChunks, uncollapseUnchanged, unifiedMergeView } from "@codemirror/merge";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { DiffEditorRef, EditorRef } from "../../types";
import { createDiffEditorRef, createEditorRef } from "../editor/editorAdapters";
import { getThemeExtension, rebuildThemes, getPhrasesExtension } from "../editor/cmTheme";
import { getLanguageExtension } from "../editor/cmLanguages";
import { createFoldGutterExtension } from "../editor/cmFoldGutter";
import { FoldTooltipOverlay } from "../editor/FoldTooltipOverlay";
import { scrollLeftSyncExtension } from "../editor/cmScrollLeftSync";
import { initScrollbarWidth } from "./scrollbarWidth";
import { useFoldMarkerAutoHide } from "../editor/useFoldMarkerAutoHide";
import type { PreviewDiffCollapsedRange } from "./changePreviewDiffRanges";

initScrollbarWidth();

export type DiffViewerProps = {
  original: string;
  modified: string;
  language?: string;
  theme?: "light" | "dark";
  locale?: string;
  sideBySide?: boolean;
  collapseUnchanged?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  fileKey?: string;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extensions?: Extension[];
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
};

const themeCompartment = new Compartment();
const langCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const foldGutterCompartment = new Compartment();

export type ScrollSyncMetrics = {
  sourceScrollTop: number;
  sourceScrollHeight: number;
  sourceClientHeight: number;
  targetScrollHeight: number;
  targetClientHeight: number;
};

const COLLAPSE_UNCHANGED_CONFIG = { margin: 3, minSize: 4 } as const;
type MergeChunksResult = Exclude<ReturnType<typeof getChunks>, null>;
type MergeChunk = MergeChunksResult["chunks"][number];

function getMergeChunks(state: EditorState): readonly MergeChunk[] {
  return getChunks(state)?.chunks ?? [];
}

export function computeSyncedScrollTop(input: ScrollSyncMetrics): number {
  const sourceMax = Math.max(0, input.sourceScrollHeight - input.sourceClientHeight);
  if (sourceMax <= 0) return 0;
  const targetMax = Math.max(0, input.targetScrollHeight - input.targetClientHeight);
  const ratio = Math.max(0, Math.min(input.sourceScrollTop, sourceMax)) / sourceMax;
  return ratio * targetMax;
}

export function syncHorizontalScroll(source: HTMLElement, target: HTMLElement): void {
  const sourceMax = Math.max(0, source.scrollWidth - source.clientWidth);
  if (sourceMax <= 0) {
    target.scrollLeft = 0;
    return;
  }
  const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
  if (targetMax <= 0) return;
  const ratio = Math.max(0, Math.min(source.scrollLeft, sourceMax)) / sourceMax;
  target.scrollLeft = ratio * targetMax;
}

export function buildCollapsedUnchangedRanges(input: {
  chunks: readonly MergeChunk[];
  doc: EditorState["doc"];
  margin?: number;
  minSize?: number;
  expandedLines?: ReadonlySet<number>;
}): PreviewDiffCollapsedRange[] {
  const margin = input.margin ?? COLLAPSE_UNCHANGED_CONFIG.margin;
  const minSize = input.minSize ?? COLLAPSE_UNCHANGED_CONFIG.minSize;
  const expandedLines = input.expandedLines ?? new Set<number>();
  const ranges: PreviewDiffCollapsedRange[] = [];
  let prevLine = 1;

  for (let index = 0; ; index += 1) {
    const chunk = index < input.chunks.length ? input.chunks[index] : null;
    const collapseFrom = index > 0 ? prevLine + margin : 1;
    const collapseTo = chunk
      ? input.doc.lineAt(chunk.fromB).number - 1 - margin
      : input.doc.lines;
    const lineCount = collapseTo - collapseFrom + 1;
    if (
      lineCount >= minSize &&
      ![...expandedLines].some((line) => line >= collapseFrom && line <= collapseTo)
    ) {
      ranges.push({ startLine: collapseFrom, endLine: collapseTo });
    }
    if (!chunk) break;
    prevLine = input.doc.lineAt(Math.min(input.doc.length, chunk.toB)).number;
  }

  return ranges;
}

function syncScrollPosition(source: HTMLElement, target: HTMLElement) {
  const nextScrollTop = computeSyncedScrollTop({
    sourceScrollTop: source.scrollTop,
    sourceScrollHeight: source.scrollHeight,
    sourceClientHeight: source.clientHeight,
    targetScrollHeight: target.scrollHeight,
    targetClientHeight: target.clientHeight,
  });
  if (Math.abs(target.scrollTop - nextScrollTop) > 0.5) {
    target.scrollTop = nextScrollTop;
  }
}

function buildSharedExtensions(
  language: string,
  theme: "light" | "dark",
  readOnly: boolean,
  lineNumbersEnabled: boolean,
  wordWrap: boolean,
  locale: string,
): Extension[] {
  const gutterEnabled = lineNumbersEnabled;
  const exts: Extension[] = [
    history(),
    lineNumbersCompartment.of(gutterEnabled ? lineNumbers() : []),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    search(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    foldGutterCompartment.of(gutterEnabled ? createFoldGutterExtension() : []),
    wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
    scrollLeftSyncExtension,
    EditorState.readOnly.of(readOnly),
    themeCompartment.of(getThemeExtension(theme)),
    langCompartment.of(getLanguageExtension(language)),
    getPhrasesExtension(locale),
  ];
  return exts;
}

function SideBySideDiffViewer({
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
  theme: "light" | "dark";
  locale: string;
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  fileKey?: string;
  collapseUnchanged: boolean;
  onMount?: DiffViewerProps["onMount"];
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
  const foldMarkerState = useFoldMarkerAutoHide(wrapperRef.current, fileKey ?? original + modified);

  const sharedExts = useMemo(
    () => buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap, locale),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale],
  );

  const emitCollapsedUnchangedRanges = useCallback((view: EditorView) => {
    if (!onCollapsedUnchangedRangesChange) return;
    if (!collapseUnchanged) {
      onCollapsedUnchangedRangesChange([]);
      return;
    }
    onCollapsedUnchangedRangesChange(buildCollapsedUnchangedRanges({
      chunks: getMergeChunks(view.state),
      doc: view.state.doc,
      expandedLines: expandedCollapsedLinesRef.current,
    }));
  }, [collapseUnchanged, onCollapsedUnchangedRangesChange]);

  useEffect(() => {
    if (!containerRef.current) return;

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
        const expandedLines = update.transactions.flatMap((transaction) => transaction.effects)
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
      if (syncing) return;
      syncing = true;
      if (mv.b) {
        syncScrollPosition(mv.a.scrollDOM, mv.b.scrollDOM);
        syncHorizontalScroll(mv.a.scrollDOM, mv.b.scrollDOM);
      }
      syncing = false;
    };
    const handleScrollB = () => {
      if (syncing) return;
      syncing = true;
      if (mv.a) {
        syncScrollPosition(mv.b.scrollDOM, mv.a.scrollDOM);
        syncHorizontalScroll(mv.b.scrollDOM, mv.a.scrollDOM);
      }
      syncing = false;
    };
    scrollHandlersRef.current = { handleScrollA, handleScrollB };

    mv.a.scrollDOM.addEventListener("scroll", handleScrollA, { passive: true });
    mv.b.scrollDOM.addEventListener("scroll", handleScrollB, { passive: true });

    const editorsContainer = mv.dom.querySelector<HTMLElement>(".cm-mergeViewEditors");
    const resizerEl = document.createElement("div");
    let resizerCleanup: (() => void) | null = null;
    const wrapperB = mv.b.dom?.parentNode as HTMLElement | null;
    if (editorsContainer && wrapperB && editorsContainer.contains(wrapperB)) {
      const wrapperA = mv.a.dom.parentNode as HTMLElement;
      resizerEl.className = "adl-cm-diff-resizer";
      editorsContainer.insertBefore(resizerEl, wrapperB);

      const SAVED_RATIO_KEY = "adl-diff-resizer-ratio";
      const MIN_WIDTH = 200;
      const resizerWidth = 6;
      let ratio = parseFloat(localStorage.getItem(SAVED_RATIO_KEY) ?? "0.5");
      if (Number.isNaN(ratio) || ratio <= 0 || ratio >= 1) ratio = 0.5;

      const applyRatio = (totalWidth: number) => {
        const avail = totalWidth - resizerWidth;
        const widthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, avail * ratio));
        wrapperA.style.flex = "none";
        wrapperA.style.width = `${widthA}px`;
        wrapperB.style.flex = "1 1 0";
        wrapperB.style.width = "auto";
      };

      const applyCurrentRatio = () => {
        applyRatio(editorsContainer.offsetWidth);
      };

      applyCurrentRatio();

      const startResize = (clientX: number) => {
        const startX = clientX;
        const startWidthA = wrapperA.offsetWidth;
        const totalWidth = editorsContainer.offsetWidth;

        resizerEl.classList.add("adl-cm-diff-resizer--dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (currentX: number) => {
          const deltaX = currentX - startX;
          const avail = totalWidth - resizerWidth;
          const newWidthA = Math.max(MIN_WIDTH, Math.min(avail - MIN_WIDTH, startWidthA + deltaX));
          ratio = newWidthA / avail;
          localStorage.setItem(SAVED_RATIO_KEY, ratio.toString());
          wrapperA.style.flex = "none";
          wrapperA.style.width = `${newWidthA}px`;
          wrapperB.style.flex = "1 1 0";
          wrapperB.style.width = "auto";
        };

        const onEnd = () => {
          resizerEl.classList.remove("adl-cm-diff-resizer--dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
        };

        const onMouseMove = (moveEvent: MouseEvent) => {
          onMove(moveEvent.clientX);
        };
        const onMouseUp = () => onEnd();

        const onTouchMove = (touchEvent: TouchEvent) => {
          onMove(touchEvent.touches[0].clientX);
        };
        const onTouchEnd = () => onEnd();

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
      };

      const onResizerMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        startResize(e.clientX);
      };

      const onResizerTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        startResize(e.touches[0].clientX);
      };

      resizerEl.addEventListener("mousedown", onResizerMouseDown);
      resizerEl.addEventListener("touchstart", onResizerTouchStart, { passive: false });

      const resizeObserver = new ResizeObserver(applyCurrentRatio);
      resizeObserver.observe(editorsContainer);

      resizerCleanup = () => {
        resizerEl.removeEventListener("mousedown", onResizerMouseDown);
        resizerEl.removeEventListener("touchstart", onResizerTouchStart);
        resizeObserver.disconnect();
      };
    }

    mergeViewRef.current = mv;
    mergeViewARef.current = mv.a;
    mergeViewBRef.current = mv.b;
    setEditorViewA(mv.a);
    setEditorViewB(mv.b);
    emitCollapsedUnchangedRanges(mv.b);

    if (onMount) {
      onMount(createDiffEditorRef(mv));
    }

    return () => {
      if (mergeViewRef.current && scrollHandlersRef.current) {
        mergeViewRef.current.a.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollA);
        mergeViewRef.current.b.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollB);
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
      onCollapsedUnchangedRangesChange?.([]);
    };
  }, [
    original,
    modified,
    sharedExts,
    extraExtensions,
    collapseUnchanged,
    onCollapsedUnchangedRangesChange,
    emitCollapsedUnchangedRanges,
  ]);

  useEffect(() => {
    const mv = mergeViewRef.current;
    if (!mv) return;
    const reconfigure = (view: EditorView | null) => {
      if (!view) return;
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

  useEffect(() => {
    rebuildThemes();
  }, [theme]);

  return (
    <div
      ref={wrapperRef}
      className={`adl-cm-diff-viewer-wrapper${wordWrap ? " adl-cm-word-wrap" : " adl-cm-no-word-wrap"}`}
      data-fold-marker-state={foldMarkerState}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div
        ref={containerRef}
        className="adl-cm-diff-viewer adl-cm-diff-viewer--side-by-side"
      />
      <FoldTooltipOverlay view={editorViewA} />
      <FoldTooltipOverlay view={editorViewB} />
    </div>
  );
}

function InlineDiffViewer({
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
  theme: "light" | "dark";
  locale: string;
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  fileKey?: string;
  collapseUnchanged: boolean;
  onMount?: DiffViewerProps["onMount"];
  extraExtensions: Extension[];
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const foldMarkerState = useFoldMarkerAutoHide(wrapperRef.current, fileKey ?? original + modified);

  const extensions = useMemo<Extension[]>(() => {
    const base = buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap, locale);
    return [
      ...base,
      ...extraExtensions,
      EditorView.updateListener.of((update) => {
        if (!onCollapsedUnchangedRangesChange) return;
        const expandedLines = update.transactions.flatMap((transaction) => transaction.effects)
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
          onCollapsedUnchangedRangesChange(buildCollapsedUnchangedRanges({
            chunks: getMergeChunks(update.state),
            doc: update.state.doc,
            expandedLines: expandedCollapsedLinesRef.current,
          }));
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
    onCollapsedUnchangedRangesChange,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    containerRef.current.innerHTML = "";
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
          ? buildCollapsedUnchangedRanges({ chunks: getMergeChunks(view.state), doc: view.state.doc })
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
  }, [original, modified, extensions, collapseUnchanged, onCollapsedUnchangedRangesChange]);

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
      className={`adl-cm-diff-viewer-wrapper${wordWrap ? " adl-cm-word-wrap" : " adl-cm-no-word-wrap"}`}
      data-fold-marker-state={foldMarkerState}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div
        ref={containerRef}
        className="adl-cm-diff-viewer adl-cm-diff-viewer--inline"
      />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
}

export function DiffViewer({
  original,
  modified,
  language = "plaintext",
  theme = "dark",
  locale = "en-US",
  sideBySide = false,
  collapseUnchanged = true,
  readOnly = true,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  fileKey,
  onMount,
  extensions: extraExtensions = [],
  onCollapsedUnchangedRangesChange,
}: DiffViewerProps) {
  const resolvedLocale = locale || "en-US";
  const child = sideBySide ? (
    <SideBySideDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      locale={resolvedLocale}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      fileKey={fileKey}
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      onCollapsedUnchangedRangesChange={onCollapsedUnchangedRangesChange}
    />
  ) : (
    <InlineDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      locale={resolvedLocale}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      fileKey={fileKey}
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      onCollapsedUnchangedRangesChange={onCollapsedUnchangedRangesChange}
    />
  );

  return child;
}
