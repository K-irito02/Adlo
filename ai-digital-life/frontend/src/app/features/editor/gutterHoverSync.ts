import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const OVERLAY_CLASS = 'adl-gutter-hover-overlay';

/** Read a CSS variable value from the document root. */
function getCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * CodeMirror extension that highlights the gutter line number when the
 * mouse hovers over the corresponding content line.
 *
 * Uses an absolutely-positioned overlay <div> inside .cm-gutters to paint
 * the hover background. This completely avoids all CSS conflict issues
 * with CodeMirror's own gutter element styling.
 */
export function gutterHoverSync(): Extension {
  return EditorView.domEventHandlers({
    mouseover(event, view) {
      const target = event.target as HTMLElement;
      const line = target.closest('.cm-line') as HTMLElement | null;
      if (!line) return;

      const editor = line.closest('.cm-editor');
      if (!editor) return;

      // Resolve the document line number
      const pos = view.posAtDOM(line, 0);
      if (pos < 0) return;
      let lineNumber = 0;
      try {
        lineNumber = view.state.doc.lineAt(pos).number;
      } catch {
        return;
      }
      if (lineNumber < 1) return;

      const gutters = editor.querySelector('.cm-gutters') as HTMLElement | null;
      if (!gutters) return;
      const lineNumbers = gutters.querySelector('.cm-lineNumbers') as HTMLElement | null;
      if (!lineNumbers) return;

      // Remove any existing overlay
      const existing = gutters.querySelector(`.${OVERLAY_CLASS}`);
      if (existing) existing.remove();

      // Find the matching gutter element to get its vertical position
      const targetStr = String(lineNumber);
      const allEls = lineNumbers.querySelectorAll<HTMLElement>(':scope > .cm-gutterElement');
      let targetEl: HTMLElement | null = null;
      for (const el of allEls) {
        if (el.textContent?.trim() === targetStr) {
          targetEl = el;
          break;
        }
      }
      if (!targetEl) return;

      // Create an overlay that covers the full gutter area for this line
      const overlay = document.createElement('div');
      overlay.className = OVERLAY_CLASS;

      const guttersRect = gutters.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();

      overlay.style.position = 'absolute';
      overlay.style.top = elRect.top - guttersRect.top + 'px';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.height = elRect.height + 'px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '-1';

      const bg = getCssVar('--editor-hover-bg');
      if (bg) overlay.style.backgroundColor = bg;

      // Ensure the overlay is inside the gutters stacking context
      if (getComputedStyle(gutters).position === 'static') {
        gutters.style.position = 'relative';
      }

      gutters.appendChild(overlay);
    },

    mouseout(_event, _view) {
      if (typeof document === 'undefined') return;
      document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
    },
  });
}
