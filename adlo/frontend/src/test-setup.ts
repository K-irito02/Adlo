import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts does not set `globals: true`, so @testing-library/react's
// automatic afterEach(cleanup) registration does not run. Without this, React
// scheduler tasks spawned by deeper component trees (e.g. memoized chart
// sub-components) can outlive the jsdom environment and throw
// "window is not defined" after teardown.
afterEach(() => {
  cleanup();
});

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Received NaN for the')) {
    return;
  }
  origConsoleError.call(console, ...args);
};

if (typeof window !== 'undefined') {
  const proto = (window.Element?.prototype ??
    window.HTMLElement?.prototype ??
    {}) as unknown as Record<string, unknown>;
  if (proto && !('getTotalLength' in proto)) {
    proto.getTotalLength = () => 100;
    proto.getPointAtLength = () => ({ x: 0, y: 0, z: 0, w: 1 }) as DOMPoint;
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class IntersectionObserverMock {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(cb, 0) as unknown as number;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };

  // jsdom 26 没有 PointerEvent，@testing-library 的 pointer 事件会退化成 Event，
  // clientX/clientY 丢失后 4px 阈值与上下半区判断都会失真（NaN 比较恒 false）。
  if (typeof window.PointerEvent === 'undefined') {
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

  // jsdom 不实现 canvas：xterm 在模块加载时创建 canvas 计算调色板会触发
  // "Not implemented: HTMLCanvasElement.prototype.getContext" 噪声。返回 null
  // 与 jsdom 默认行为等价（xterm 已对空上下文做了容错），仅消除该警告。
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as unknown as HTMLCanvasElement['getContext'];
  }
}
