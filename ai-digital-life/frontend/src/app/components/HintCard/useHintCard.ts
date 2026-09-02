import { useRef, useState, useCallback, useEffect } from 'react';
import { HINT_CLOSE_DELAY_MS } from './HintCardTrigger';

export interface HintState {
  content: string;
  triggerRect: DOMRect;
}

export function useHintCard(
  closeDelayMs: number = HINT_CLOSE_DELAY_MS,
  triggerRef?: React.RefObject<HTMLElement | null>,
) {
  const [hintState, setHintState] = useState<HintState | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);

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
      setHintState(null);
      closeTimerRef.current = undefined;
    }, closeDelayMs);
  }, [cancelClose, closeDelayMs]);

  const handleCardMouseEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      const isToTrigger =
        related &&
        (triggerRef?.current?.contains(related) || related.contains?.(triggerRef?.current));
      if (isToTrigger) {
        return;
      }
      scheduleHide();
    },
    [scheduleHide, triggerRef],
  );

  useEffect(() => {
    return () => {
      cancelClose();
    };
  }, [cancelClose]);

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
