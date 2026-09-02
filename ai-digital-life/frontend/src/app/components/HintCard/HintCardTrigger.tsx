import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { HintCard } from './HintCard';
import type { Placement } from './hintCardPosition';

export const HINT_CLOSE_DELAY_MS = 80;

export interface HintCardTriggerProps {
  content: React.ReactNode;
  placement?: Placement;
  longHoverMs?: number;
  children: React.ReactNode;
}

export function HintCardTrigger({
  content,
  placement = 'auto',
  longHoverMs = 300,
  children,
}: HintCardTriggerProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== undefined) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = undefined;
    }
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const measureTrigger = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const child = el.firstElementChild as HTMLElement | null;
    const rect = child?.getBoundingClientRect() ?? el.getBoundingClientRect();
    if (rect) {
      setTriggerRect(rect);
    }
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setTriggerRect(null);
  }, []);

  const show = useCallback(() => {
    measureTrigger();
    setVisible(true);
  }, [measureTrigger]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(hide, HINT_CLOSE_DELAY_MS);
  }, [cancelClose, hide]);

  const handleMouseEnter = useCallback(() => {
    cancelClose();
    if (!visible) {
      cancelHoverTimer();
      hoverTimerRef.current = window.setTimeout(show, longHoverMs);
    }
  }, [cancelClose, visible, cancelHoverTimer, show, longHoverMs]);

  const handleMouseLeave = useCallback(() => {
    cancelHoverTimer();
    if (visible) {
      scheduleClose();
    }
  }, [cancelHoverTimer, visible, scheduleClose]);

  const handleClick = useCallback(() => {
    cancelHoverTimer();
    cancelClose();
    setVisible((v) => {
      if (!v) {
        measureTrigger();
      }
      return !v;
    });
  }, [cancelHoverTimer, cancelClose, measureTrigger]);

  useEffect(() => {
    return () => {
      cancelHoverTimer();
      cancelClose();
    };
  }, [cancelHoverTimer, cancelClose]);

  useLayoutEffect(() => {
    if (visible) {
      measureTrigger();
    }
  }, [visible, measureTrigger]);

  const handleCardMouseEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      const isToTrigger =
        related &&
        (triggerRef.current?.contains(related) || related.contains?.(triggerRef.current));
      if (isToTrigger) {
        return;
      }
      scheduleClose();
    },
    [scheduleClose],
  );

  return (
    <span
      ref={triggerRef}
      style={{ display: 'inline-flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
      <HintCard
        visible={visible}
        triggerRect={triggerRect}
        placement={placement}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleCardMouseLeave}
      >
        {content}
      </HintCard>
    </span>
  );
}
