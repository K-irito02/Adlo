import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { XtermTerminal } from '../XtermTerminal';
import { terminalXtermPool } from '@features/terminal/terminalXtermPool';

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
    document.body.innerHTML = '';
    hostEl.remove();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function renderTerminal() {
    const view = render(<XtermTerminal sessionId="pty-test" onResize={() => {}} />);
    const outer = view.container.firstElementChild as HTMLElement;
    outer.appendChild(hostEl);
    Object.defineProperty(outer, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(outer, 'clientHeight', { configurable: true, value: 600 });
    return outer;
  }

  it('does not fit or report a tiny resize while the document is hidden (minimized)', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    renderTerminal();
    const observer = CapturingResizeObserver.instances.at(-1);
    expect(observer).toBeDefined();
    act(() => {
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).not.toHaveBeenCalled();
  });

  it('fits and reports once visible again', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    renderTerminal();
    const observer = CapturingResizeObserver.instances.at(-1);
    act(() => {
      observer?.trigger();
      vi.advanceTimersByTime(200);
    });
    expect(fit).toHaveBeenCalledTimes(1);
    expect(proposeDimensions).toHaveBeenCalled();
  });
});
