import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartTheme } from './useChartTheme';

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(),
}));

import { useResolvedTheme } from '@hooks/useResolvedTheme';

describe('useChartTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns light theme when resolvedTheme is light', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('light');
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.tooltipBg).toBe('#ffffff');
    expect(result.current.tooltipText).toBe('#1e293b');
    expect(result.current.axisLineColor).toBe('#e2e8f0');
    expect(result.current.addColor).toBe('#10b981');
    expect(result.current.deleteColor).toBe('#ef4444');
    expect(result.current.commitColor).toBe('#3b82f6');
    expect(result.current.neutralColor).toBe('#94a3b8');
    expect(result.current.heatmapColors).toEqual(['#e2e8f0', '#10b981']);
    expect(result.current.treemapBorderColor).toBe('#e2e8f0');
    expect(result.current.treemapLabelColor).toBe('#1e293b');
  });

  it('returns dark theme when resolvedTheme is dark', () => {
    vi.mocked(useResolvedTheme).mockReturnValue('dark');
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.tooltipBg).toBe('#1e293b');
    expect(result.current.tooltipText).toBe('#e2e8f0');
    expect(result.current.axisLineColor).toBe('#334155');
    expect(result.current.addColor).toBe('#10b981');
    expect(result.current.deleteColor).toBe('#ef4444');
    expect(result.current.commitColor).toBe('#3b82f6');
    expect(result.current.neutralColor).toBe('#94a3b8');
    expect(result.current.heatmapColors).toEqual(['#1e293b', '#10b981']);
    expect(result.current.treemapBorderColor).toBe('#1e293b');
    expect(result.current.treemapLabelColor).toBe('#ffffff');
  });
});
