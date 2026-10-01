import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Placement,
  type Alignment,
  computePosition,
  type PositionResult,
} from '../utils/tooltipPosition';
import { getWebViewAvoidRects } from '../utils/webviewAvoidRects';

export interface UseTooltipOptions {
  trigger?: 'hover' | 'focus' | 'click' | 'manual';
  defaultPlacement?: Placement;
  showDelay?: number;
  hideDelay?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sideOffset?: number;
  align?: Alignment;
  maxWidth?: number;
}

export interface UseTooltipReturn {
  triggerRef: React.RefCallback<HTMLElement>;
  tooltipRef: React.RefCallback<HTMLElement>;
  isOpen: boolean;
  position: PositionResult | null;
  placement: Placement;
  close: () => void;
  handleTriggerEnter: () => void;
  handleTriggerLeave: () => void;
  handleTooltipEnter: () => void;
  handleTooltipLeave: () => void;
  handleTriggerFocus: () => void;
  handleTriggerBlur: () => void;
  handleClick: (e: React.MouseEvent) => void;
}

const DEFAULT_SHOW_DELAY = 300;
const DEFAULT_HIDE_DELAY = 150;

const scrollResizeCallbacks = new Set<() => void>();
let globalListenerAttached = false;

function globalScrollResizeHandler() {
  scrollResizeCallbacks.forEach((cb) => cb());
}

function registerScrollResizeCallback(callback: () => void): void {
  scrollResizeCallbacks.add(callback);
  if (!globalListenerAttached) {
    window.addEventListener('scroll', globalScrollResizeHandler, { passive: true });
    window.addEventListener('resize', globalScrollResizeHandler, { passive: true });
    globalListenerAttached = true;
  }
}

function unregisterScrollResizeCallback(callback: () => void): void {
  scrollResizeCallbacks.delete(callback);
  if (scrollResizeCallbacks.size === 0 && globalListenerAttached) {
    window.removeEventListener('scroll', globalScrollResizeHandler);
    window.removeEventListener('resize', globalScrollResizeHandler);
    globalListenerAttached = false;
  }
}

