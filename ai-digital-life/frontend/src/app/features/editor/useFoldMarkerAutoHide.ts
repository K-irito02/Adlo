import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { forceParsing } from '@codemirror/language';
import { foldGutterCompartment } from '../diff-viewer/sharedExtensions';
import { createFoldGutterExtension } from './cmFoldGutter';

export type FoldMarkerState = 'hidden' | 'visible';

const REVEAL_DURATION_MS = 1000;
const HIDE_DELAY_MS = 300;
const POLL_INTERVAL_MS = 100;
const FORCE_PARSE_TIMEOUT_MS = 1500;
const MAX_FORCE_PARSE_ATTEMPTS = 60;
const MAX_VISIBLE_DURATION_MS = 5000;

function hasFoldGutterMarkers(container: HTMLElement): boolean {
  const marker = container.querySelector<HTMLElement>(
    '.cm-foldGutter > .cm-gutterElement:nth-child(n+2) .adl-cm-fold-marker'
  );
  return marker !== null;
}

function bindGutterListeners(
  gutters: HTMLElement[],
  handlers: { onEnter: () => void; onLeave: () => void }
): () => void {
  for (const gutter of gutters) {
    gutter.addEventListener('mouseenter', handlers.onEnter);
    gutter.addEventListener('mouseleave', handlers.onLeave);
  }
  return () => {
    for (const gutter of gutters) {
      gutter.removeEventListener('mouseenter', handlers.onEnter);
      gutter.removeEventListener('mouseleave', handlers.onLeave);
    }
  };
}

export function useFoldMarkerAutoHide(
  containerRef: React.RefObject<HTMLElement | null>,
  fileKey: string,
  editorView?: EditorView | null
): FoldMarkerState {
  const [state, setState] = useState<FoldMarkerState>('hidden');
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const revealingRef = useRef(false);
  const maxVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (hideDelayTimerRef.current !== null) {
      clearTimeout(hideDelayTimerRef.current);
      hideDelayTimerRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (maxVisibleTimerRef.current !== null) {
      clearTimeout(maxVisibleTimerRef.current);
      maxVisibleTimerRef.current = null;
    }
    pollCountRef.current = 0;
    revealingRef.current = false;
  }, []);

  const show = useCallback(() => {
    clearTimers();
    setState('visible');
  }, [clearTimers]);

  const scheduleHide = useCallback(() => {
    if (hideDelayTimerRef.current !== null) {
      clearTimeout(hideDelayTimerRef.current);
    }
    hideDelayTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setState('hidden');
      }
    }, HIDE_DELAY_MS);
  }, []);

  const startRevealTimer = useCallback(() => {
    if (revealingRef.current) {
      return;
    }
    revealingRef.current = true;
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current);
    }
    revealTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setState('hidden');
      }
    }, REVEAL_DURATION_MS);
  }, []);

  useEffect(() => {
    setState('visible');
    revealingRef.current = false;
    pollCountRef.current = 0;

    maxVisibleTimerRef.current = setTimeout(() => {
      if (!revealingRef.current) {
        setState('hidden');
      }
    }, MAX_VISIBLE_DURATION_MS);

    const el = containerRef.current;
    const view = editorView ?? null;

    if (el && hasFoldGutterMarkers(el)) {
      startRevealTimer();
    }

    let markerObserver: MutationObserver | null = null;
    if (el) {
      markerObserver = new MutationObserver(() => {
        if (hasFoldGutterMarkers(el) && !revealingRef.current) {
          startRevealTimer();
          markerObserver?.disconnect();
          if (pollTimerRef.current !== null) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          pollCountRef.current = 0;
        }
      });
      markerObserver.observe(el, { childList: true, subtree: true });
    }

    const poll = () => {
      pollCountRef.current++;

      if (el && hasFoldGutterMarkers(el)) {
        if (!revealingRef.current) {
          startRevealTimer();
        }
      }

      if (view) {
        const doReconfigure = () => {
          view.dispatch({
            effects: foldGutterCompartment.reconfigure(createFoldGutterExtension()),
          });
        };
        Promise.resolve(forceParsing(view, view.state.doc.length, FORCE_PARSE_TIMEOUT_MS)).then(
          doReconfigure
        );
      }

      if (pollCountRef.current >= MAX_FORCE_PARSE_ATTEMPTS) {
        markerObserver?.disconnect();
        if (!revealingRef.current) {
          setState('hidden');
        }
        return;
      }

      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();

    return () => {
      markerObserver?.disconnect();
      clearTimers();
    };
  }, [fileKey, containerRef, editorView, clearTimers, startRevealTimer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const handlers = {
      onEnter: () => {
        isHoveringRef.current = true;
        show();
      },
      onLeave: () => {
        isHoveringRef.current = false;
        scheduleHide();
      },
    };

    const gutters = Array.from(el.querySelectorAll<HTMLElement>('.cm-foldGutter'));
    if (gutters.length > 0) {
      listenerCleanupRef.current = bindGutterListeners(gutters, handlers);
    }

    const gutterObserver = new MutationObserver(() => {
      const newGutters = Array.from(el.querySelectorAll<HTMLElement>('.cm-foldGutter'));
      const currentCount = gutters.length;
      if (
        newGutters.length !== currentCount ||
        newGutters.some((g, i) => g.children.length !== gutters[i]?.children.length)
      ) {
        if (listenerCleanupRef.current) {
          listenerCleanupRef.current();
        }
        gutters.length = 0;
        gutters.push(...newGutters);
        if (gutters.length > 0) {
          listenerCleanupRef.current = bindGutterListeners(gutters, handlers);
        }
      }
    });
    gutterObserver.observe(el, { childList: true, subtree: true });

    return () => {
      gutterObserver.disconnect();
      if (listenerCleanupRef.current) {
        listenerCleanupRef.current();
        listenerCleanupRef.current = null;
      }
    };
  }, [containerRef, fileKey, show, scheduleHide]);

  return state;
}
