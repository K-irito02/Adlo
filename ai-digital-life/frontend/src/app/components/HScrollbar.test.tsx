import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { HScrollbar } from './HScrollbar';
import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    writable: true,
    configurable: true,
    value: PointerEventPolyfill,
  });
}

function makeController(
  overrides: Partial<RevealScrollbarController> = {},
): RevealScrollbarController {
  return {
    scrollRef: { current: null },
    hoverProps: { onMouseEnter: () => {}, onMouseLeave: () => {} },
    visible: false,
    scrollable: true,
    axis: 'horizontal',
    thumbLength: 25,
    thumbOffset: 60,
    thumbStyle: { width: '25px', transform: 'translateX(60px)' },
    thumbListeners: { onPointerDown: vi.fn() },
    ...overrides,
  };
}

function makeScroller({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  el.scrollLeft = 0;
  return el;
}

function mockTrackBox(track: HTMLElement, width: number) {
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 10,
    width,
    height: 10,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('HScrollbar (persistent dot indicator, extracted from .adl-cm-hscroll)', () => {
  it('renders nothing when the container is not scrollable', () => {
    const { container } = render(<HScrollbar controller={makeController({ scrollable: false })} />);
    expect(container.querySelector('.adl-hscroll')).toBeNull();
  });

  it('is persistent: visible without any hover interaction', () => {
    const { container } = render(<HScrollbar controller={makeController()} />);
    expect(container.querySelector('.adl-hscroll')).not.toBeNull();
    expect(container.querySelector('.adl-hscroll__thumb')).not.toBeNull();
  });

  it('thumb carries dot-offset aligned to the thumb center (dot state)', () => {
    const { container } = render(
      <HScrollbar controller={makeController({ thumbLength: 25, thumbOffset: 60 })} />,
    );
    const thumb = container.querySelector('.adl-hscroll__thumb') as HTMLElement;
    expect(thumb.style.left).toBe('60px');
    expect(thumb.style.width).toBe('25px');
    // 点位 = 滑块中心 − 3px 半径（与编辑器 `thumbWidth / 2 - 3` 一致）。
    expect(thumb.style.getPropertyValue('--adl-hscroll-dot-offset')).toBe('9.5px');
  });

  it('track pointerdown jumps scroll position by ratio (editor _onTrackPointerDown semantics)', () => {
    const scroller = makeScroller({ scrollWidth: 400, clientWidth: 100 });
    const onPointerDown = vi.fn();
    const { container } = render(
      <HScrollbar
        controller={makeController({
          scrollRef: { current: scroller },
          thumbListeners: { onPointerDown },
        })}
      />,
    );
    const track = container.querySelector('.adl-hscroll__track') as HTMLElement;
    mockTrackBox(track, 100);
    fireEvent.pointerDown(track, { clientX: 50 });
    expect(scroller.scrollLeft).toBe(150);
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('thumb pointerdown starts drag and does not trigger track jump', () => {
    const scroller = makeScroller({ scrollWidth: 400, clientWidth: 100 });
    const onPointerDown = vi.fn();
    const { container } = render(
      <HScrollbar
        controller={makeController({
          scrollRef: { current: scroller },
          thumbListeners: { onPointerDown },
        })}
      />,
    );
    const track = container.querySelector('.adl-hscroll__track') as HTMLElement;
    mockTrackBox(track, 100);
    const thumb = container.querySelector('.adl-hscroll__thumb') as HTMLElement;
    // clientX:50 —— 若 thumb 守卫被删，closest 跳过缺失会触发轨道跳转
    // (50/100)*300=150，断言 scrollLeft 仍为 0 才能真正检出守卫。
    fireEvent.pointerDown(thumb, { clientX: 50, pointerId: 1 });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(thumb.classList.contains('is-dragging')).toBe(true);
    expect(scroller.scrollLeft).toBe(0);
  });
});