export function useTooltip(options: UseTooltipOptions = {}): UseTooltipReturn {
  const {
    trigger = 'hover',
    defaultPlacement = 'top',
    showDelay = DEFAULT_SHOW_DELAY,
    hideDelay = DEFAULT_HIDE_DELAY,
    open: controlledOpen,
    onOpenChange,
    sideOffset = 8,
    align = 'center',
  } = options;

  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const [position, setPosition] = useState<PositionResult | null>(null);
  const [placement, setPlacement] = useState<Placement>(defaultPlacement);

  const triggerElRef = useRef<HTMLElement | null>(null);
  const tooltipElRef = useRef<HTMLElement | null>(null);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPointerInTooltipRef = useRef(false);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerElRef.current;
    const tooltipEl = tooltipElRef.current;
    if (!triggerEl || !tooltipEl) {
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    if (tooltipRect.width === 0 || tooltipRect.height === 0) {
      return;
    }

    const result = computePosition({
      triggerRect,
      tooltipRect: { width: tooltipRect.width, height: tooltipRect.height },
      placement: defaultPlacement,
      alignment: align,
      offset: sideOffset,
      avoidRects: getWebViewAvoidRects(),
    });

    setPosition(result);
    setPlacement(result.placement);
  }, [defaultPlacement, align, sideOffset]);

  const scheduleUpdatePosition = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      updatePosition();
      rafRef.current = null;
    });
  }, [updatePosition]);

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (isControlled) {
        onOpenChange?.(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }
      // 关闭时保留最后一次定位，让退出过渡在原地播放；
      // 若清空调位，退出动画会在屏外 (-9999) 空播，用户看到的是瞬间消失。
      // 下次打开时 updatePosition 会重新计算，无需在此清理。
    },
    [isControlled, onOpenChange],
  );

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startShowTimer = useCallback(() => {
    clearTimers();
    if (showDelay <= 0) {
      setOpen(true);
      return;
    }
    showTimerRef.current = setTimeout(() => {
      setOpen(true);
      showTimerRef.current = null;
    }, showDelay);
  }, [showDelay, clearTimers, setOpen]);

  const startHideTimer = useCallback(() => {
    clearTimers();
    if (hideDelay <= 0) {
      setOpen(false);
      return;
    }
    hideTimerRef.current = setTimeout(() => {
      if (!isPointerInTooltipRef.current) {
        setOpen(false);
      }
      hideTimerRef.current = null;
    }, hideDelay);
  }, [hideDelay, clearTimers, setOpen]);

  const handleTriggerEnter = useCallback(() => {
    if (trigger !== 'hover') {
      return;
    }
    isPointerInTooltipRef.current = false;
    startShowTimer();
  }, [trigger, startShowTimer]);

  const handleTriggerLeave = useCallback(() => {
    if (trigger !== 'hover') {
      return;
    }
    startHideTimer();
  }, [trigger, startHideTimer]);

  const handleTooltipEnter = useCallback(() => {
    isPointerInTooltipRef.current = true;
    clearTimers();
  }, [clearTimers]);

  const handleTooltipLeave = useCallback(() => {
    isPointerInTooltipRef.current = false;
    startHideTimer();
  }, [startHideTimer]);

  const handleTriggerFocus = useCallback(() => {
    if (trigger !== 'focus') {
      return;
    }
    startShowTimer();
  }, [trigger, startShowTimer]);

  const handleTriggerBlur = useCallback(() => {
    if (trigger !== 'focus') {
      return;
    }
    startHideTimer();
  }, [trigger, startHideTimer]);

  const handleClick = useCallback(
    (_e: React.MouseEvent) => {
      if (trigger !== 'click') {
        return;
      }
      setOpen(!isOpen);
    },
    [trigger, isOpen, setOpen],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const triggerRef: React.RefCallback<HTMLElement> = useCallback((el) => {
    triggerElRef.current = el;
  }, []);

  const tooltipRef: React.RefCallback<HTMLElement> = useCallback((el) => {
    tooltipElRef.current = el;
  }, []);

  useEffect(() => {
    if (isOpen) {
      scheduleUpdatePosition();
    }
  }, [isOpen, scheduleUpdatePosition]);

  useEffect(() => {
    const triggerEl = triggerElRef.current;
    if (!triggerEl) {
      return;
    }

    const instanceListeners: {
      target: EventTarget;
      type: string;
      handler: EventListenerOrEventListenerObject;
    }[] = [];

    const resizeObserver = new ResizeObserver(() => {
      if (isOpen) {
        scheduleUpdatePosition();
      }
    });
    resizeObserver.observe(triggerEl);

    const tooltipEl = tooltipElRef.current;
    if (tooltipEl) {
      resizeObserver.observe(tooltipEl);
    }

    const handleScrollResize = () => {
      if (isOpen) {
        scheduleUpdatePosition();
      }
    };

    registerScrollResizeCallback(handleScrollResize);

    let scrollParent: HTMLElement | null = triggerEl.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      if (
        scrollParent instanceof HTMLElement &&
        (getComputedStyle(scrollParent).overflowY === 'auto' ||
          getComputedStyle(scrollParent).overflowY === 'scroll' ||
          getComputedStyle(scrollParent).overflowX === 'auto' ||
          getComputedStyle(scrollParent).overflowX === 'scroll')
      ) {
        scrollParent.addEventListener('scroll', handleScrollResize, { passive: true });
        instanceListeners.push({
          target: scrollParent,
          type: 'scroll',
          handler: handleScrollResize,
        });
      }
      scrollParent = scrollParent.parentElement;
    }

    const handleKeyDown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape' && isOpen) {
        ke.preventDefault();
        ke.stopPropagation();
        close();
        triggerElRef.current?.focus();
      }
    }) as EventListener;

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      instanceListeners.push({ target: document, type: 'keydown', handler: handleKeyDown });
    }

    return () => {
      resizeObserver.disconnect();
      unregisterScrollResizeCallback(handleScrollResize);
      instanceListeners.forEach(({ target, type, handler }) => {
        target.removeEventListener(type, handler);
      });
    };
  }, [isOpen, scheduleUpdatePosition, close]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [clearTimers]);

  return useMemo(
    () => ({
      triggerRef,
      tooltipRef,
      isOpen,
      position,
      placement,
      close,
      handleTriggerEnter,
      handleTriggerLeave,
      handleTooltipEnter,
      handleTooltipLeave,
      handleTriggerFocus,
      handleTriggerBlur,
      handleClick,
    }),
    [
      triggerRef,
      tooltipRef,
      isOpen,
      position,
      placement,
      close,
      handleTriggerEnter,
      handleTriggerLeave,
      handleTooltipEnter,
      handleTooltipLeave,
      handleTriggerFocus,
      handleTriggerBlur,
      handleClick,
    ],
  );
}
