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

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    text: '#1e293b',
    background: '#fff',
    grid: '#e2e8f0',
    seriesColors: ['#3b82f6'],
    heatmapColors: [],
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

describe('CommitTimeline', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CommitTimeline />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('brush strip keeps a positive plot area at the 72px strip height (regression: default margins made innerHeight negative)', () => {
    const data = {
      commitTimeline: [
        { date: '2024-01-01', cumulative: 2 },
        { date: '2024-01-08', cumulative: 5 },
        { date: '2024-01-15', cumulative: 9 },
        { date: '2024-01-22', cumulative: 11 },
      ],
    };
    const { container } = render(<CommitTimeline data={data} />);
    const stripRects = container.querySelectorAll('.adl-chart-brush-layout__strip svg rect');
    expect(stripRects.length).toBeGreaterThan(0);
    for (const rect of stripRects) {
      const h = Number(rect.getAttribute('height'));
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});
