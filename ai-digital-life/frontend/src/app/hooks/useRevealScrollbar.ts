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

/** 滚动条轴向：vertical 为项目通用竖条（文件树/剪贴板同源）；
 * horizontal 对齐编辑器/差异查看器 `.adl-cm-hscroll` 的横向条（底部 overlay）。 */
export type RevealScrollbarAxis = 'vertical' | 'horizontal';

export interface RevealScrollbarController {
  scrollRef: RefObject<HTMLDivElement | null>;
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  visible: boolean;
  scrollable: boolean;
  /** 滑块几何原始值（px）：横向消费者（HScrollbar）据此自行渲染点态滑块。 */
  thumbLength: number;
  thumbOffset: number;
  /** 仅竖轴 RevealScrollbar 消费的字符串样式（横轴返回空对象，见 thumbStyle 注释）。 */
  thumbStyle: CSSProperties;
  thumbListeners: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

interface Geometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** 滑块最短长度：竖 24（reveal 家族惯例）；横 40 对齐编辑器
 * `HorizontalScrollManager.THUMB_MIN_WIDTH` —— 否则 thumbLength∈[24,40) 时
 * 点位（中心对齐）与 hover 展开（CSS min-width:40px）中心错位。 */
const MIN_THUMB_LENGTH: Record<RevealScrollbarAxis, number> = {
  vertical: 24,
  horizontal: 40,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readGeometry(el: HTMLDivElement): Geometry {
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  };
}

/** thumb 尺寸与偏移（轴对称）：length=沿轨道长度，offset=距轨道起点位移。 */
function computeThumb(
  geometry: Geometry,
  axis: RevealScrollbarAxis,
): { length: number; offset: number } {
  const isVertical = axis === 'vertical';
  const position = isVertical ? geometry.scrollTop : geometry.scrollLeft;
  const contentSize = isVertical ? geometry.scrollHeight : geometry.scrollWidth;
  const viewport = isVertical ? geometry.clientHeight : geometry.clientWidth;
  if (contentSize <= viewport + 1 || viewport <= 0) {
    return { length: viewport, offset: 0 };
  }
  const ratio = viewport / contentSize;
  // Math.min(viewport, …)：极窄/极矮 viewport（< 最短滑块）下不越出可视区。
  const length = Math.min(viewport, Math.max(MIN_THUMB_LENGTH[axis], ratio * viewport));
  const maxScroll = contentSize - viewport;
  const offset = (position / maxScroll) * (viewport - length);
  return { length, offset };
}

export function useRevealScrollbar(
  deps: DependencyList,
  axis: RevealScrollbarAxis = 'vertical',
): RevealScrollbarController {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [geometry, setGeometry] = useState<Geometry>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  });
  const dragState = useRef<{ pointerId: number; start: number; startScroll: number } | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const geo = readGeometry(el);
    // 浅比较 6 字段：几何未变不 setState，避免 hover 进入等高频重测多一次渲染。
    setGeometry((prev) =>
      prev.scrollTop === geo.scrollTop &&
      prev.scrollHeight === geo.scrollHeight &&
      prev.clientHeight === geo.clientHeight &&
      prev.scrollLeft === geo.scrollLeft &&
      prev.scrollWidth === geo.scrollWidth &&
      prev.clientWidth === geo.clientWidth
        ? prev
        : geo,
    );
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
      const isVertical = axis === 'vertical';
      const contentSize = isVertical ? current.scrollHeight : current.scrollWidth;
      const viewport = isVertical ? current.clientHeight : current.clientWidth;
      if (viewport <= 0 || contentSize <= viewport + 1) {
        return;
      }
      const thumb = computeThumb(current, axis);
      const maxScroll = contentSize - viewport;
      const maxThumbOffset = viewport - thumb.length;
      if (maxThumbOffset <= 0) {
        return;
      }
      const delta = isVertical ? event.clientY - state.start : event.clientX - state.start;
      const scrollDelta = (delta / maxThumbOffset) * maxScroll;
      const nextScroll = clamp(state.startScroll + scrollDelta, 0, maxScroll);
      if (isVertical) {
        el.scrollTop = nextScroll;
      } else {
        el.scrollLeft = nextScroll;
      }
      measure();
    },
    [axis, measure],
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
        start: axis === 'vertical' ? event.clientY : event.clientX,
        startScroll: axis === 'vertical' ? el.scrollTop : el.scrollLeft,
      };
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [axis, onDragMove, endDrag],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [onDragMove, endDrag]);

  const scrollable =
    axis === 'vertical'
      ? geometry.scrollHeight > geometry.clientHeight + 1
      : geometry.scrollWidth > geometry.clientWidth + 1;
  const thumb = computeThumb(geometry, axis);
  const visible = hovered && scrollable;

  // 横向消费者（HScrollbar）走 thumbLength/thumbOffset 自行渲染（点态设计）；
  // thumbStyle 只服务竖轴 RevealScrollbar —— 横分支零生产消费者且是误用陷阱
  //（误传给 RevealScrollbar 会渲染错位），返回空对象（revB-D2）。
  const thumbStyle: CSSProperties =
    axis === 'vertical'
      ? { height: `${thumb.length}px`, transform: `translateY(${thumb.offset}px)` }
      : {};

  return {
    scrollRef,
    hoverProps: {
      // 进入即重测：内容可能在元素尺寸不变的情况下增高/增宽（如异步数据
      // 到达后变长），仅靠 scroll/ResizeObserver 会漏掉「刚变可滚动」的首帧。
      onMouseEnter: () => {
        setHovered(true);
        measure();
      },
      onMouseLeave: () => setHovered(false),
    },
    visible,
    scrollable,
    thumbLength: thumb.length,
    thumbOffset: thumb.offset,
    thumbStyle,
    thumbListeners: { onPointerDown: startDrag },
  };
}
