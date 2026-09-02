import { useRef, useState, useCallback, useEffect } from 'react';
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
  const triggerRectRef = useRef<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
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

  const hide = useCallback(() => {
    setVisible(false);
    triggerRectRef.current = null;
  }, []);

  const show = useCallback(() => {
    const el = triggerRef.current;
    const rect = (el?.querySelector('button') ?? el)?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    triggerRectRef.current = rect;
    setVisible(true);
  }, []);

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
    setVisible((v) => !v);
  }, [cancelHoverTimer, cancelClose]);

  useEffect(() => {
    return () => {
      cancelHoverTimer();
      cancelClose();
    };
  }, [cancelHoverTimer, cancelClose]);

  const handleCardMouseEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

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
        triggerRect={triggerRectRef.current}
        placement={placement}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleCardMouseLeave}
      >
        {content}
      </HintCard>
    </span>
  );
}
