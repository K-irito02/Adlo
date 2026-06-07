import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';

interface TooltipState {
  text: string;
  rect: DOMRect;
}

interface PositionState {
  left: number;
  top: number;
  side: 'right' | 'left';
}

interface FoldTooltipOverlayProps {
  view: EditorView | null;
}

/* ── Helpers ──────────────────────────────────── */

function getLineNumberFromEvent(view: EditorView, event: MouseEvent): number | null {
  const target = event.target as HTMLElement;
  const gutterEl = target.closest('.cm-gutterElement') as HTMLElement | null;
  if (gutterEl) {
    const rect = gutterEl.getBoundingClientRect();
    const pos = view.posAtCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    if (pos !== null) return view.state.doc.lineAt(pos).number;
  }
  const guttersEl = target.closest('.cm-gutters') as HTMLElement | null;
  if (guttersEl) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) return view.state.doc.lineAt(pos).number;
  }
  return null;
}

function isLineFolded(view: EditorView, lineNum: number): boolean {
  let result = false;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    const endLine = view.state.doc.lineAt(_to).number;
    if (lineNum >= startLine && lineNum <= endLine) result = true;
  });
  return result;
}

function isLineFoldable(view: EditorView, lineNum: number): boolean {
  const doc = view.state.doc;
  if (lineNum > doc.lines) return false;
  const line = doc.line(lineNum);
  if (foldable(view.state, line.from, line.to)) return true;
  let found = false;
  foldedRanges(view.state).between(0, doc.length, (_from, _to) => {
    const startLine = doc.lineAt(_from).number;
    if (lineNum === startLine) found = true;
  });
  return found;
}

/** Get the .cm-lineNumbers .cm-gutterElement and .cm-foldGutter .cm-gutterElement
 *  at the given Y coordinate. Returns { rowRect, hasFoldMarker }. */
function getGutterRowAtY(gutters: HTMLElement, clientY: number): { rowRect: DOMRect | null; hasFoldMarker: boolean } {
  const lineNumbers = gutters.querySelector('.cm-lineNumbers') as HTMLElement | null;
  const foldGutter = gutters.querySelector('.cm-foldGutter') as HTMLElement | null;

  /* Find the line number gutter element at this Y */
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

  /* Check if the fold gutter has a marker at this Y */
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

  return { rowRect: lineNumEl ? lineNumEl.getBoundingClientRect() : null, hasFoldMarker: hasMarker };
}

function computeTooltipText(view: EditorView, lineNum: number, isClosed: boolean): string | null {
  const doc = view.state.doc;
  if (lineNum > doc.lines) return null;

  if (isClosed) {
    let result: string | null = null;
    foldedRanges(view.state).between(0, doc.length, (_from, _to) => {
      const startLine = doc.lineAt(_from).number;
      const endLine = doc.lineAt(_to).number;
      if (lineNum >= startLine && lineNum <= endLine) {
        result = `展开至${endLine}行`;
      }
    });
    return result;
  }

  const line = doc.line(lineNum);
  const range = foldable(view.state, line.from, line.to);
  if (!range) return null;

  const endLine = doc.lineAt(range.to).number;
  if (endLine <= lineNum) return null;

  return `折叠至${endLine}行`;
}

/** Compute tooltip for a .cm-foldPlaceholder element in the content area.
 *  The placeholder appears when code is folded, so the tooltip always says "展开至N行". */
function computeTooltipFromPlaceholder(view: EditorView, placeholder: HTMLElement): { text: string; rect: DOMRect } | null {
  const placeholderRect = placeholder.getBoundingClientRect();
  const pos = view.posAtCoords({ x: placeholderRect.left + placeholderRect.width / 2, y: placeholderRect.top + placeholderRect.height / 2 });
  if (pos === null) return null;

  const lineNum = view.state.doc.lineAt(pos).number;
  if (lineNum > view.state.doc.lines) return null;
  if (!isLineFolded(view, lineNum)) return null;

  let endLine = lineNum;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    const e = view.state.doc.lineAt(_to).number;
    if (lineNum >= startLine && lineNum <= e) {
      endLine = e;
    }
  });

  const text = `展开至${endLine}行`;
  const rect = new DOMRect(placeholderRect.left, placeholderRect.top, placeholderRect.width, placeholderRect.height);
  return { text, rect };
}

