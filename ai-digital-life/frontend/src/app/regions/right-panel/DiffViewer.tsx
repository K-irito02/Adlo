import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { DiffEditorRef, EditorRef } from "../../types";
import { createDiffEditorRef, createEditorRef } from "./editorAdapters";
import { getThemeExtension, rebuildThemes } from "./cmTheme";
import { getLanguageExtension } from "./cmLanguages";

export type DiffViewerProps = {
  original: string;
  modified: string;
  language?: string;
  theme?: "light" | "dark";
  sideBySide?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extensions?: Extension[];
};

const themeCompartment = new Compartment();
const langCompartment = new Compartment();

function buildSharedExtensions(
  language: string,
  theme: "light" | "dark",
  readOnly: boolean,
  lineNumbersEnabled: boolean,
  wordWrap: boolean,
): Extension[] {
  const exts: Extension[] = [
    history(),
    lineNumbersEnabled ? lineNumbers() : [],
    highlightActiveLineGutter(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    search(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    foldGutter(),
    wordWrap ? [EditorView.lineWrapping] : [],
    EditorState.readOnly.of(readOnly),
    themeCompartment.of(getThemeExtension(theme)),
    langCompartment.of(getLanguageExtension(language)),
  ];
  return exts;
}

function SideBySideDiffViewer({
  original,
  modified,
  language,
  theme,
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
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);

  const sharedExts = useMemo(
    () => buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap),
    [language, theme, readOnly, lineNumbersEnabled, wordWrap],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }

    const aExts: Extension[] = [...sharedExts, ...extraExtensions];
    const bExts: Extension[] = [...sharedExts, ...extraExtensions];

    const mv = new MergeView({
      a: { doc: original, extensions: aExts },
      b: { doc: modified, extensions: bExts },
      parent: containerRef.current,
      collapseUnchanged: { margin: 3, minSize: 4 },
      gutter: true,
      highlightChanges: true,
    });

    mergeViewRef.current = mv;

    if (onMount) {
      onMount(createDiffEditorRef(mv));
    }

    return () => {
      if (mergeViewRef.current) {
        mergeViewRef.current.destroy();
        mergeViewRef.current = null;
      }
    };
  }, [original, modified]);

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
  readOnly: boolean;
  lineNumbersEnabled: boolean;
  wordWrap: boolean;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extraExtensions: Extension[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const extensions = useMemo<Extension[]>(() => {
    const base = buildSharedExtensions(language, theme, readOnly, lineNumbersEnabled, wordWrap);
    return [
      ...base,
      ...extraExtensions,
      unifiedMergeView({
        original,
        highlightChanges: true,
        gutter: true,
        mergeControls: true,
        collapseUnchanged: { margin: 3, minSize: 4 },
      }),
    ];
  }, [language, theme, readOnly, lineNumbersEnabled, wordWrap, original]);

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
  }, [original, modified]);

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
  sideBySide = false,
  readOnly = true,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  onMount,
  extensions: extraExtensions = [],
}: DiffViewerProps) {
  if (sideBySide) {
    return (
      <SideBySideDiffViewer
        original={original}
        modified={modified}
        language={language}
        theme={theme}
        readOnly={readOnly}
        lineNumbersEnabled={lineNumbersEnabled}
        wordWrap={wordWrap}
        onMount={onMount}
        extraExtensions={extraExtensions}
      />
    );
  }

  return (
    <InlineDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      onMount={onMount}
      extraExtensions={extraExtensions}
    />
  );
}
