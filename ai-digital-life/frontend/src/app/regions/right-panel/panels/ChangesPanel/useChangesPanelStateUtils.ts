import type { EditorView } from '@codemirror/view';
import { getChunks } from '@codemirror/merge';
import type { ChangeTreeNode } from '../../changesTree';
import type { FileTreeRenderableNode } from '@features/file-tree';

export function findCollapsedSectionStart(view: EditorView, targetLine: number): number | null {
  const margin = 3;
  const minSize = 4;
  const chunks = getChunks(view.state)?.chunks ?? [];
  let prevLine = 1;
  for (let i = 0; ; i++) {
    const chunk = i < chunks.length ? chunks[i] : null;
    const collapseFrom = i > 0 ? prevLine + margin : 1;
    const collapseTo = chunk
      ? Math.max(view.state.doc.lineAt(chunk.fromB).number - 1 - margin, collapseFrom)
      : view.state.doc.lines;
    const lineCount = collapseTo - collapseFrom + 1;
    if (lineCount >= minSize && collapseFrom <= targetLine && targetLine <= collapseTo) {
      return view.state.doc.line(collapseFrom).from;
    }
    if (!chunk) {
      break;
    }
    prevLine = view.state.doc.lineAt(Math.min(view.state.doc.length, chunk.toB)).number;
  }
  return null;
}

export function isNodeDeleted(node: FileTreeRenderableNode): boolean {
  return (node as ChangeTreeNode).patchSummary?.changeKind === 'deleted';
}
