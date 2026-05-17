import { useCallback, useEffect, useRef, useState } from "react";

export type FoldMarkerState = "hidden" | "visible";

const REVEAL_DURATION_MS = 1000;
const HIDE_DELAY_MS = 300;

function findGutters(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(".cm-foldGutter"));
}

export function useFoldMarkerAutoHide(
  containerEl: HTMLElement | null,
  fileKey: string,
): FoldMarkerState {
  const [state, setState] = useState<FoldMarkerState>("hidden");
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

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

    const gutters = findGutters(containerEl);
    if (gutters.length === 0) return;

    const handleMouseEnter = () => {
      isHoveringRef.current = true;
      show();
    };

    const handleMouseLeave = () => {
      isHoveringRef.current = false;
      scheduleHide();
    };

    for (const gutter of gutters) {
      gutter.addEventListener("mouseenter", handleMouseEnter);
      gutter.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      for (const gutter of gutters) {
        gutter.removeEventListener("mouseenter", handleMouseEnter);
        gutter.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [containerEl, fileKey, show, scheduleHide]);

  return state;
}