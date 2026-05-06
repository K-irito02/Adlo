import { ViewPlugin, type PluginValue, EditorView, ViewUpdate, Decoration, type DecorationSet } from "@codemirror/view";
import { type Extension, type Range, StateEffect } from "@codemirror/state";
import { DIFF_INSERT_CLASS, DIFF_DELETE_CLASS } from "./cmTheme";

export interface DiffChunkInfo {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

export const setInlineDiffChunks = StateEffect.define<DiffChunkInfo[]>();

class InlineDiffBackgroundPlugin implements PluginValue {
  private _decorations: DecorationSet = Decoration.none;

  constructor(private view: EditorView) {}

  get decorations(): DecorationSet {
    return this._decorations;
  }

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setInlineDiffChunks)) {
          this._decorations = this.buildDecorations(effect.value);
          return;
        }
      }
    }
    if (update.docChanged) {
      this._decorations = Decoration.none;
    }
  }

  private buildDecorations(chunks: DiffChunkInfo[]): DecorationSet {
    if (chunks.length === 0) return Decoration.none;
    const doc = this.view.state.doc;
    if (doc.lines === 0 || doc.length === 0) return Decoration.none;

    const decorations: Range<Decoration>[] = [];

    for (const chunk of chunks) {
      const isInsert = chunk.fromA === chunk.toA;
      const isDelete = chunk.fromB === chunk.toB;
      if (isDelete) continue;
      const className = isInsert ? DIFF_INSERT_CLASS : DIFF_INSERT_CLASS;

      const startLine = doc.lineAt(Math.min(chunk.fromB, doc.length)).number;
      const endLine = doc.lineAt(Math.min(chunk.toB, doc.length)).number;

      for (let line = startLine; line <= endLine; line++) {
        if (line > doc.lines) break;
        const pos = doc.line(line).from;
        const deco = Decoration.line({ class: className });
        decorations.push(deco.range(pos));
      }
    }

    return Decoration.set(decorations, true);
  }

  destroy() {}
}

export function getInlineDiffBackgroundExtension(): Extension {
  return ViewPlugin.define((view) => new InlineDiffBackgroundPlugin(view), {
    decorations: (p) => p.decorations,
  });
}

export function applyInlineDiffChunks(view: EditorView, chunks: DiffChunkInfo[]) {
  view.dispatch({ effects: setInlineDiffChunks.of(chunks) });
}
