import { gutter, GutterMarker } from '@codemirror/view';
import { foldable, foldedRanges } from '@codemirror/language';

class FoldMarker extends GutterMarker {
  constructor(private open: boolean) {
    super();
  }

  toDOM() {
    const marker = document.createElement('span');
    marker.className = `adl-cm-fold-marker adl-cm-fold-marker--${this.open ? 'open' : 'closed'}`;
    marker.setAttribute('aria-hidden', 'true');
    marker.dataset.open = String(this.open);
    return marker;
  }

  eq(other: FoldMarker) {
    return this.open === other.open;
  }
}

export function createFoldGutterExtension() {
  return gutter({
    class: 'cm-foldGutter',
    lineMarker(view, line) {
      const lineNum = view.state.doc.lineAt(line.from).number;

      const range = foldable(view.state, line.from, line.to);
      if (range) return new FoldMarker(true);

      let found = false;
      foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
        const startLine = view.state.doc.lineAt(from).number;
        if (lineNum === startLine) {
          found = true;
        }
      });
      if (found) return new FoldMarker(false);

      return null;
    },
    initialSpacer: () => new FoldMarker(true),
  });
}
