import { type EditorView } from '@codemirror/view';

export function estimateWrapColumn(view: EditorView): number | null {
  if (!view.lineWrapping) return null;
  const charWidth = view.defaultCharacterWidth;
  const contentWidth = view.contentDOM.clientWidth;
  if (!Number.isFinite(charWidth) || charWidth <= 0 || contentWidth <= 0) return null;
  return Math.max(1, Math.floor(contentWidth / charWidth));
}
