import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHintCard } from './useHintCard';

function makeRect(left: number, top: number): DOMRect {
  return { left, top, right: left + 16, bottom: top + 16, width: 16, height: 16, x: left, y: top, toJSON() {} };
}

describe('useHintCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state is null', () => {
    const { result } = renderHook(() => useHintCard());
    expect(result.current.hintState).toBeNull();
  });

  it('showHint sets state', () => {
    const { result } = renderHook(() => useHintCard());
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    expect(result.current.hintState).toMatchObject({ content: 'test hint', triggerRect: { left: 100, top: 100, width: 16, height: 16 } });
  });

  it('hideHint clears state', () => {
    const { result } = renderHook(() => useHintCard());
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    act(() => {
      result.current.hideHint();
    });
    expect(result.current.hintState).toBeNull();
  });

  it('scheduleHide clears state after delay', () => {
    const { result } = renderHook(() => useHintCard(100));
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    act(() => {
      result.current.scheduleHide();
    });
    expect(result.current.hintState).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hintState).toBeNull();
  });

  it('showHint cancels scheduled hide', () => {
    const { result } = renderHook(() => useHintCard(100));
    act(() => {
      result.current.showHint('hint1', makeRect(100, 100));
    });
    act(() => {
      result.current.scheduleHide();
    });
    act(() => {
      result.current.showHint('hint2', makeRect(200, 200));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hintState?.content).toBe('hint2');
  });
});
