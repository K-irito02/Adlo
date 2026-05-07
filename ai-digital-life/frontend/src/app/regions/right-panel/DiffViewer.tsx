import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { indentOnInput, bracketMatching, foldGutter } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { DiffEditorRef, EditorRef } from "../../types";
import { createDiffEditorRef, createEditorRef } from "./editorAdapters";
import { getThemeExtension, rebuildThemes, getPhrasesExtension } from "./cmTheme";
import { getLanguageExtension } from "./cmLanguages";
import { getMinimapExtension, updateMinimapDiffHunks } from "./cmMinimap";
import type { AgentHunkDecoration } from "./agentDecorations";

export type DiffViewerProps = {
  original: string;
  modified: string;
  language?: string;
  theme?: "light" | "dark";
  locale?: string;
  sideBySide?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extensions?: Extension[];
  hunks?: AgentHunkDecoration[];
};

const themeCompartment = new Compartment();
const langCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const foldGutterCompartment = new Compartment();

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
    foldGutterCompartment.of(gutterEnabled ? foldGutter() : []),
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
  onMount,
  extraExtensions,
  hunks,
}: {
  original: string;
  modified: string;
  language: string;
  theme: "light" | "dark";
  locale: string;
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
  hunks?: AgentHunkDecoration[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const scrollHandlersRef = useRef<{ handleScrollA: () => void; handleScrollB: () => void } | null>(null);

  const sharedExts = useMemo(
    () => buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap, locale),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }

    const aExts: Extension[] = [...sharedExts];
    const bExts: Extension[] = [...sharedExts, ...extraExtensions, ...getMinimapExtension()];

    const mv = new MergeView({
      a: { doc: original, extensions: aExts },
      b: { doc: modified, extensions: bExts },
      parent: containerRef.current,
      collapseUnchanged: { margin: 3, minSize: 4 },
      gutter: false,
      highlightChanges: true,
    });

    let syncing = false;
    const handleScrollA = () => {
      if (syncing) return;
      syncing = true;
      if (mv.b) {
        mv.b.scrollDOM.scrollTop = mv.a.scrollDOM.scrollTop;
      }
      syncing = false;
    };
    const handleScrollB = () => {
      if (syncing) return;
      syncing = true;
      if (mv.a) {
        mv.a.scrollDOM.scrollTop = mv.b.scrollDOM.scrollTop;
      }
      syncing = false;
    };

    scrollHandlersRef.current = { handleScrollA, handleScrollB };

    mv.a.scrollDOM.addEventListener("scroll", handleScrollA);
    mv.b.scrollDOM.addEventListener("scroll", handleScrollB);

    mergeViewRef.current = mv;

    if (onMount) {
      onMount(createDiffEditorRef(mv));
    }

    return () => {
      if (mergeViewRef.current && scrollHandlersRef.current) {
        mergeViewRef.current.a.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollA);
        mergeViewRef.current.b.scrollDOM.removeEventListener("scroll", scrollHandlersRef.current.handleScrollB);
        scrollHandlersRef.current = null;
      }
      if (mergeViewRef.current) {
        mergeViewRef.current.destroy();
        mergeViewRef.current = null;
      }
    };
  }, [original, modified, sharedExts, extraExtensions]);

  useEffect(() => {
    const mv = mergeViewRef.current;
    if (!mv) return;
    const reconfigure = (view: EditorView | null) => {
      if (!view) return;
      view.dispatch({
        effects: [
          lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : []),
          foldGutterCompartment.reconfigure(lineNumbersEnabled ? foldGutter() : []),
          wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        ],
      });
    };
    reconfigure(mv.a);
    reconfigure(mv.b);
  }, [lineNumbersEnabled, wordWrap]);

  useEffect(() => {
    const mv = mergeViewRef.current;
    if (!mv?.b) return;
    if (hunks && hunks.length > 0) {
      updateMinimapDiffHunks(mv.b, hunks);
    }
  }, [hunks]);

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
  onMount,
  extraExtensions,
}: {
  original: string;
  modified: string;
  language: string;
  theme: "light" | "dark";
  locale: string;
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const extensions = useMemo<Extension[]>(() => {
    const base = buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap, locale);
    return [
      ...base,
      ...extraExtensions,
      unifiedMergeView({
        original,
        highlightChanges: true,
        gutter: false,
        mergeControls: true,
        collapseUnchanged: { margin: 3, minSize: 4 },
      }),
    ];
  }, [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale, original]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    containerRef.current.innerHTML = "";

    const state = EditorState.create({
      doc: modified,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (onMount) {
      onMount(createEditorRef(view));
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [original, modified, extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : []),
        foldGutterCompartment.reconfigure(lineNumbersEnabled ? foldGutter() : []),
        wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      ],
    });
  }, [lineNumbersEnabled, wordWrap]);

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
  readOnly = true,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  onMount,
  extensions: extraExtensions = [],
  hunks,
}: DiffViewerProps) {
  const resolvedLocale = locale || "en-US";
  if (sideBySide) {
    return (
      <SideBySideDiffViewer
        original={original}
        modified={modified}
        language={language}
        theme={theme}
        locale={resolvedLocale}
        readOnly={readOnly}
        lineNumbersEnabled={lineNumbersEnabled}
        wordWrap={wordWrap}
        onMount={onMount}
        extraExtensions={extraExtensions}
        hunks={hunks}
      />
    );
  }

  return (
    <InlineDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      locale={resolvedLocale}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      onMount={onMount}
      extraExtensions={extraExtensions}
    />
  );
}
