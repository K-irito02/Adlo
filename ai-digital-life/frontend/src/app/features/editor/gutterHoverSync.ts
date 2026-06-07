import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** Read a CSS custom property from :root, with a fallback value. */
function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * CodeMirror extension that highlights the gutter line number when the
 * mouse hovers over the corresponding content line.
 *
 * OVERLAY APPROACH: Instead of modifying gutter elements, create an
 * overlay element that covers the entire gutter row.
 */
export function gutterHoverSync(): Extension {
  return EditorView.domEventHandlers({
    mouseover(event, _view) {
      const target = event.target as HTMLElement;
      const line = target.closest('.cm-line') as HTMLElement | null;
      if (!line) return;

      const editor = line.closest('.cm-editor');
      if (!editor) return;

      const gutters = editor.querySelector('.cm-gutters') as HTMLElement | null;
      if (!gutters) return;

      // First, remove any existing overlay
      const existingOverlay = gutters.querySelector('.adl-gutter-hover-overlay');
      if (existingOverlay) existingOverlay.remove();

      // Check if this is a changed line
      const isChangedLine =
        line.classList.contains('cm-changedLine') ||
        line.classList.contains('cm-deletedLine') ||
        line.classList.contains('cm-insertedLine') ||
        line.closest('.cm-deletedChunk') !== null;

      // Get the vertical position of the hovered content line
      const lineRect = line.getBoundingClientRect();
      const guttersRect = gutters.getBoundingClientRect();

      // Find the matching line number gutter element to get exact position
      const lineNumbersGutter = gutters.querySelector('.cm-lineNumbers') as HTMLElement | null;
      let targetEl: HTMLElement | null = null;
      if (lineNumbersGutter) {
        const gutterEls = lineNumbersGutter.querySelectorAll<HTMLElement>(
          ':scope > .cm-gutterElement'
        );
        for (const gutterEl of gutterEls) {
          const gutterRect = gutterEl.getBoundingClientRect();
          const tolerance = 1;
          const overlaps = !(
            gutterRect.bottom - tolerance < lineRect.top ||
            gutterRect.top + tolerance > lineRect.bottom
          );
          if (overlaps) {
            targetEl = gutterEl;
            break;
          }
        }
      }

      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();

      // Create overlay that covers the entire gutter width at this line
      const overlay = document.createElement('div');
      overlay.className = 'adl-gutter-hover-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = targetRect.top - guttersRect.top + 'px';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.height = targetRect.height + 'px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '25';

      // Determine background color using CSS custom properties
      let bgColor: string;
      if (isChangedLine) {
        const mergeViewEditor = editor.closest('.cm-mergeViewEditor');
        const isDeleted = mergeViewEditor
          ? mergeViewEditor.parentElement?.classList.contains('cm-merge-a')
          : false;
        const deletedChunk = line.closest('.cm-deletedChunk');
        const isRemoveSide = isDeleted || !!deletedChunk;

        bgColor = isRemoveSide
          ? cssVar('--editor-diff-remove-hover', 'rgba(239, 68, 68, 0.35)')
          : cssVar('--editor-diff-insert-hover', 'rgba(34, 197, 94, 0.35)');
      } else {
        bgColor = cssVar('--editor-hover-bg', 'rgba(255, 255, 255, 0.08)');
      }

      overlay.style.backgroundColor = bgColor;

      // Ensure gutters have position: relative
      if (getComputedStyle(gutters).position === 'static') {
        gutters.style.position = 'relative';
      }

      gutters.appendChild(overlay);
    },

    mouseout(_event, _view) {
      if (typeof document === 'undefined') return;
      // Remove all temporary hover effects
      document.querySelectorAll('.adl-gutter-hover-overlay').forEach((el) => {
        el.remove();
      });
    },
  });
}
