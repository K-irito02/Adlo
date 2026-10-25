import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedLoadingVisible } from './useDelayedLoadingVisible';

const OPTIONS = { delayMs: 150, minVisibleMs: 300 };

describe('useDelayedLoadingVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays showing, then keeps the placeholder visible for the minimum duration', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedLoadingVisible(active, OPTIONS),
      { initialProps: { active: true } },
    );

    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(149));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('never shows when loading finishes before the delay (fast open, no flash)', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedLoadingVisible(active, OPTIONS),
      { initialProps: { active: true } },
    );

    act(() => vi.advanceTimersByTime(100));
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });
});
