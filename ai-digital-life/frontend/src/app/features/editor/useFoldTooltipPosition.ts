import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges } from '@codemirror/language';
import { formatT } from '@app/i18n/formatT';
import type { CopyDict } from '@app/i18n/types';

/* ── Helpers ──────────────────────────────────── */

export function getLineNumberFromEvent(view: EditorView, event: MouseEvent): number | null {
  const target = event.target as HTMLElement;
  const gutterEl = target.closest('.cm-gutterElement') as HTMLElement | null;
  if (gutterEl) {
    const rect = gutterEl.getBoundingClientRect();
    const pos = view.posAtCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    if (pos !== null) {
      return view.state.doc.lineAt(pos).number;
    }
  }
  const guttersEl = target.closest('.cm-gutters') as HTMLElement | null;
  if (guttersEl) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) {
      return view.state.doc.lineAt(pos).number;
    }
  }
  return null;
}

export function isLineFolded(view: EditorView, lineNum: number): boolean {
  let result = false;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    const endLine = view.state.doc.lineAt(_to).number;
    if (lineNum >= startLine && lineNum <= endLine) {
      result = true;
    }
  });
  return result;
}

export function isLineFoldable(view: EditorView, lineNum: number): boolean {
  const doc = view.state.doc;
  if (lineNum > doc.lines) {
    return false;
  }
  const line = doc.line(lineNum);
  if (foldable(view.state, line.from, line.to)) {
    return true;
  }
  let found = false;
  foldedRanges(view.state).between(0, doc.length, (_from, _to) => {
    const startLine = doc.lineAt(_from).number;
    if (lineNum === startLine) {
      found = true;
    }
  });
  return found;
}

export function getGutterRowAtY(
  gutters: HTMLElement,
  clientY: number
): { rowRect: DOMRect | null; hasFoldMarker: boolean } {
  const lineNumbers = gutters.querySelector('.cm-lineNumbers') as HTMLElement | null;
  const foldGutter = gutters.querySelector('.cm-foldGutter') as HTMLElement | null;

  let lineNumEl: HTMLElement | null = null;
  if (lineNumbers) {
    for (const el of lineNumbers.querySelectorAll<HTMLElement>(':scope > .cm-gutterElement')) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) {
        lineNumEl = el;
        break;
      }
    }
  }

  let hasMarker = false;
  if (foldGutter) {
    for (const el of foldGutter.querySelectorAll<HTMLElement>(':scope > .cm-gutterElement')) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) {
        hasMarker = el.querySelector('.adl-cm-fold-marker') !== null;
        break;
      }
    }
  }

  return {
    rowRect: lineNumEl ? lineNumEl.getBoundingClientRect() : null,
    hasFoldMarker: hasMarker,
  };
}

export function computeTooltipText(
  view: EditorView,
  lineNum: number,
  isClosed: boolean,
  t: CopyDict
): string | null {
  const doc = view.state.doc;
  if (lineNum > doc.lines) {
    return null;
  }

  if (isClosed) {
    let result: string | null = null;
    foldedRanges(view.state).between(0, doc.length, (_from, _to) => {
      const startLine = doc.lineAt(_from).number;
      const endLine = doc.lineAt(_to).number;
      if (lineNum >= startLine && lineNum <= endLine) {
        result = formatT(t, 'changesExpandToLine', { line: endLine });
      }
    });
    return result;
  }

  const line = doc.line(lineNum);
  const range = foldable(view.state, line.from, line.to);
  if (!range) {
    return null;
  }

  const endLine = doc.lineAt(range.to).number;
  if (endLine <= lineNum) {
    return null;
  }

  return formatT(t, 'changesCollapseToLine', { line: endLine });
}

export function computeTooltipFromPlaceholder(
  view: EditorView,
  placeholder: HTMLElement,
  t: CopyDict
): { text: string; rect: DOMRect } | null {
  const placeholderRect = placeholder.getBoundingClientRect();
  const pos = view.posAtCoords({
    x: placeholderRect.left + placeholderRect.width / 2,
    y: placeholderRect.top + placeholderRect.height / 2,
  });
  if (pos === null) {
    return null;
  }

  const lineNum = view.state.doc.lineAt(pos).number;
  if (lineNum > view.state.doc.lines) {
    return null;
  }
  if (!isLineFolded(view, lineNum)) {
    return null;
  }

  let endLine = lineNum;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    const e = view.state.doc.lineAt(_to).number;
    if (lineNum >= startLine && lineNum <= e) {
      endLine = e;
    }
  });

  const text = formatT(t, 'changesExpandToLine', { line: endLine });
  const rect = new DOMRect(
    placeholderRect.left,
    placeholderRect.top,
    placeholderRect.width,
    placeholderRect.height
  );
  return { text, rect };
}

