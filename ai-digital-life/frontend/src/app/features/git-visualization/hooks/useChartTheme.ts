import { useMemo } from 'react';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

export interface ChartTheme {
  axisLineColor: string;
  splitLineColor: string;
  tooltipBg: string;
  tooltipText: string;
  labelColor: string;
  addColor: string;
  deleteColor: string;
  addColorAlpha: string;
  deleteColorAlpha: string;
  commitColor: string;
  neutralColor: string;
  heatmapColors: string[];
  treemapBorderColor: string;
  treemapLabelColor: string;
}

const LIGHT_THEME: ChartTheme = {
  axisLineColor: '#e2e8f0',
  splitLineColor: '#f1f5f9',
  tooltipBg: '#ffffff',
  tooltipText: '#1e293b',
  labelColor: '#475569',
  addColor: '#10b981',
  deleteColor: '#ef4444',
  addColorAlpha: 'rgba(16,185,129,0.4)',
  deleteColorAlpha: 'rgba(239,68,68,0.3)',
  commitColor: '#3b82f6',
  neutralColor: '#94a3b8',
  heatmapColors: ['#e2e8f0', '#10b981'],
  treemapBorderColor: '#e2e8f0',
  treemapLabelColor: '#1e293b',
};

const DARK_THEME: ChartTheme = {
  axisLineColor: '#334155',
  splitLineColor: '#1e293b',
  tooltipBg: '#1e293b',
  tooltipText: '#e2e8f0',
  labelColor: '#94a3b8',
  addColor: '#10b981',
  deleteColor: '#ef4444',
  addColorAlpha: 'rgba(16,185,129,0.4)',
  deleteColorAlpha: 'rgba(239,68,68,0.3)',
  commitColor: '#3b82f6',
  neutralColor: '#94a3b8',
  heatmapColors: ['#1e293b', '#10b981'],
  treemapBorderColor: '#1e293b',
  treemapLabelColor: '#ffffff',
};

export function useChartTheme(): ChartTheme {
  const resolvedTheme = useResolvedTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME), [resolvedTheme]);
}
