import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBklitTheme, type BklitTheme } from './useBklitTheme';

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(),
}));

import { useResolvedTheme } from '@hooks/useResolvedTheme';

describe('useBklitTheme', () => {
  it('returns light palette when resolved theme is light', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('light');
    const { result } = renderHook(() => useBklitTheme());
    expect(result.current.accent).toBe('#3b82f6');
    expect(result.current.background).toBe('#ffffff');
  });

  it('returns dark palette when resolved theme is dark', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('dark');
    const { result } = renderHook(() => useBklitTheme());
    expect(result.current.accent).toBe('#60a5fa');
    expect(result.current.background).toBe('#1a1a2e');
  });

  it('provides all required BklitTheme properties', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('light');
    const { result } = renderHook(() => useBklitTheme());
    const keys: (keyof BklitTheme)[] = [
      'accent',
      'background',
      'text',
      'muted',
      'grid',
      'tooltipBg',
      'tooltipText',
      'heatmapColors',
      'seriesColors',
    ];
    for (const key of keys) {
      expect(result.current).toHaveProperty(key);
    }
  });
});
