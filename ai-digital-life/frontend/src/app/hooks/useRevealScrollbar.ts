import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export interface RevealScrollbarController {
  scrollRef: RefObject<HTMLDivElement | null>;
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  visible: boolean;
  scrollable: boolean;
  thumbStyle: CSSProperties;
  thumbListeners: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

interface Geometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const MIN_THUMB_HEIGHT = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readGeometry(el: HTMLDivElement): Geometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}

function computeThumb(geometry: Geometry): { height: number; top: number } {
  const { scrollTop, scrollHeight, clientHeight } = geometry;
  if (scrollHeight <= clientHeight + 1 || clientHeight <= 0) {
    return { height: clientHeight, top: 0 };
  }
  const ratio = clientHeight / scrollHeight;
  const height = Math.max(MIN_THUMB_HEIGHT, ratio * clientHeight);
  const maxScroll = scrollHeight - clientHeight;
  const top = (scrollTop / maxScroll) * (clientHeight - height);
  return { height, top };
}

export function useRevealScrollbar(deps: DependencyList): RevealScrollbarController {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [geometry, setGeometry] = useState<Geometry>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const dragState = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setGeometry(readGeometry(el));
  }, []);

  const depsKey = deps.join('\u0000');

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [measure, depsKey]);

  const onDragMove = useCallback(
    (event: PointerEvent) => {
      const el = scrollRef.current;
      const state = dragState.current;
      if (!el || !state) {
        return;
      }
      const current = readGeometry(el);
      if (current.clientHeight <= 0 || current.scrollHeight <= current.clientHeight + 1) {
        return;
      }
      const thumb = computeThumb(current);
      const maxScroll = current.scrollHeight - current.clientHeight;
      const maxThumbTop = current.clientHeight - thumb.height;
      if (maxThumbTop <= 0) {
        return;
      }
      const deltaY = event.clientY - state.startY;
      const scrollDelta = (deltaY / maxThumbTop) * maxScroll;
      el.scrollTop = clamp(state.startScrollTop + scrollDelta, 0, maxScroll);
      measure();
    },
    [measure],
  );

  const endDrag = useCallback(
    (event: PointerEvent) => {
      const state = dragState.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }
      dragState.current = null;
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    },
    [onDragMove],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragState.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: el.scrollTop,
      };
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [onDragMove, endDrag],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [onDragMove, endDrag]);

  const { scrollTop, scrollHeight, clientHeight } = geometry;
  const scrollable = scrollHeight > clientHeight + 1;
  const thumb = computeThumb(geometry);
  const visible = hovered && scrollable;

  return {
    scrollRef,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
    visible,
    scrollable,
    thumbStyle: {
      height: `${thumb.height}px`,
      transform: `translateY(${thumb.top}px)`,
    },
    thumbListeners: { onPointerDown: startDrag },
  };
}
