import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { MergeView } from '@codemirror/merge';
import type {
  EditorRef,
  DiffEditorRef,
  EditorSelection as EditorSelectionType,
  EditorRange,
  EditorModel,
  Disposable,
} from '../../stores/types';

function posToOffset(
  doc: { line(n: number): { from: number } },
  line: number,
  col: number
): number {
  const ln = doc.line(line);
  return ln.from + col - 1;
}

function offsetToLineCol(
  doc: { lineAt(pos: number): { number: number; from: number } },
  offset: number
): { lineNumber: number; column: number } {
  const ln = doc.lineAt(offset);
  return { lineNumber: ln.number, column: offset - ln.from + 1 };
}

class CodeMirrorModel implements EditorModel {
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
  }

  getValueInRange(range: EditorRange): string {
    const doc = this.view.state.doc;
    const start = posToOffset(doc, range.startLineNumber, range.startColumn);
    const end = posToOffset(doc, range.endLineNumber, range.endColumn);
    return doc.sliceString(start, end);
  }

  getLineCount(): number {
    return this.view.state.doc.lines;
  }

  getLineMaxColumn(lineNumber: number): number {
    const line = this.view.state.doc.line(lineNumber);
    return line.length + 1;
  }
}

export class CodeMirrorEditorRef implements EditorRef {
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
  }

  getSelection(): EditorSelectionType | null {
    const sel = this.view.state.selection.main;
    if (!sel) return null;
    const start = offsetToLineCol(this.view.state.doc, sel.from);
    const end = offsetToLineCol(this.view.state.doc, sel.to);
    return {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    };
  }

  getModel(): EditorModel | null {
    return new CodeMirrorModel(this.view);
  }

  revealLineInCenter(lineNumber: number): void {
    const line = this.view.state.doc.line(lineNumber);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
  }

  revealLinesInCenter?(startLineNumber: number, endLineNumber: number): void {
    const startLine = this.view.state.doc.line(startLineNumber);
    const endLine = this.view.state.doc.line(endLineNumber);
    const range = EditorSelection.range(startLine.from, endLine.to);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(range, { y: 'center' }),
    });
  }

  getVisibleRanges(): EditorRange[] {
    const ranges = this.view.visibleRanges;
    return ranges.map((r) => {
      const start = offsetToLineCol(this.view.state.doc, r.from);
      const end = offsetToLineCol(this.view.state.doc, r.to);
      return {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    });
  }

  getScrollTop(): number {
    return this.view.scrollDOM.scrollTop;
  }

  getScrollHeight(): number {
    return this.view.scrollDOM.scrollHeight;
  }

  getLayoutInfo(): { height: number; width?: number; contentWidth?: number } {
    const dom = this.view.dom;
    return {
      height: dom.clientHeight,
      width: dom.clientWidth,
      contentWidth: this.view.contentDOM.clientWidth,
    };
  }

  setScrollPosition(position: { scrollTop: number }): void {
    this.view.scrollDOM.scrollTop = position.scrollTop;
  }

  onDidScrollChange(listener: () => void): Disposable {
    const target = this.view.scrollDOM;
    target.addEventListener('scroll', listener);
    return {
      dispose() {
        target.removeEventListener('scroll', listener);
      },
    };
  }

  onDidChangeHiddenAreas?(listener: () => void): Disposable {
    return { dispose() {} };
  }

  onDidLayoutChange?(listener: () => void): Disposable {
    const observer = new ResizeObserver(listener);
    observer.observe(this.view.dom);
    observer.observe(this.view.scrollDOM);
    observer.observe(this.view.contentDOM);
    return {
      dispose() {
        observer.disconnect();
      },
    };
  }

  focus(): void {
    this.view.focus();
  }

  setPosition(position: { lineNumber: number; column: number }): void {
    const offset = posToOffset(this.view.state.doc, position.lineNumber, position.column);
    this.view.dispatch({
      selection: { anchor: offset },
    });
  }

  setSelection?(selection: EditorSelectionType): void {
    const anchor = posToOffset(
      this.view.state.doc,
      selection.startLineNumber,
      selection.startColumn
    );
    const head = posToOffset(this.view.state.doc, selection.endLineNumber, selection.endColumn);
    this.view.dispatch({
      selection: { anchor, head },
    });
  }

  getTopForLineNumber?(lineNumber: number): number {
    const line = this.view.state.doc.line(lineNumber);
    const block = this.view.lineBlockAt(line.from);
    return block.top - this.view.documentTop;
  }

  getDomNode?(): HTMLElement | null {
    return this.view.dom;
  }

  getView(): EditorView {
    return this.view;
  }
}

export class CodeMirrorDiffEditorRef implements DiffEditorRef {
  private mergeView: MergeView;

  constructor(mergeView: MergeView) {
    this.mergeView = mergeView;
  }

  getModifiedEditor(): EditorRef | null {
    return new CodeMirrorEditorRef(this.mergeView.b);
  }

  getOriginalEditor(): EditorRef | null {
    return new CodeMirrorEditorRef(this.mergeView.a);
  }

  onDidUpdateDiff(listener: () => void): Disposable {
    const observer = new MutationObserver(listener);
    observer.observe(this.mergeView.dom, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return {
      dispose() {
        observer.disconnect();
      },
    };
  }

  layout(dimension?: { width: number; height: number }): void {
    if (dimension) {
      this.mergeView.dom.style.width = `${dimension.width}px`;
      this.mergeView.dom.style.height = `${dimension.height}px`;
    }
    this.mergeView.a.requestMeasure();
    this.mergeView.b.requestMeasure();
  }

  updateOptions(opts: unknown): void {
    this.mergeView.reconfigure(opts as any);
  }
}

export function createEditorRef(view: EditorView): EditorRef {
  return new CodeMirrorEditorRef(view);
}

export function createDiffEditorRef(mergeView: MergeView): DiffEditorRef {
  return new CodeMirrorDiffEditorRef(mergeView);
}
