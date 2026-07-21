import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface HintCardTriggerProps {
  content: string;
  children: React.ReactNode;
  longHoverMs?: number;
}

/** Delay before auto-closing the hint card after mouse leaves trigger/card. */
export const HINT_CLOSE_DELAY_MS = 80;

interface PositionStyle {
  card: React.CSSProperties;
  arrow: React.CSSProperties;
  arrowBorder: React.CSSProperties;
}

type Direction = 'up' | 'down';

/**
 * Reusable "!" hint card trigger.
 *
 * - Long hover (600ms by default) → shows the hint card
 * - Click → toggles the hint card immediately
 * - Card is interactive: hoverable, clickable, text-selectable
 * - Card auto-closes when mouse leaves both trigger and card
 * - Card auto-repositions to stay within viewport boundaries
 *
 * Uses the project's `adl-sub-hint-card` CSS for styling (loaded globally
 * via index.css → rightpanel.css → files-panel.css → file-operations.css).
 */
export function HintCardTrigger({ content, children, longHoverMs = 600 }: HintCardTriggerProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const adjustedRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<PositionStyle | null>(null);
  const [dir, setDir] = useState<Direction>('up');
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
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

  const computePosition = useCallback((): PositionStyle | null => {
    const btn = triggerRef.current?.querySelector('button');
    const rect = (btn || triggerRef.current)?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    return {
      card: {
        left: rect.left,
        top: rect.bottom + 5,
      },
      arrow: {
        left: rect.left + rect.width / 2 - 4,
        top: rect.bottom,
      },
      arrowBorder: {
        left: rect.left + rect.width / 2 - 5,
        top: rect.bottom - 1,
      },
    };
  }, []);

  const show = useCallback(() => {
    adjustedRef.current = false;
    setDir('up');
    const p = computePosition();
    if (p) {
      setPos(p);
      setVisible(true);
    }
  }, [computePosition]);

  const hide = useCallback(() => {
    setVisible(false);
    setPos(null);
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
    if (visible) {
      hide();
    } else {
      show();
    }
  }, [cancelHoverTimer, cancelClose, visible, hide, show]);

  useEffect(() => {
    return () => {
      cancelHoverTimer();
      cancelClose();
    };
  }, [cancelHoverTimer, cancelClose]);

  // Measure card after render and reposition to stay within viewport
  useLayoutEffect(() => {
    if (!visible || !pos || adjustedRef.current) {
      return;
    }

    const cardEl = cardRef.current;
    if (!cardEl) {
      return;
    }

    const cardRect = cardEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btn = triggerRef.current?.querySelector('button');
    const btnRect = (btn || triggerRef.current)?.getBoundingClientRect();
    if (!btnRect) {
      return;
    }

    const newCard: React.CSSProperties = { ...pos.card };
    const newArrow: React.CSSProperties = { ...pos.arrow };
    const newArrowBorder: React.CSSProperties = { ...pos.arrowBorder };
    let needsAdjust = false;
    let newDir = dir;

    // Horizontal: shift card left/right to stay within viewport
    if (cardRect.right > vw) {
      const shift = cardRect.right - vw + 4;
      newCard.left = (newCard.left as number) - shift;
      needsAdjust = true;
    }
    if ((newCard.left as number) < 4) {
      newCard.left = 4;
      needsAdjust = true;
    }

    // Vertical: flip above if card extends below viewport
    if (cardRect.bottom > vh) {
      newCard.top = btnRect.top - cardRect.height - 5;
      newArrow.top = btnRect.top - 5;
      newArrowBorder.top = btnRect.top - 6;
      newDir = 'down';
      needsAdjust = true;
    }

    if (needsAdjust) {
      adjustedRef.current = true;
      setPos({ card: newCard, arrow: newArrow, arrowBorder: newArrowBorder });
      setDir(newDir);
    }
  }, [visible, pos, dir]);

  const cardClass =
    dir === 'up'
      ? 'adl-sub-hint-card adl-sub-hint-card--up'
      : 'adl-sub-hint-card adl-sub-hint-card--down';
  const arrowClass =
    dir === 'up'
      ? 'adl-sub-hint-card__arrow adl-sub-hint-card__arrow--up'
      : 'adl-sub-hint-card__arrow adl-sub-hint-card__arrow--down';
  const arrowBorderClass =
    dir === 'up'
      ? 'adl-sub-hint-card__arrow-border adl-sub-hint-card__arrow-border--up'
      : 'adl-sub-hint-card__arrow-border adl-sub-hint-card__arrow-border--down';

  return (
    <span
      ref={triggerRef}
      style={{ display: 'inline-flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
      {visible &&
        pos &&
        createPortal(
          <>
            <div
              ref={cardRef}
              className={cardClass}
              style={{ ...pos.card, pointerEvents: 'auto', userSelect: 'text' }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              onClick={(e) => e.stopPropagation()}
            >
              {content}
            </div>
            <div className={arrowClass} style={pos.arrow} />
            <div className={arrowBorderClass} style={pos.arrowBorder} />
          </>,
          document.body,
        )}
    </span>
  );
}
