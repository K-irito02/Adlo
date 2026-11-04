export { CodeEditor } from './CodeEditor';
export type { CodeEditorProps } from './CodeEditor';
export { saveEditorState, getSavedEditorState, clearEditorStateCache } from './editorStateCache';

export {
  CodeMirrorEditorRef,
  CodeMirrorDiffEditorRef,
  createEditorRef,
  createDiffEditorRef,
} from './editorAdapters';

export { getThemeExtension, rebuildThemes, getPhrasesExtension } from './cmTheme';
export type { CmPhrases } from './cmTheme';

export { getLanguageExtension } from './cmLanguages';

export { createFoldGutterExtension } from './cmFoldGutter';

export { scrollLeftSyncExtension } from './cmScrollSync';

export { useFoldMarkerAutoHide } from './useFoldMarkerAutoHide';
export type { FoldMarkerState } from './useFoldMarkerAutoHide';

export { FoldTooltipOverlay } from './FoldTooltipOverlay';
