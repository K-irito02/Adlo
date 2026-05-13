import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { MergeView, getChunks, uncollapseUnchanged, unifiedMergeView } from "@codemirror/merge";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { DiffEditorRef, EditorRef } from "../../types";
import { createDiffEditorRef, createEditorRef } from "./editorAdapters";
import { getThemeExtension, rebuildThemes, getPhrasesExtension } from "./cmTheme";
import { getLanguageExtension } from "./cmLanguages";
import { createFoldGutterExtension } from "./cmFoldGutter";
import {
  getMinimapExtension,
  updateMinimapDiffModel,
  type CmMinimapDiffModel
} from "./cmMinimap";
import {
  computePreviewDiffMinimapModel,
  type PreviewDiffCollapsedRange,
} from "./changePreviewDiffRanges";

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
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extensions?: Extension[];
  minimapModel?: CmMinimapDiffModel;
  minimapScopeId?: string;
  onMinimapDragStart?: () => void;
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
  collapseUnchanged,
  onMount,
  extraExtensions,
  minimapModel,
  minimapScopeId,
  onMinimapDragStart,
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
  collapseUnchanged: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
  minimapModel?: CmMinimapDiffModel;
  minimapScopeId?: string;
  onMinimapDragStart?: () => void;
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const scrollHandlersRef = useRef<{
    handleScrollA: () => void;
    handleScrollB: () => void;
    handleWheel: (event: WheelEvent) => void;
  } | null>(null);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());

  const sharedExts = useMemo(
    () => buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap, locale),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale],
  );

  const mergedMinimapModel = useMemo(() => {
    if (minimapModel) return minimapModel;
    return computePreviewDiffMinimapModel(original, modified);
  }, [original, modified, minimapModel]);

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
    let activeMergeView: MergeView | null = null;
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
      ...getMinimapExtension({
        onDragStart: onMinimapDragStart,
        scrollElement: () => activeMergeView?.dom ?? null,
        scopeId: minimapScopeId,
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

    activeMergeView = mv;
    const handleScrollA = () => {
      if (syncing) return;
      syncing = true;
      if (mv.b) {
        syncScrollPosition(mv.a.scrollDOM, mv.b.scrollDOM);
      }
      syncing = false;
    };
    const handleScrollB = () => {
      if (syncing) return;
      syncing = true;
      if (mv.a) {
        syncScrollPosition(mv.b.scrollDOM, mv.a.scrollDOM);
      }
      syncing = false;
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      const previousScrollTop = mv.dom.scrollTop;
      mv.dom.scrollTop += event.deltaY;
      if (Math.abs(mv.dom.scrollTop - previousScrollTop) > 0.5) {
        handleScrollB();
        event.preventDefault();
      }
    };

    scrollHandlersRef.current = { handleScrollA, handleScrollB, handleWheel };

    mv.a.scrollDOM.addEventListener("scroll", handleScrollA, { passive: true });
    mv.b.scrollDOM.addEventListener("scroll", handleScrollB, { passive: true });
    mv.dom.addEventListener("wheel", handleWheel, { passive: false });

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
      const resizerWidth = 4;
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
    emitCollapsedUnchangedRanges(mv.b);

    if (onMount) {
      onMount(createDiffEditorRef(mv));
    }

    return () => {
      if (mergeViewRef.current && scrollHandlersRef.current) {
        mergeViewRef.current.a.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollA);
        mergeViewRef.current.b.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollB);
        mergeViewRef.current.dom.removeEventListener("wheel", scrollHandlersRef.current.handleWheel);
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
      onCollapsedUnchangedRangesChange?.([]);
      activeMergeView = null;
    };
  }, [
    original,
    modified,
    sharedExts,
    extraExtensions,
    collapseUnchanged,
    onMinimapDragStart,
    minimapScopeId,
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
    const mv = mergeViewRef.current;
    if (!mv?.b) return;
    updateMinimapDiffModel(
      mv.b,
      mergedMinimapModel ?? null
    );
  }, [mergedMinimapModel]);

  useEffect(() => {
    rebuildThemes();
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="adl-cm-diff-viewer adl-cm-diff-viewer--side-by-side"
    />
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
  collapseUnchanged,
  onMount,
  extraExtensions,
  minimapModel,
  minimapScopeId,
  onMinimapDragStart,
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
  collapseUnchanged: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
  minimapModel?: CmMinimapDiffModel;
  minimapScopeId?: string;
  onMinimapDragStart?: () => void;
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const expandedCollapsedLinesRef = useRef<Set<number>>(new Set());

  const mergedMinimapModel = useMemo(() => {
    if (minimapModel) return minimapModel;
    return computePreviewDiffMinimapModel(original, modified);
  }, [original, modified, minimapModel]);

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
      ...getMinimapExtension({ onDragStart: onMinimapDragStart, scopeId: minimapScopeId }),
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
    onMinimapDragStart,
    minimapScopeId,
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
    const view = viewRef.current;
    if (!view) return;
    updateMinimapDiffModel(
      view,
      mergedMinimapModel ?? null
    );
  }, [mergedMinimapModel]);

  useEffect(() => {
    rebuildThemes();
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="adl-cm-diff-viewer adl-cm-diff-viewer--inline"
    />
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
  onMount,
  extensions: extraExtensions = [],
  minimapModel,
  minimapScopeId,
  onMinimapDragStart,
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
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      minimapModel={minimapModel}
      minimapScopeId={minimapScopeId}
      onMinimapDragStart={onMinimapDragStart}
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
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      minimapModel={minimapModel}
      minimapScopeId={minimapScopeId}
      onMinimapDragStart={onMinimapDragStart}
      onCollapsedUnchangedRangesChange={onCollapsedUnchangedRangesChange}
    />
  );

  return child;
}
