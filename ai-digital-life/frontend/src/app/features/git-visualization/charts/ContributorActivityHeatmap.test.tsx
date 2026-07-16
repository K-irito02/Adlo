import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ContributorActivityHeatmap } from './ContributorActivityHeatmap';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisContribution: 'contribution', gitVisContributions: 'contributions' },
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6', text: '#1e293b', muted: '#94a3b8', grid: '#e2e8f0',
    tooltipBg: '#1e293b', tooltipText: '#f8fafc', background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'], heatmapColors: [],
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (args: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => {
      const R = require('react'); const { children, ...rest } = p;
      return R.createElement('div', { className: rest.className, key: rest.key }, children);
    }}),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

describe('ContributorActivityHeatmap', () => {
  it('renders SVG', { timeout: 15000 }, () => {
    const { container } = render(<ContributorActivityHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
