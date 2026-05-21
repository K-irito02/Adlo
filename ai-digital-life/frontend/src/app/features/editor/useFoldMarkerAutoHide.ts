import { useCallback, useEffect, useRef, useState } from "react";

export type FoldMarkerState = "hidden" | "visible";

const REVEAL_DURATION_MS = 1000;
const HIDE_DELAY_MS = 300;

function findGutters(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(".cm-foldGutter"));
}

function bindGutterListeners(
  gutters: HTMLElement[],
  handlers: { onEnter: () => void; onLeave: () => void },
): () => void {
  for (const gutter of gutters) {
    gutter.addEventListener("mouseenter", handlers.onEnter);
    gutter.addEventListener("mouseleave", handlers.onLeave);
  }
  return () => {
    for (const gutter of gutters) {
      gutter.removeEventListener("mouseenter", handlers.onEnter);
      gutter.removeEventListener("mouseleave", handlers.onLeave);
    }
  };
}

export function useFoldMarkerAutoHide(
  containerEl: HTMLElement | null,
  fileKey: string,
): FoldMarkerState {
  const [state, setState] = useState<FoldMarkerState>("hidden");
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (hideDelayTimerRef.current !== null) {
      clearTimeout(hideDelayTimerRef.current);
      hideDelayTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimers();
    setState("visible");
  }, [clearTimers]);

  const scheduleHide = useCallback(() => {
    if (hideDelayTimerRef.current !== null) {
      clearTimeout(hideDelayTimerRef.current);
    }
    hideDelayTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setState("hidden");
      }
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    show();
    revealTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setState("hidden");
      }
    }, REVEAL_DURATION_MS);
    return () => {
      clearTimers();
    };
  }, [fileKey, show, clearTimers]);

  useEffect(() => {
    if (!containerEl) return;

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

    const tryBind = (): boolean => {
      const gutters = findGutters(containerEl!);
      if (gutters.length === 0) return false;
      cleanupRef.current = bindGutterListeners(gutters, handlers);
      return true;
    };

    if (tryBind()) return cleanupRef.current!;

    const observer = new MutationObserver(() => {
      if (tryBind()) {
        observer.disconnect();
      }
    });

    observer.observe(containerEl, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [containerEl, fileKey, show, scheduleHide]);

  return state;
}