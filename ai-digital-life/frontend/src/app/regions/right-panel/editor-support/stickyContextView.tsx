import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IconArrowUp } from '../../../icons';
import type { StickyContextModel } from './stickyContext';
import type { CopyDict } from '../../../i18n';

const AUTO_HIDE_MS = 2000;

interface StickyContextProps {
  model: StickyContextModel;
  'data-testid'?: string;
  t: CopyDict;
}

export function StickyContext(props: StickyContextProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setIsVisible(false);
      }
      hideTimerRef.current = null;
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!props.model.showTopEntry) {
      clearHideTimer();
      return;
    }
    setIsVisible(true);
    startHideTimer();
    return clearHideTimer;
  }, [props.model.showTopEntry, props.model.modelId, startHideTimer, clearHideTimer]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    clearHideTimer();
  }, [clearHideTimer]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (isVisible) {
      startHideTimer();
    }
  }, [isVisible, startHideTimer]);

  if (!props.model.showTopEntry) {
    return null;
  }

  const topEntry = props.model.topEntry;

  return (
    <div
      className={`adl-sticky-context${isVisible ? '' : ' is-hidden'}`}
      data-testid={props['data-testid']}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="adl-sticky-context__row"
        aria-current="true"
        aria-label={topEntry.label}
        onClick={props.model.scrollToTop}
      >
        <IconArrowUp size={12} decorative className="adl-sticky-context__arrow" />
        <span className="adl-sticky-context__label">{topEntry.label}</span>
      </button>
    </div>
  );
}

export default StickyContext;