function getFoldStartRange(view: EditorView, lineNum: number): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    if (lineNum === startLine) result = { from: _from, to: _to };
  });
  return result;
}

function computePosition(triggerRect: DOMRect, tooltipWidth: number, tooltipHeight: number): PositionState {
  const offset = 4;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const padding = 4;
  let side: 'right' | 'left' = 'right';
  const rightPos = triggerRect.right + offset;
  if (rightPos + tooltipWidth > viewportW - padding) side = 'left';
  let left: number;
  if (side === 'right') {
    left = rightPos;
    if (left < padding) left = padding;
  } else {
    left = triggerRect.left - tooltipWidth - offset;
    if (left < padding) left = padding;
  }
  let top = triggerRect.top;
  if (top + tooltipHeight > viewportH - padding) top = viewportH - tooltipHeight - padding;
  if (top < padding) top = padding;
  return { left, top, side };
}

/* ── Gutter fold/unfold ───────────────────────── */

function handleGutterFold(view: EditorView, event: MouseEvent): boolean {
  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) return false;

  const gutters = target.closest('.cm-gutters') as HTMLElement | null;
  if (!gutters) return false;
  const { hasFoldMarker } = getGutterRowAtY(gutters, event.clientY);
  if (!hasFoldMarker) return false;

  const lineNum = getLineNumberFromEvent(view, event);
  if (lineNum === null) return false;
  const doc = view.state.doc;
  if (lineNum > doc.lines) return false;
  const docLine = doc.line(lineNum);
  const foldRange = getFoldStartRange(view, lineNum);
  if (foldRange) {
    view.dispatch({ effects: unfoldEffect.of(foldRange) });
    event.preventDefault(); event.stopPropagation();
    return true;
  }
  const range = foldable(view.state, docLine.from, docLine.to);
  if (range) {
    view.dispatch({ effects: foldEffect.of(range) });
    event.preventDefault(); event.stopPropagation();
    return true;
  }
  return false;
}

/* ── Tooltip ──────────────────────────────────── */

/** Compute tooltip state for gutter hover.
 *  Tooltip position is anchored to the fold gutter column.
 *  Uses DOM .cm-lineNumbers > .cm-gutterElement for pixel-perfect row positioning. */
function computeTooltipFromEvent(view: EditorView, event: MouseEvent): { text: string; rect: DOMRect } | null {
  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) return null;

  const gutters = target.closest('.cm-gutters') as HTMLElement | null;
  if (!gutters) return null;

  const { rowRect, hasFoldMarker } = getGutterRowAtY(gutters, event.clientY);
  if (!rowRect) return null;
  if (!hasFoldMarker) return null;

  const lineNum = getLineNumberFromEvent(view, event);
  if (lineNum === null) return null;
  if (lineNum > view.state.doc.lines) return null;
  if (!isLineFoldable(view, lineNum)) return null;

  const isClosed = isLineFolded(view, lineNum);
  const text = computeTooltipText(view, lineNum, isClosed);
  if (!text) return null;

  const foldGutter = gutters.querySelector('.cm-foldGutter') as HTMLElement | null;
  const foldGutterRect = foldGutter?.getBoundingClientRect();
  if (!foldGutterRect) return null;

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

