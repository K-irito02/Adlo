import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { HintCardTrigger } from './HintCardTrigger';

afterEach(cleanup);

describe('HintCardTrigger', () => {
  it('renders children', () => {
    render(
      <HintCardTrigger content="hint text">
        <button type="button">!</button>
      </HintCardTrigger>,
    );
    expect(screen.getByRole('button', { name: '!' })).toBeInTheDocument();
  });

  it('shows hint card on click', () => {
    render(
      <HintCardTrigger content="hint text">
        <button type="button">!</button>
      </HintCardTrigger>,
    );
    act(() => {
      screen.getByRole('button', { name: '!' }).click();
    });
    expect(screen.getByText('hint text')).toBeInTheDocument();
  });

  it('hides hint card on second click', () => {
    render(
      <HintCardTrigger content="hint text">
        <button type="button">!</button>
      </HintCardTrigger>,
    );
    const btn = screen.getByRole('button', { name: '!' });

    act(() => {
      btn.click();
    });
    expect(screen.getByText('hint text')).toBeInTheDocument();

    act(() => {
      btn.click();
    });
    expect(screen.queryByText('hint text')).not.toBeInTheDocument();
  });

  it('shows hint card on long hover', () => {
    vi.useFakeTimers();
    render(
      <HintCardTrigger content="hint text" longHoverMs={200}>
        <button type="button">!</button>
      </HintCardTrigger>,
    );

    act(() => {
      const btn = screen.getByRole('button', { name: '!' });
      const wrapper = btn.parentElement;
      if (wrapper) {
        fireEvent.mouseEnter(wrapper);
      }
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText('hint text')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
