import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileHotspotsState, FILE_HOTSPOTS_MODE_KEY } from '../useFileHotspotsState';

describe('useFileHotspotsState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults mode to full', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('full');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setMode('drill'));
    expect(JSON.parse(localStorage.getItem(FILE_HOTSPOTS_MODE_KEY) ?? '""')).toBe('drill');
    expect(result.current.mode).toBe('drill');
  });

  it('reads persisted mode on mount', () => {
    localStorage.setItem(FILE_HOTSPOTS_MODE_KEY, JSON.stringify('drill'));
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('drill');
  });

  it('falls back to full for invalid persisted value', () => {
    localStorage.setItem(FILE_HOTSPOTS_MODE_KEY, JSON.stringify('bogus'));
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('full');
  });

  it('defaults sort to changeCount desc and toggles direction on same key', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.sortKey).toBe('changeCount');
    expect(result.current.sortDir).toBe('desc');
    act(() => result.current.setSort('changeCount'));
    expect(result.current.sortDir).toBe('asc');
    act(() => result.current.setSort('changeCount'));
    expect(result.current.sortDir).toBe('desc');
  });

  it('switches sort key and resets direction to desc', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setSort('additions'));
    expect(result.current.sortKey).toBe('additions');
    expect(result.current.sortDir).toBe('desc');
  });

  it('updates drillPath', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setDrillPath(['src', 'core']));
    expect(result.current.drillPath).toEqual(['src', 'core']);
  });
});
