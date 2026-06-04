export {
  CodeEditor,
  saveEditorState,
  getSavedEditorState,
  clearEditorStateCache,
} from './CodeEditor';
export type { CodeEditorProps } from './CodeEditor';

export {
  CodeMirrorEditorRef,
  CodeMirrorDiffEditorRef,
  createEditorRef,
  createDiffEditorRef,
} from './editorAdapters';

export {
  getThemeExtension,
  rebuildThemes,
  getPhrasesExtension,
  AGENT_DECO_INSERT_CLASS,
  AGENT_DECO_MODIFY_CLASS,
  AGENT_DECO_DELETE_CLASS,
  AGENT_DECO_INSERT_BLOCK_CLASS,
  AGENT_DECO_MODIFY_BLOCK_CLASS,
  AGENT_DECO_DELETE_BLOCK_CLASS,
} from './cmTheme';

export { getLanguageExtension } from './cmLanguages';

export { createFoldGutterExtension } from './cmFoldGutter';

export { scrollLeftSyncExtension } from './cmScrollLeftSync';

export { useFoldMarkerAutoHide } from './useFoldMarkerAutoHide';
export type { FoldMarkerState } from './useFoldMarkerAutoHide';

export { FoldTooltipOverlay } from './FoldTooltipOverlay';
