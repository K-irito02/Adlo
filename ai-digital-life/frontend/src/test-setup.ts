import '@testing-library/jest-dom/vitest';

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Received NaN for the')) return;
  origConsoleError.call(console, ...args);
};

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
    readonly thresholds: ReadonlyArray<number> = [];
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
