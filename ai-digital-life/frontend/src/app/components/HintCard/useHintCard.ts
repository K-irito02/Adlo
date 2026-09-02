import { useRef, useState, useCallback } from 'react';
import { HINT_CLOSE_DELAY_MS } from './HintCardTrigger';

export interface HintState {
  content: string;
  triggerRect: DOMRect;
}

export function useHintCard(closeDelayMs: number = HINT_CLOSE_DELAY_MS) {
  const [hintState, setHintState] = useState<HintState | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const isMouseOverCardRef = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const hideHint = useCallback(() => {
    cancelClose();
    setHintState(null);
  }, [cancelClose]);

  const showHint = useCallback(
    (content: string, triggerRect: DOMRect) => {
      cancelClose();
      setHintState({ content, triggerRect });
    },
    [cancelClose],
  );

  const scheduleHide = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (!isMouseOverCardRef.current) {
        setHintState(null);
      }
      closeTimerRef.current = undefined;
    }, closeDelayMs);
  }, [cancelClose, closeDelayMs]);

  const handleCardMouseEnter = useCallback(() => {
    isMouseOverCardRef.current = true;
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(() => {
    isMouseOverCardRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  return {
    hintState,
    showHint,
    hideHint,
    scheduleHide,
    hintCardProps: {
      visible: hintState !== null,
      triggerRect: hintState?.triggerRect ?? null,
      onMouseEnter: handleCardMouseEnter,
      onMouseLeave: handleCardMouseLeave,
    },
  };
}
