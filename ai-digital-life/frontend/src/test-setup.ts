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
}
