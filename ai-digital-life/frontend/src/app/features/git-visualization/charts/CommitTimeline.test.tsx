import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CommitTimeline } from './CommitTimeline';

function createMotionValue(initial = 0) {
  const listeners: Record<string, ((v: unknown) => void)[]> = {};
  return {
    get: () => initial,
    set: (v: unknown) => {
      listeners.change?.forEach((fn) => fn(v));
    },
    stop: () => {},
    on: (event: string, fn: (v: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => {
        listeners[event] = listeners[event]?.filter((f) => f !== fn);
      };
    },
  };
}

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          _initial,
          _animate,
          _exit,
          _transition,
          _variants,
          _whileHover,
          _whileTap,
          _style,
          ...rest
        }: Record<string, unknown>) {
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useSpring: (val: unknown) => createMotionValue(typeof val === 'number' ? val : 0),
  useReducedMotion: () => false,
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 72 }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCommitTimelineCount: 'Commits this period',
      gitVisCommitTimelineCumulative: 'Cumulative',
    },
    formatT: vi.fn(),
  })),
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
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    heatmapColors: [],
  }),
}));

const DAILY_DATA = {
  days: [
    { date: '2024-01-01', count: 2, cumulative: 2 },
    { date: '2024-01-02', count: 3, cumulative: 5 },
    { date: '2024-01-03', count: 4, cumulative: 9 },
    { date: '2024-01-04', count: 2, cumulative: 11 },
  ],
};

describe('CommitTimeline', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CommitTimeline />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('brush strip keeps a positive plot area at the 72px strip height (regression: default margins made innerHeight negative)', () => {
    const { container } = render(<CommitTimeline data={DAILY_DATA} />);
    const stripRects = container.querySelectorAll('.adl-chart-brush-layout__strip svg rect');
    expect(stripRects.length).toBeGreaterThan(0);
    for (const rect of stripRects) {
      const h = Number(rect.getAttribute('height'));
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders both SeriesBar rects and the cumulative Line path in the main chart', () => {
    const { container } = render(<CommitTimeline data={DAILY_DATA} />);
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    expect(mainChartSvg).toBeInTheDocument();

    const barRects = mainChartSvg!.querySelectorAll('.series-bar rect');
    expect(barRects.length).toBeGreaterThan(0);

    const linePaths = Array.from(mainChartSvg!.querySelectorAll('path')).filter((p) => {
      const d = p.getAttribute('d');
      const stroke = p.getAttribute('stroke');
      return Boolean(d && d.length > 0 && stroke && stroke !== 'none');
    });
    expect(linePaths.length).toBeGreaterThan(0);
  });

  it('renders two independent y-axes: right scaled to counts, left scaled to cumulative', () => {
    const { container } = render(<CommitTimeline data={DAILY_DATA} />);
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    expect(mainChartSvg!.querySelectorAll('.series-bar rect').length).toBeGreaterThan(0);

    const axisWrappers = Array.from(container.querySelectorAll('div')).filter(
      (d) => d.style.width !== '' && (d.style.left === '0px' || d.style.right === '0px'),
    );
    const leftAxis = axisWrappers.find((d) => d.style.left === '0px');
    const rightAxis = axisWrappers.find((d) => d.style.right === '0px');
    expect(leftAxis).toBeDefined();
    expect(rightAxis).toBeDefined();

    const rightText = Array.from(rightAxis!.querySelectorAll('.text-chart-label')).map((s) =>
      Number(s.textContent),
    );
    const leftText = Array.from(leftAxis!.querySelectorAll('.text-chart-label')).map((s) =>
      Number(s.textContent),
    );
    // Counts span 2..4 (right axis) while cumulative reaches 11 (left axis).
    expect(Math.max(...rightText)).toBeLessThanOrEqual(5);
    expect(Math.max(...leftText)).toBeGreaterThanOrEqual(10);
  });
});
