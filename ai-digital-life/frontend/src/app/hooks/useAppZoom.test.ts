import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppZoom } from './useAppZoom';

const realGetComputedStyle = window.getComputedStyle.bind(window);

beforeEach(() => {
  // jsdom does not implement the CSS `zoom` property in computed style, so
  // mirror the inline style like a real browser does. Production code is
  // untouched; this shim only repairs the test environment.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((
    el: Element,
    pseudo?: string | null,
  ) => {
    const csd = realGetComputedStyle(el, pseudo as never);
    if (el === document.documentElement) {
      const inlineZoom = document.documentElement.style.zoom;
      if (inlineZoom) {
        return new Proxy(csd, {
          get(target, prop, receiver) {
            if (prop === 'zoom') {
              return inlineZoom;
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
          },
        });
      }
    }
    return csd;
  }) as typeof window.getComputedStyle);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAppZoom', () => {
  it('zooms in/out around 1 and clamps to [0.5, 2], reset restores 1', () => {
    document.documentElement.style.zoom = '1';
    const { result, unmount } = renderHook(() => useAppZoom());
    act(() => result.current.zoomBy(0.1));
    expect(document.documentElement.style.zoom).toBe('1.1');
    act(() => result.current.zoomBy(-0.1));
    expect(document.documentElement.style.zoom).toBe('1');
    act(() => result.current.zoomBy(10));
    expect(document.documentElement.style.zoom).toBe('2');
    act(() => result.current.resetZoom());
    expect(document.documentElement.style.zoom).toBe('1');
    unmount();
    document.documentElement.style.zoom = '1';
  });
});
