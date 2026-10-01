import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipSimple } from '../Tooltip';

afterEach(cleanup);

describe('TooltipTrigger ref forwarding', () => {
  it('preserves child element ref when asChild is false (native element child)', () => {
    const ref = { current: null as HTMLButtonElement | null };

    render(
      <TooltipSimple content="tip">
        <button type="button" ref={ref}>
          hello
        </button>
      </TooltipSimple>,
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('preserves child element ref via a callback ref', () => {
    let captured: HTMLButtonElement | null = null;

    render(
      <TooltipSimple content="tip">
        <button
          type="button"
          ref={(el) => {
            captured = el;
          }}
        >
          hello
        </button>
      </TooltipSimple>,
    );

    expect(captured).not.toBeNull();
    expect(captured!.tagName).toBe('BUTTON');
  });

  it('still renders the trigger wrapper with a span', () => {
    render(
      <TooltipSimple content="tip">
        <button type="button">hello</button>
      </TooltipSimple>,
    );

    const wrapper = document.querySelector('.tooltip-trigger');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.textContent).toBe('hello');
  });
});

describe('TooltipContent enter/exit states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderControlled(open: boolean) {
    return render(
      <Tooltip open={open}>
        <TooltipTrigger>
          <button type="button">hello</button>
        </TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>,
    );
  }

  it('mounts closed first, then flips to open so the enter transition plays', async () => {
    renderControlled(true);

    // Controlled open renders synchronously, but in closed state (not open).
    expect(screen.getByTestId('tooltip-content').getAttribute('data-state')).toBe('closed');

    // One frame per rAF level (mount → raf1 → raf2), flushing microtasks between.
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    expect(screen.getByTestId('tooltip-content').getAttribute('data-state')).toBe('open');
  });

  it('applies maxWidth to the tooltip element style', async () => {
    render(
      <Tooltip open maxWidth={180}>
        <TooltipTrigger>
          <button type="button">hello</button>
        </TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>,
    );
    expect(screen.getByTestId('tooltip-content').style.maxWidth).toBe('180px');
  });

  it('defaults maxWidth to 240px when not specified', async () => {
    renderControlled(true);
    expect(screen.getByTestId('tooltip-content').style.maxWidth).toBe('240px');
  });

  it('flips to closed on exit and unmounts after the exit transition', async () => {
    const view = renderControlled(true);
    // jsdom 无布局引擎：mock tooltip 尺寸，否则 updatePosition 因 width=0 直接返回、
    // position 恒为 null（真实浏览器里有真实尺寸）。
    screen.getByTestId('tooltip-content').getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 80, height: 30, top: 0, right: 80, bottom: 30, left: 0 }) as DOMRect;
    await act(async () => {
      vi.advanceTimersByTime(64);
    });
    await act(async () => {
      vi.advanceTimersByTime(64);
    });
    expect(screen.getByTestId('tooltip-content').getAttribute('data-state')).toBe('open');
    expect(screen.getByTestId('tooltip-content').style.left).not.toBe('-9999px');

    view.rerender(
      <Tooltip open={false}>
        <TooltipTrigger>
          <button type="button">hello</button>
        </TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>,
    );
    expect(screen.getByTestId('tooltip-content').getAttribute('data-state')).toBe('closed');

    // 退出过渡必须在原地播放：关闭瞬间不得把 tooltip 移到屏外（-9999），
    // 否则淡出动画在不可见处空播、用户看到的是瞬间消失。
    expect(screen.getByTestId('tooltip-content').style.left).not.toBe('-9999px');

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('tooltip-content')).toBeNull();
  });
});
