import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { EditorState, Compartment } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { EditorRef } from "../../types";
import { createEditorRef } from "./editorAdapters";
import { getThemeExtension, rebuildThemes, getPhrasesExtension } from "./cmTheme";
import { getLanguageExtension } from "./cmLanguages";
import { createFoldGutterExtension } from "./cmFoldGutter";
import { FoldTooltipOverlay } from "./FoldTooltipOverlay";
import { scrollLeftSyncExtension } from "./cmScrollLeftSync";

export type CodeEditorProps = {
  value: string;
  language?: string;
  theme?: "light" | "dark";
  locale?: string;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  onChange?: (value: string) => void;
  onMount?: (editor: EditorRef) => void;
  extensions?: Extension[];
};

const stateCache = new Map<string, { state: EditorState; timestamp: number }>();
const STATE_CACHE_MAX_SIZE = 20;
const STATE_CACHE_TTL = 5 * 60 * 1000;
const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const foldGutterCompartment = new Compartment();

function pruneStateCache() {
  const now = Date.now();
  for (const [key, entry] of stateCache) {
    if (now - entry.timestamp > STATE_CACHE_TTL) {
      stateCache.delete(key);
    }
  }
  if (stateCache.size > STATE_CACHE_MAX_SIZE) {
    const entries = [...stateCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - STATE_CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      stateCache.delete(key);
    }
  }
}

export function saveEditorState(filePath: string, view: EditorView | null) {
  if (!view || !filePath) return;
  pruneStateCache();
  stateCache.set(filePath, { state: view.state, timestamp: Date.now() });
}

export function getSavedEditorState(filePath: string): EditorState | null {
  const entry = stateCache.get(filePath);
  if (!entry) return null;
  entry.timestamp = Date.now();
  return entry.state;
}

export function clearEditorStateCache(filePath?: string) {
  if (filePath) {
    stateCache.delete(filePath);
  } else {
    stateCache.clear();
  }
}

export function CodeEditor({
  value,
  language = "plaintext",
  theme = "dark",
  locale = "en-US",
  readOnly = false,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  onChange,
  onMount,
  extensions: extraExtensions = [],
}: CodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const mountedRef = useRef(false);
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const baseExtensions = useMemo<Extension[]>(() => {
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
      ...getLanguageExtension(language),
      getPhrasesExtension(locale || "en-US"),
    ];
    return exts;
  }, [language, theme, readOnly, lineNumbersEnabled, wordWrap, locale]);

  const allExtensions = useMemo<Extension[]>(
    () => [...baseExtensions, ...extraExtensions],
    [baseExtensions, extraExtensions],
  );

  const handleCreateEditorView = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      setEditorView(view);
      if (onMount) {
        onMount(createEditorRef(view));
      }
      mountedRef.current = true;
    },
    [onMount],
  );

  const handleChange = useCallback(
    (val: string) => {
      if (onChange) {
        onChange(val);
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (viewRef.current) {
      rebuildThemes();
    }
  }, [theme]);

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
  }, [lineNumbersEnabled, wordWrap]);

  return (
    <div
      className={`adl-cm-editor-wrapper${wordWrap ? " adl-cm-word-wrap" : " adl-cm-no-word-wrap"}`}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <CodeMirror
        value={value}
        extensions={allExtensions}
        theme={getThemeExtension(theme)}
        onChange={handleChange}
        onCreateEditor={handleCreateEditorView}
        className="adl-cm-editor"
        basicSetup={false}
      />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
}
