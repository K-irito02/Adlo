import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { useFileTreeRevealOnRequest } from './useFileTreeRevealOnRequest';

function Harness() {
  useFileTreeRevealOnRequest();
  return null;
}

describe('useFileTreeRevealOnRequest', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (typeof window.requestAnimationFrame !== 'function') {
      (window as unknown as Record<string, unknown>).requestAnimationFrame = (
        cb: FrameRequestCallback,
      ) => {
        cb(0);
        return 1;
      };
    }
    // 同步执行 rAF 回调：确定性推进重试循环（上限 30 次，不会无限递归）。
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    useAppStore.setState({ fileTreeRevealRequest: null });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrolls the matching row of the matching workspace into view', () => {
    document.body.innerHTML =
      '<div data-workspace-id="ws-other"><div data-path="docs/a.md">other</div></div>' +
      '<div data-workspace-id="ws1"><div data-path="docs/a.md" id="row">x</div></div>';
    const row = document.getElementById('row') as unknown as HTMLElement & {
      scrollIntoView: (...args: unknown[]) => void;
    };
    const scrollSpy = vi.fn();
    row.scrollIntoView = scrollSpy;
    render(<Harness />);
    act(() => {
      useAppStore.getState().requestFileTreeReveal('ws1', 'docs/a.md');
    });
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does nothing when no row matches (no throw, no scroll)', () => {
    document.body.innerHTML =
      '<div data-workspace-id="ws-other"><div data-path="docs/a.md">other</div></div>';
    const scrollSpy = vi.fn();
    (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView = scrollSpy;
    render(<Harness />);
    act(() => {
      useAppStore.getState().requestFileTreeReveal('ws1', 'docs/a.md');
    });
    expect(scrollSpy).not.toHaveBeenCalled();
    delete (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  });
});
