import { useMemo } from 'react';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

export interface BklitTheme {
  accent: string;
  background: string;
  text: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  tooltipText: string;
  heatmapColors: string[];
  seriesColors: string[];
}

const LIGHT_THEME: BklitTheme = {
  accent: '#3b82f6',
  background: '#ffffff',
  text: '#1e293b',
  muted: '#94a3b8',
  grid: '#e2e8f0',
  tooltipBg: '#1e293b',
  tooltipText: '#f8fafc',
  heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
  seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
};

const DARK_THEME: BklitTheme = {
  accent: '#60a5fa',
  background: '#1a1a2e',
  text: '#e2e8f0',
  muted: '#64748b',
  grid: '#334155',
  tooltipBg: '#f8fafc',
  tooltipText: '#1e293b',
  heatmapColors: ['#1e293b', '#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa'],
  seriesColors: ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'],
};

export function useBklitTheme(): BklitTheme {
  const resolvedTheme = useResolvedTheme();
  return useMemo(() => (resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME), [resolvedTheme]);
}
