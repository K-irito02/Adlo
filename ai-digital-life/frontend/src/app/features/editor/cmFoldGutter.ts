import { foldGutter } from '@codemirror/language';

export function createFoldGutterExtension() {
  return foldGutter({
    markerDOM(open) {
      const marker = document.createElement('span');
      marker.className = `adl-cm-fold-marker adl-cm-fold-marker--${open ? 'open' : 'closed'}`;
      marker.setAttribute('aria-hidden', 'true');
      marker.dataset.open = String(open);
      return marker;
    },
  });
}