export function getFoldStartRange(
  view: EditorView,
  lineNum: number
): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    if (lineNum === startLine) {
      result = { from: _from, to: _to };
    }
  });
  return result;
}

/* ── Tooltip ──────────────────────────────────── */

export function computeTooltipFromEvent(
  view: EditorView,
  event: MouseEvent,
  t: CopyDict
): { text: string; rect: DOMRect } | null {
  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) {
    return null;
  }

  const gutters = target.closest('.cm-gutters') as HTMLElement | null;
  if (!gutters) {
    return null;
  }

  const { rowRect, hasFoldMarker } = getGutterRowAtY(gutters, event.clientY);
  if (!rowRect) {
    return null;
  }
  if (!hasFoldMarker) {
    return null;
  }

  const lineNum = getLineNumberFromEvent(view, event);
  if (lineNum === null) {
    return null;
  }
  if (lineNum > view.state.doc.lines) {
    return null;
  }
  if (!isLineFoldable(view, lineNum)) {
    return null;
  }

  const isClosed = isLineFolded(view, lineNum);
  const text = computeTooltipText(view, lineNum, isClosed, t);
  if (!text) {
    return null;
  }

  const foldGutter = gutters.querySelector('.cm-foldGutter') as HTMLElement | null;
  const foldGutterRect = foldGutter?.getBoundingClientRect();
  if (!foldGutterRect) {
    return null;
  }

  const rect = new DOMRect(foldGutterRect.left, rowRect.top, foldGutterRect.width, rowRect.height);
  return { text, rect };
}

/* ── Gutter hover overlay ─────────────────────── */

const overlayCache = new WeakMap<HTMLElement, HTMLElement>();

function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

export function updateGutterHoverOverlay(view: EditorView, event: MouseEvent | null): void {
  const gutters = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
  if (!gutters) {
    return;
  }

  let overlay = overlayCache.get(gutters) ?? null;

  if (!event) {
    if (overlay) {
      overlay.remove();
      overlayCache.delete(gutters);
    }
    return;
  }

  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) {
    if (overlay) {
      overlay.remove();
      overlayCache.delete(gutters);
    }
    return;
  }

  const { rowRect } = getGutterRowAtY(gutters, event.clientY);
  if (!rowRect) {
    if (overlay) {
      overlay.remove();
      overlayCache.delete(gutters);
    }
    return;
  }

  const guttersRect = gutters.getBoundingClientRect();

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'adl-gutter-hover-overlay';
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '25';
    overlay.style.backgroundColor = cssVar('--editor-hover-bg', 'rgba(128,128,128,0.08)');
    document.body.appendChild(overlay);
    overlayCache.set(gutters, overlay);
  }

  overlay.style.left = guttersRect.left + 'px';
  overlay.style.width = guttersRect.width + 'px';
  overlay.style.top = rowRect.top + 'px';
  overlay.style.height = rowRect.height + 'px';
}

export function repositionOverlayOnScroll(view: EditorView): void {
  const gutters = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
  if (!gutters) {
    return;
  }
  const overlay = overlayCache.get(gutters);
  if (overlay) {
    const guttersRect = gutters.getBoundingClientRect();
    overlay.style.left = guttersRect.left + 'px';
    overlay.style.width = guttersRect.width + 'px';
  }
}

/* ── Tooltip Position Hook ────────────────────── */

export function useFoldTooltipPosition(
  rect: DOMRect | null,
  tooltipRef: React.RefObject<HTMLDivElement | null>
): { left: number; top: number; side: 'right' | 'left' } | null {
  if (!rect) {
    return null;
  }

  const el = tooltipRef.current;
  const tooltipWidth = el?.offsetWidth ?? 200;
  const gap = 8;
  const viewportWidth = window.innerWidth;

  const rightSpace = viewportWidth - rect.right - gap;
  const side: 'right' | 'left' = rightSpace >= tooltipWidth ? 'right' : 'left';
  const left = side === 'right' ? rect.right + gap : Math.max(gap, rect.left - tooltipWidth - gap);

  return { left, top: rect.top, side };
}
