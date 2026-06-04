import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges } from '@codemirror/language';

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

function getLineFromGutterElement(view: EditorView, gutterEl: HTMLElement): number | null {
  const rect = gutterEl.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const centerX = rect.left + rect.width / 2;
  const pos = view.posAtCoords({ x: centerX, y: centerY });
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  return line.number;
}

function getLineFromPlaceholder(view: EditorView, placeholderEl: HTMLElement): number | null {
  const rect = placeholderEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const pos = view.posAtCoords({ x: centerX, y: centerY });
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  return line.number;
}

function computeTooltipText(view: EditorView, lineNum: number, isClosed: boolean): string | null {
  const doc = view.state.doc;

  if (lineNum > doc.lines) return null;

  if (isClosed) {
    let result: string | null = null;
    foldedRanges(view.state).between(0, doc.length, (from, to) => {
      const startLine = doc.lineAt(from).number;
      const endLine = doc.lineAt(to).number;
      if (lineNum >= startLine && lineNum <= endLine) {
        result = `展开至${endLine}行`;
      }
    });
    return result;
  }

  const line = doc.line(lineNum);
  const range = foldable(view.state, line.from, line.to);
  if (!range) return null;

  const endPos = range.to > 0 ? range.to - 1 : 0;
  const endLine = doc.lineAt(endPos).number;
  if (endLine <= lineNum) return null;

  return `折叠至${endLine}行`;
}

function computePosition(
  triggerRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
): PositionState {
  const offset = 4;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const padding = 4;

  let side: 'right' | 'left' = 'right';
  const rightPos = triggerRect.right + offset;
  if (rightPos + tooltipWidth > viewportW - padding) {
    side = 'left';
  }

  let left: number;
  if (side === 'right') {
    left = rightPos;
    if (left < padding) left = padding;
  } else {
    left = triggerRect.left - tooltipWidth - offset;
    if (left < padding) left = padding;
  }

  let top = triggerRect.top;
  if (top + tooltipHeight > viewportH - padding) {
    top = viewportH - tooltipHeight - padding;
  }
  if (top < padding) {
    top = padding;
  }

  return { left, top, side };
}

export function FoldTooltipOverlay({ view }: FoldTooltipOverlayProps) {
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<PositionState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setTooltipState(null);
    setPosition(null);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(hide, 150);
  }, [hide]);

  useEffect(() => {
    if (!view) return;

    const gutter = view.dom.querySelector('.cm-foldGutter') as HTMLElement | null;
    const content = view.contentDOM;
    if (!gutter || !content) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches?.('.cm-foldPlaceholder')) {
              node.removeAttribute('title');
            }
            node.querySelectorAll?.('.cm-foldPlaceholder').forEach((el) => {
              el.removeAttribute('title');
            });
          }
        }
      }
    });
    observer.observe(content, { childList: true, subtree: true });

    content.querySelectorAll('.cm-foldPlaceholder').forEach((el) => {
      el.removeAttribute('title');
    });

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const gutterEl = target.closest('.cm-gutterElement') as HTMLElement | null;
      if (gutterEl) {
        const marker = gutterEl.querySelector('.adl-cm-fold-marker') as HTMLElement | null;
        if (marker) {
          if (hideTimerRef.current !== null) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }

          const lineNum = getLineFromGutterElement(view, gutterEl);
          if (lineNum === null) return;

          const isClosed = marker.classList.contains('adl-cm-fold-marker--closed');
          const text = computeTooltipText(view, lineNum, isClosed);
          if (!text) return;

          const rect = gutterEl.getBoundingClientRect();
          setTooltipState({ text, rect });
          return;
        }
      }

      const placeholder = target.closest('.cm-foldPlaceholder') as HTMLElement | null;
      if (placeholder) {
        placeholder.removeAttribute('title');

        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }

        const lineNum = getLineFromPlaceholder(view, placeholder);
        if (lineNum === null) return;

        const text = computeTooltipText(view, lineNum, true);
        if (!text) return;

        const rect = placeholder.getBoundingClientRect();
        setTooltipState({ text, rect });
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const gutterEl = target.closest('.cm-gutterElement') as HTMLElement | null;
      if (gutterEl && gutterEl.querySelector('.adl-cm-fold-marker')) {
        scheduleHide();
        return;
      }

      const placeholder = target.closest('.cm-foldPlaceholder') as HTMLElement | null;
      if (placeholder) {
        scheduleHide();
      }
    };

    const handleScroll = () => {
      hide();
    };

    gutter.addEventListener('mouseover', handleMouseOver);
    gutter.addEventListener('mouseout', handleMouseOut);
    content.addEventListener('mouseover', handleMouseOver);
    content.addEventListener('mouseout', handleMouseOut);

    return () => {
      observer.disconnect();
      gutter.removeEventListener('mouseover', handleMouseOver);
      gutter.removeEventListener('mouseout', handleMouseOut);
      content.removeEventListener('mouseover', handleMouseOver);
      content.removeEventListener('mouseout', handleMouseOut);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [view, hide, scheduleHide]);

  useLayoutEffect(() => {
    if (!tooltipState || !tooltipRef.current) {
      return;
    }

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
