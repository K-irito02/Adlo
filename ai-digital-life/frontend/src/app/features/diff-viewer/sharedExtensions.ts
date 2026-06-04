import { Compartment, EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { history } from '@codemirror/commands';
import { indentOnInput, bracketMatching } from '@codemirror/language';
import { search } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { getThemeExtension, getPhrasesExtension } from '../editor/cmTheme';
import { createFoldGutterExtension } from '../editor/cmFoldGutter';
import { gutterHoverSync } from '../editor/gutterHoverSync';
import { scrollLeftSyncExtension } from '../editor/cmScrollLeftSync';
import { getChunks } from '@codemirror/merge';

export const themeCompartment = new Compartment();
export const langCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const wordWrapCompartment = new Compartment();
export const foldGutterCompartment = new Compartment();

export type ScrollSyncMetrics = {
  sourceScrollTop: number;
  sourceScrollHeight: number;
  sourceClientHeight: number;
  targetScrollHeight: number;
  targetClientHeight: number;
};

export const COLLAPSE_UNCHANGED_CONFIG = { margin: 3, minSize: 4 } as const;

type MergeChunksResult = Exclude<ReturnType<typeof getChunks>, null>;
export type MergeChunk = MergeChunksResult['chunks'][number];

export function buildSharedExtensions(
  language: string,
  theme: 'light' | 'dark',
  readOnly: boolean,
  lineNumbersEnabled: boolean,
  wordWrap: boolean,
  locale: string,
  langExtensions: Extension[] = []
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
    gutterHoverSync(),
    EditorState.readOnly.of(readOnly),
    ...(getThemeExtension(theme) as Extension[]),
    langCompartment.of(langExtensions),
    getPhrasesExtension(locale),
  ];
  return exts;
}
