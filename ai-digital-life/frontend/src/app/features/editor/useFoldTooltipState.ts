import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';
import { useTCopy } from '@app/i18n/useTCopy';
import {
  computeTooltipFromEvent,
  computeTooltipFromPlaceholder,
  updateGutterHoverOverlay,
  repositionOverlayOnScroll,
  getGutterRowAtY,
  getLineNumberFromEvent,
  getFoldStartRange,
} from './useFoldTooltipPosition';

export interface TooltipState {
  text: string;
  rect: DOMRect;
}

/* ── Gutter fold/unfold ───────────────────────── */

function handleGutterFold(view: EditorView, event: MouseEvent): boolean {
  const target = event.target as HTMLElement;
  if (target.closest('.cm-deletedLineGutter')) {
    return false;
  }

  const gutters = target.closest('.cm-gutters') as HTMLElement | null;
  if (!gutters) {
    return false;
  }
  const { hasFoldMarker } = getGutterRowAtY(gutters, event.clientY);
  if (!hasFoldMarker) {
    return false;
  }

  const lineNum = getLineNumberFromEvent(view, event);
  if (lineNum === null) {
    return false;
  }
  const doc = view.state.doc;
  if (lineNum > doc.lines) {
    return false;
  }
  const docLine = doc.line(lineNum);
  const foldRange = getFoldStartRange(view, lineNum);
  if (foldRange) {
    view.dispatch({ effects: unfoldEffect.of(foldRange) });
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  const range = foldable(view.state, docLine.from, docLine.to);
  if (range) {
    view.dispatch({ effects: foldEffect.of(range) });
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

/* ── Hook ─────────────────────────────────────── */

export function useFoldTooltipState(view: EditorView | null): {
  tooltip: TooltipState | null;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
} {
  const { t } = useTCopy();
  const tRef = useRef(t);
  tRef.current = t;

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipVisibleRef = useRef(false);
  const lastMouseEventRef = useRef<MouseEvent | null>(null);

  const hide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    tooltipVisibleRef.current = false;
    setTooltip(null);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(hide, 150);
  }, [hide]);

  const repositionOverlay = useCallback(() => {
    if (!view) {
      return;
    }
    const me = lastMouseEventRef.current;
    if (me && (me.target as HTMLElement).closest?.('.cm-gutters')) {
      updateGutterHoverOverlay(view, me);
    }
  }, [view]);

  const repositionRef = useRef(repositionOverlay);
  repositionRef.current = repositionOverlay;

  useEffect(() => {
    if (!view) {
      return;
    }

    const editorDom = view.dom;
    const content = view.contentDOM;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches?.('.cm-foldPlaceholder')) {
              node.removeAttribute('title');
            }
            node
              .querySelectorAll?.('.cm-foldPlaceholder')
              .forEach((el) => el.removeAttribute('title'));
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
      if (!editorDom.contains(e.target as HTMLElement)) {
        return;
      }

      const target = e.target as HTMLElement;

      if (!target.closest('.cm-gutters')) {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        updateGutterHoverOverlay(view, null);

        const placeholder = target.closest('.cm-foldPlaceholder') as HTMLElement | null;
        if (placeholder) {
          const result = computeTooltipFromPlaceholder(view, placeholder, tRef.current);
          if (result) {
            if (hideTimerRef.current !== null) {
              clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
            tooltipVisibleRef.current = true;
            setTooltip({ text: result.text, rect: result.rect });
            return;
          }
        }

        if (tooltipVisibleRef.current) {
          if (hideTimerRef.current !== null) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          hide();
        }
        return;
      }

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateGutterHoverOverlay(view, e);
        rafId = 0;
      });

      const result = computeTooltipFromEvent(view, e, tRef.current);
      if (result) {
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        tooltipVisibleRef.current = true;
        setTooltip({ text: result.text, rect: result.rect });
      } else if (tooltipVisibleRef.current) {
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        hide();
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (!editorDom.contains(e.target as HTMLElement)) {
        return;
      }
      const related = e.relatedTarget as HTMLElement | null;
      if (related && editorDom.contains(related)) {
        return;
      }
      lastMouseEventRef.current = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      updateGutterHoverOverlay(view, null);
      scheduleHide();
    };

    const captureMouseDown = (e: MouseEvent) => {
      if (!editorDom.contains(e.target as HTMLElement)) {
        return;
      }

      if ((e.target as HTMLElement).closest('.cm-gutters')) {
        handleGutterFold(view, e);
        requestAnimationFrame(() => repositionRef.current());
        return;
      }

      const placeholder = (e.target as HTMLElement).closest(
        '.cm-foldPlaceholder'
      ) as HTMLElement | null;
      if (placeholder) {
        const rect = placeholder.getBoundingClientRect();
        const pos = view.posAtCoords({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        if (pos !== null) {
          let targetRange: { from: number; to: number } | null = null;
          foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
            if (pos >= from && pos <= to) {
              targetRange = { from, to };
            }
          });
          if (targetRange) {
            view.dispatch({ effects: unfoldEffect.of(targetRange) });
            e.preventDefault();
            e.stopPropagation();
            requestAnimationFrame(() => repositionRef.current());
          }
        }
      }
    };

    editorDom.addEventListener('mousemove', handleMouseMove);
    editorDom.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mousedown', captureMouseDown, true);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      updateGutterHoverOverlay(view, null);
      tooltipVisibleRef.current = false;
      lastMouseEventRef.current = null;
      editorDom.removeEventListener('mousemove', handleMouseMove);
      editorDom.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mousedown', captureMouseDown, true);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [view, scheduleHide, hide]);

  useEffect(() => {
    if (!view) {
      return;
    }
    const editorDom = view.dom;
    const handleScroll = () => repositionOverlayOnScroll(view);
    editorDom.addEventListener('scroll', handleScroll, true);
    return () => editorDom.removeEventListener('scroll', handleScroll, true);
  }, [view]);

  return { tooltip, tooltipRef };
}
