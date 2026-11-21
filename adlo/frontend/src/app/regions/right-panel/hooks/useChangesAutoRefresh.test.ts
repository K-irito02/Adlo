import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { CHANGES_AUTO_REFRESH_INTERVAL_MS, useChangesAutoRefresh } from './useChangesAutoRefresh';

describe('useChangesAutoRefresh', () => {
  const original = useAppStore.getState().refreshAllGitSnapshotsSilent;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    refresh = vi.fn(async () => {});
    useAppStore.setState({ refreshAllGitSnapshotsSilent: refresh as never });
  });

  afterEach(() => {
    useAppStore.setState({ refreshAllGitSnapshotsSilent: original });
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('激活时立即刷新一次，之后按间隔轮询', () => {
    renderHook(() => useChangesAutoRefresh(true));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(CHANGES_AUTO_REFRESH_INTERVAL_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('未激活时不刷新', () => {
    renderHook(() => useChangesAutoRefresh(false));
    act(() => {
      vi.advanceTimersByTime(CHANGES_AUTO_REFRESH_INTERVAL_MS * 3);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('窗口不可见时跳过 tick', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    renderHook(() => useChangesAutoRefresh(true));
    act(() => {
      vi.advanceTimersByTime(CHANGES_AUTO_REFRESH_INTERVAL_MS * 2);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
