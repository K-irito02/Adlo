import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ClockHeatmap } from './ClockHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisCommits: 'commits' },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    text: '#1e293b',
    muted: '#94a3b8',
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
    background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'],
    heatmapColors: [],
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy(
      {},
      {
        get: () => (p: Record<string, unknown>) => {
          const R = require('react');
          const { children, ...rest } = p;
          return R.createElement('div', { className: rest.className, key: rest.key }, children);
        },
      },
    ),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => true,
  };
});

describe('ClockHeatmap', () => {
  it('renders SVG', { timeout: 10000 }, () => {
    const { container } = render(<ClockHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with data without crashing', { timeout: 10000 }, () => {
    const sampleData = [
      { day: 1, hour: 9, count: 5 },
      { day: 2, hour: 14, count: 3 },
    ];
    const { container } = render(<ClockHeatmap data={sampleData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows skeleton cells + loading label when status is loading', { timeout: 10000 }, () => {
    const { container, getByText } = render(
      <ClockHeatmap status="loading" loadingLabel="Loading chart..." />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    expect(container.querySelectorAll('.visx-heatmap-rect').length).toBeGreaterThan(0);
  });
});
