import { EditorView, ViewPlugin, type PluginValue, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { foldable, foldedRanges } from "@codemirror/language";

class FoldingTooltipPlugin implements PluginValue {
  private lastDocGeneration = -1;

  constructor(private view: EditorView) {
    setTimeout(() => this.updateMarkerTitles(), 0);
  }

  update(update: ViewUpdate) {
    if (update.view.state.doc.generation === this.lastDocGeneration) return;
    this.lastDocGeneration = update.view.state.doc.generation;
    this.updateMarkerTitles();
  }

  destroy() {
    const gutter = this.view.dom.querySelector(".cm-foldGutter");
    if (!gutter) return;
    for (let i = 0; i < gutter.children.length; i++) {
      (gutter.children[i] as HTMLElement).removeAttribute("title");
    }
  }

  private updateMarkerTitles() {
    const gutter = this.view.dom.querySelector(".cm-foldGutter");
    if (!gutter) return;

    const doc = this.view.state.doc;

    for (let i = 0; i < gutter.children.length; i++) {
      const el = gutter.children[i] as HTMLElement;
      if (el.style.visibility === "hidden") continue;

      const marker = el.querySelector(".adl-cm-fold-marker");
      if (!marker) continue;

      const lineNum = i + 1;
      if (lineNum > doc.lines) continue;

      const line = doc.line(lineNum);
      const isClosed = marker.classList.contains("adl-cm-fold-marker--closed");

      let targetLine: number | null = null;

      if (isClosed) {
        targetLine = this.findFoldedRangeEndLine(lineNum);
      } else {
        targetLine = this.findFoldableEndLine(line.from, line.to, lineNum);
      }

      if (targetLine !== null && targetLine > lineNum) {
        const text = isClosed
          ? `折叠至${targetLine}行`
          : `展开至${targetLine}行`;
        el.setAttribute("title", text);
      } else {
        el.removeAttribute("title");
      }
    }
  }

  private findFoldedRangeEndLine(currentLineNumber: number): number | null {
    let result: number | null = null;
    const doc = this.view.state.doc;

    foldedRanges(this.view.state).between(0, doc.length, (from, to) => {
      const startLine = doc.lineAt(from).number;
      const endLine = doc.lineAt(to).number;

      if (startLine === currentLineNumber) {
        result = endLine;
      }
    });

    return result;
  }

  private findFoldableEndLine(lineStart: number, lineEnd: number, _currentLineNumber: number): number | null {
    const range = foldable(this.view.state, lineStart, lineEnd);
    if (!range) return null;

    const endPos = range.to > 0 ? range.to - 1 : 0;
    return this.view.state.doc.lineAt(endPos).number;
  }
}

export function getFoldingTooltipExtension(): Extension {
  return ViewPlugin.define((view) => new FoldingTooltipPlugin(view));
}
