import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TooltipSimple } from './Tooltip';

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
