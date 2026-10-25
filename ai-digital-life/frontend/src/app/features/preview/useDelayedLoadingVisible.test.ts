import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainingLoadingDelayMs, useDelayedLoadingVisible } from './useDelayedLoadingVisible';

const OPTIONS = { delayMs: 150, minVisibleMs: 300 };

describe('remainingLoadingDelayMs', () => {
  it('spends one shared 150ms budget across phases', () => {
    expect(remainingLoadingDelayMs(null)).toBe(150);
    expect(remainingLoadingDelayMs(1000, 1000)).toBe(150);
    expect(remainingLoadingDelayMs(1000, 1100)).toBe(50);
    expect(remainingLoadingDelayMs(1000, 2000)).toBe(0);
    // 时钟回拨不应放大预算
    expect(remainingLoadingDelayMs(2000, 1000)).toBe(150);
  });
});

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
