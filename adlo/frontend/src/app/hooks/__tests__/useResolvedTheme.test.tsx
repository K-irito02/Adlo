import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ResolvedTheme } from '../../../design-system/theme';
import { useResolvedTheme } from '../useResolvedTheme';

let mockResolvedTheme: ResolvedTheme = 'dark';
let mockListeners = new Set<(state: { resolvedTheme: ResolvedTheme }) => void>();

vi.mock('../../utils/theme', () => ({
  themeController: {
    getState: () => ({ resolvedTheme: mockResolvedTheme }),
    subscribe: (listener: (state: { resolvedTheme: ResolvedTheme }) => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    },
  },
}));

describe('useResolvedTheme', () => {
  beforeEach(() => {
    mockResolvedTheme = 'dark';
    mockListeners = new Set();
  });

  it('returns current resolved theme from themeController', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });

  it('returns "light" when themeController has light resolved', () => {
    mockResolvedTheme = 'light';
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
  });

  it('re-renders when themeController emits a change', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');

    act(() => {
      mockResolvedTheme = 'light';
      for (const l of mockListeners) {
        l({ resolvedTheme: 'light' });
      }
    });

    expect(result.current).toBe('light');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useResolvedTheme());
    expect(mockListeners.size).toBe(1);

    unmount();
    expect(mockListeners.size).toBe(0);
  });
});
