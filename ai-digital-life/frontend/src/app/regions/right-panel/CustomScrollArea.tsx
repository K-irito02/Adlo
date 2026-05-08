import React, { useCallback, useEffect, useRef } from "react";

type CustomScrollAreaProps = {
  shellClassName: string;
  scrollClassName: string;
  scrollbarClassName: string;
  thumbClassName: string;
  children: React.ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function CustomScrollArea({
  shellClassName,
  scrollClassName,
  scrollbarClassName,
  thumbClassName,
  children
}: CustomScrollAreaProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement | null>(null);

  const updateScrollbar = useCallback(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!root || !scroll || !thumb) {
      return;
    }
    const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
    const isScrollable = maxScrollTop > 1;
    root.classList.toggle("is-scrollable", isScrollable);
    if (!isScrollable) {
      thumb.style.height = "0px";
      thumb.style.transform = "translateY(0px)";
      return;
    }
    const trackHeight = scroll.clientHeight;
    const thumbHeight = Math.max(24, Math.round((scroll.clientHeight / scroll.scrollHeight) * trackHeight));
    const maxThumbTop = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = Math.round((scroll.scrollTop / maxScrollTop) * maxThumbTop);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) {
      return;
    }
    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateScrollbar();
      });
    };

    scheduleUpdate();
    scroll.addEventListener("scroll", scheduleUpdate, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(scroll);
    if (scroll.firstElementChild) {
      observer?.observe(scroll.firstElementChild);
    }
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      scroll.removeEventListener("scroll", scheduleUpdate);
      observer?.disconnect();
    };
  }, [children, updateScrollbar]);

  const handleScrollbarPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const scroll = scrollRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!scroll || !thumb || scroll.scrollHeight <= scroll.clientHeight) {
      return;
    }
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture(event.pointerId);
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const pointerInsideThumb = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    const thumbOffset = pointerInsideThumb ? event.clientY - thumbRect.top : thumbRect.height / 2;

    const applyClientY = (clientY: number) => {
      const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
      const maxThumbTop = Math.max(1, trackRect.height - thumbRect.height);
      const nextThumbTop = clamp(clientY - trackRect.top - thumbOffset, 0, maxThumbTop);
      scroll.scrollTop = Math.round((nextThumbTop / maxThumbTop) * maxScrollTop);
      updateScrollbar();
    };

    applyClientY(event.clientY);

    const handleMove = (moveEvent: PointerEvent) => applyClientY(moveEvent.clientY);
    const cleanup = (upEvent: PointerEvent) => {
      if (track.hasPointerCapture(upEvent.pointerId)) {
        track.releasePointerCapture(upEvent.pointerId);
      }
      track.removeEventListener("pointermove", handleMove);
      track.removeEventListener("pointerup", cleanup);
      track.removeEventListener("pointercancel", cleanup);
      track.removeEventListener("lostpointercapture", cleanup);
    };

    track.addEventListener("pointermove", handleMove);
    track.addEventListener("pointerup", cleanup);
    track.addEventListener("pointercancel", cleanup);
    track.addEventListener("lostpointercapture", cleanup);
  }, [updateScrollbar]);

  return (
    <div ref={rootRef} className={shellClassName}>
      <div ref={scrollRef} className={scrollClassName}>
        {children}
      </div>
      <div
        className={scrollbarClassName}
        aria-hidden="true"
        onPointerDown={handleScrollbarPointerDown}
      >
        <div ref={scrollbarThumbRef} className={thumbClassName} />
      </div>
    </div>
  );
}
