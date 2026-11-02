import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { XtermTerminal } from '../XtermTerminal';
import { terminalXtermPool } from '@features/terminal/terminalXtermPool';
import { setWindowFocused } from '@features/terminal/terminalFitGuard';

class CapturingResizeObserver {
  static instances: CapturingResizeObserver[] = [];
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    CapturingResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): ResizeObserverEntry[] {
    return [];
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('XtermTerminal resize guard', () => {
  const fit = vi.fn();
  const proposeDimensions = vi.fn(() => ({ cols: 23, rows: 6 }));
  const hostEl = document.createElement('div');
  const entry = {
    sessionId: 'pty-test',
    hostEl,
    terminal: {
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      attachCustomKeyEventHandler: vi.fn(),
      focus: vi.fn(),
    },
    fitAddon: { fit, proposeDimensions },
  };

  beforeEach(() => {
    CapturingResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    vi.spyOn(terminalXtermPool, 'acquire').mockReturnValue(entry as never);
    fit.mockClear();
    proposeDimensions.mockClear();
    setWindowFocused(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.body.innerHTML = '';
    hostEl.remove();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    setWindowFocused(true);
    document.body.innerHTML = '';
  });

  function renderTerminal(onResize: (cols: number, rows: number) => void = () => {}) {
    const view = render(<XtermTerminal sessionId="pty-test" onResize={onResize} />);
    const outer = view.container.firstElementChild as HTMLElement;
    outer.appendChild(hostEl);
    Object.defineProperty(outer, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 600 });
    return outer;
  }

  it('does not fit or report a tiny resize while the document is hidden (minimized)', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const onResize = vi.fn();
    renderTerminal(onResize);
    const observer = CapturingResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    act(() => {
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('skips fit while the window is blurred, then re-fits and reports on focus', () => {
    vi.useFakeTimers();
    // 真实故障形态：最小化时 document.hidden 仍为 false，只有窗口失焦。
    const onResize = vi.fn();
    renderTerminal(onResize);
    const observer = CapturingResizeObserver.instances.at(-1);

    act(() => {
      window.dispatchEvent(new Event('blur'));
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(200);
    });
    expect(fit).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(23, 6);
  });

  it('skips fit when the container has zero size (panel hidden / not laid out)', () => {
    vi.useFakeTimers();
    const onResize = vi.fn();
    const outer = renderTerminal(onResize);
    Object.defineProperty(outer, 'clientWidth', { configurable: true, value: 0 });
    Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 0 });
    const observer = CapturingResizeObserver.instances.at(-1);

    act(() => {
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('fits and reports once visible again', () => {
    vi.useFakeTimers();
    const onResize = vi.fn();
    renderTerminal(onResize);
    const observer = CapturingResizeObserver.instances.at(-1);
    act(() => {
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(23, 6);
  });
});
