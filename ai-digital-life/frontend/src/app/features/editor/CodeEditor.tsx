import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { gutterHoverSync } from './gutterHoverSync';
import type { Extension } from '@codemirror/state';
import { EditorState, Compartment } from '@codemirror/state';
import { history } from '@codemirror/commands';
import { indentOnInput, bracketMatching } from '@codemirror/language';
import { search } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { EditorRef } from '../../stores/types';
import { createEditorRef } from './editorAdapters';
import { getThemeExtension, getPhrasesExtension } from './cmTheme';
import { getLanguageExtension } from './cmLanguages';
import { createFoldGutterExtension } from './cmFoldGutter';
import { FoldTooltipOverlay } from './FoldTooltipOverlay';
import { scrollLeftSyncExtension } from './cmScrollLeftSync';
import { useFoldMarkerAutoHide } from './useFoldMarkerAutoHide';

export type CodeEditorProps = {
  value: string;
  language?: string;
  theme?: 'light' | 'dark';
  locale?: string;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  fileKey?: string;
  onChange?: (value: string) => void;
  onMount?: (editor: EditorRef) => void;
  extensions?: Extension[];
};

const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const foldGutterCompartment = new Compartment();

export function CodeEditor({
  value,
  language = 'plaintext',
  theme = 'dark',
  locale = 'en-US',
  readOnly = false,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  fileKey,
  onChange,
  onMount,
  extensions: extraExtensions = [],
}: CodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const mountedRef = useRef(false);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [langExtensions, setLangExtensions] = useState<Extension[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLanguageExtension(language)
      .then((exts) => {
        if (!cancelled) setLangExtensions(exts);
      })
      .catch((err) => {
        console.error(`[CodeEditor] failed to load language extension for "${language}":`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const foldMarkerState = useFoldMarkerAutoHide(wrapperRef, fileKey ?? value);

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
      gutterHoverSync(),
      EditorState.readOnly.of(readOnly),
      ...langExtensions,
      getPhrasesExtension(locale || 'en-US'),
    ];
    return exts;
  }, [langExtensions, readOnly, lineNumbersEnabled, wordWrap, locale]);

  const allExtensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [...baseExtensions, ...extraExtensions];
    exts.push(...(getThemeExtension(theme) as Extension[]));
    return exts;
  }, [theme, baseExtensions, extraExtensions]);

  const handleCreateEditorView = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      setEditorView(view);
      if (onMount) {
        onMount(createEditorRef(view));
      }
      mountedRef.current = true;
    },
    [onMount]
  );

  const handleChange = useCallback(
    (val: string) => {
      if (onChange) {
        onChange(val);
      }
    },
    [onChange]
  );

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
      ref={wrapperRef}
      className={`adl-cm-editor-wrapper${wordWrap ? ' adl-cm-word-wrap' : ' adl-cm-no-word-wrap'}`}
      data-fold-marker-state={foldMarkerState}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <CodeMirror
        value={value}
        extensions={allExtensions}
        theme="dark"
        onChange={handleChange}
        onCreateEditor={handleCreateEditorView}
        className="adl-cm-editor"
        basicSetup={false}
      />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
}