function updateGutterHoverOverlay(view: EditorView, event: MouseEvent | null): void {
  const gutters = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
  if (!gutters) return;

  let overlay = overlayCache.get(gutters) ?? null;

  if (!event) {
    if (overlay) { overlay.remove(); overlayCache.delete(gutters); }
    return;
  }

  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) {
    if (overlay) { overlay.remove(); overlayCache.delete(gutters); }
    return;
  }

  const { rowRect, hasFoldMarker } = getGutterRowAtY(gutters, event.clientY);
  if (!rowRect) {
    if (overlay) { overlay.remove(); overlayCache.delete(gutters); }
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

/* ── Component ────────────────────────────────── */

export function FoldTooltipOverlay({ view }: FoldTooltipOverlayProps) {
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<PositionState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipVisibleRef = useRef(false);
  const lastMouseEventRef = useRef<MouseEvent | null>(null);

  const hide = useCallback(() => {
    if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    tooltipVisibleRef.current = false;
    setTooltipState(null); setPosition(null);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(hide, 150);
  }, [hide]);

  const repositionOverlay = useCallback(() => {
    if (!view) return;
    const me = lastMouseEventRef.current;
    if (me && (me.target as HTMLElement).closest?.('.cm-gutters')) {
      updateGutterHoverOverlay(view, me);
    }
  }, [view]);

  const repositionRef = useRef(repositionOverlay);
  repositionRef.current = repositionOverlay;

  useEffect(() => {
    if (!view) return;

    const editorDom = view.dom;
    const content = view.contentDOM;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches?.('.cm-foldPlaceholder')) node.removeAttribute('title');
            node.querySelectorAll?.('.cm-foldPlaceholder').forEach((el) => el.removeAttribute('title'));
          }
        }
      }
    });
    if (content) {
      observer.observe(content, { childList: true, subtree: true });
      content.querySelectorAll('.cm-foldPlaceholder').forEach((el) => el.removeAttribute('title'));
    }

    let rafId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseEventRef.current = e;
      if (!editorDom.contains(e.target as HTMLElement)) return;

      const target = e.target as HTMLElement;

      if (!target.closest('.cm-gutters')) {
        if (rafId) cancelAnimationFrame(rafId);
        updateGutterHoverOverlay(view, null);

        const placeholder = target.closest('.cm-foldPlaceholder') as HTMLElement | null;
        if (placeholder) {
          const result = computeTooltipFromPlaceholder(view, placeholder);
          if (result) {
            if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
            tooltipVisibleRef.current = true;
            setTooltipState({ text: result.text, rect: result.rect });
            return;
          }
        }

        if (tooltipVisibleRef.current) {
          if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
          hide();
        }
        return;
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateGutterHoverOverlay(view, e);
        rafId = 0;
      });

      const result = computeTooltipFromEvent(view, e);
      if (result) {
        if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        tooltipVisibleRef.current = true;
        setTooltipState({ text: result.text, rect: result.rect });
      } else if (tooltipVisibleRef.current) {
        if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        hide();
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (!editorDom.contains(e.target as HTMLElement)) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related && editorDom.contains(related)) return;
      lastMouseEventRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      updateGutterHoverOverlay(view, null);
      scheduleHide();
    };

    const captureMouseDown = (e: MouseEvent) => {
      if (!editorDom.contains(e.target as HTMLElement)) return;
      if (!(e.target as HTMLElement).closest('.cm-gutters')) return;
      handleGutterFold(view, e);
      requestAnimationFrame(() => repositionRef.current());
    };

    editorDom.addEventListener('mousemove', handleMouseMove);
    editorDom.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mousedown', captureMouseDown, true);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      updateGutterHoverOverlay(view, null);
      tooltipVisibleRef.current = false;
      lastMouseEventRef.current = null;
      editorDom.removeEventListener('mousemove', handleMouseMove);
      editorDom.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mousedown', captureMouseDown, true);
      if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [view, scheduleHide]);

  useEffect(() => {
    if (!view) return;
    const editorDom = view.dom;
    const handleScroll = () => {
      const gutters = editorDom.querySelector('.cm-gutters') as HTMLElement | null;
      if (!gutters) return;
      const overlay = overlayCache.get(gutters);
      if (overlay) {
        const guttersRect = gutters.getBoundingClientRect();
        overlay.style.left = guttersRect.left + 'px';
        overlay.style.width = guttersRect.width + 'px';
      }
    };
    editorDom.addEventListener('scroll', handleScroll, true);
    return () => editorDom.removeEventListener('scroll', handleScroll, true);
  }, [view]);

  useLayoutEffect(() => {
    if (!tooltipState || !tooltipRef.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const pos = computePosition(tooltipState.rect, tooltipRect.width, tooltipRect.height);
    setPosition(pos);
  }, [tooltipState]);

  const isVisible = tooltipState !== null && position !== null;
  const side = position?.side ?? 'right';
  const style: React.CSSProperties = position
    ? { position: 'fixed', left: position.left, top: position.top }
    : { position: 'fixed', left: -9999, top: -9999, visibility: 'hidden' };

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      data-state={isVisible ? 'open' : 'closed'}
      data-side={side}
      className="tooltip"
      style={style}
    >
      <span className="tooltip__arrow" />
      <span className="tooltip__content">{tooltipState?.text}</span>
    </div>,
    document.body
  );
}
