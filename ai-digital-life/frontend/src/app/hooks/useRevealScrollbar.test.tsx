import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useRevealScrollbar, type RevealScrollbarController } from './useRevealScrollbar';

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

function mockLayout(el: HTMLElement, box: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.clientHeight });
}

function ThumbProbe({ controller }: { controller: RevealScrollbarController }) {
  return (
    <div
      data-testid="thumb"
      data-visible={controller.visible}
      data-scrollable={controller.scrollable}
      style={controller.thumbStyle}
      {...controller.thumbListeners}
    />
  );
}

function Host({ items }: { items: number }) {
  const controller = useRevealScrollbar([items]);
  return (
    <div ref={controller.scrollRef} {...controller.hoverProps} data-testid="host">
      {Array.from({ length: items }, (_, i) => (
        <div key={i}>{i}</div>
      ))}
      <ThumbProbe controller={controller} />
    </div>
  );
}

function renderHost(items: number, box: { scrollHeight: number; clientHeight: number }) {
  const rendered = render(<Host items={items} />);
  const host = rendered.container.querySelector('[data-testid="host"]') as HTMLElement;
  mockLayout(host, box);
  fireEvent.scroll(host);
  return { ...rendered, host };
}

describe('useRevealScrollbar', () => {
  it('is not scrollable and never visible when content fits', () => {
    const { host } = renderHost(2, { scrollHeight: 100, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('false');
    expect(thumb.dataset.visible).toBe('false');
  });

  it('shows the thumb on hover when content overflows', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('true');
    expect(thumb.dataset.visible).toBe('true');
    expect(thumb.style.height).toBe('25px');
    expect(thumb.style.transform).toBe('translateY(0px)');
  });

  it('hides the thumb on mouse leave', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    fireEvent.mouseLeave(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.visible).toBe('false');
  });

  it('updates thumb position as the container scrolls', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    host.scrollTop = 150;
    fireEvent.scroll(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.style.transform).toBe('translateY(37.5px)');
  });

  it('drag the thumb translates to scrollTop and clamps', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    fireEvent.pointerDown(thumb, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 30 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 30 });
    expect(host.scrollTop).toBe(120);
  });

  it('re-measures when deps change and content starts to overflow', () => {
    const box = { scrollHeight: 100, clientHeight: 100 };
    const rendered = render(<Host items={2} />);
    const host = rendered.container.querySelector('[data-testid="host"]') as HTMLElement;
    mockLayout(host, box);
    box.scrollHeight = 400;
    rendered.rerender(<Host items={5} />);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('true');
  });
});
