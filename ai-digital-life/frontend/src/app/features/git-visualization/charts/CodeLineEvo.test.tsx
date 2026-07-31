import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CodeLineEvo } from './CodeLineEvo';

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
    text: '#1e293b',
    muted: '#94a3b8',
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
    background: '#ffffff',
    seriesColors: ['#3b82f6', '#ef4444'],
    heatmapColors: [],
  }),
}));

describe('CodeLineEvo', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CodeLineEvo />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('brush strip keeps a positive plot area at the 72px strip height (regression: default margins made innerHeight negative)', () => {
    const data = {
      weeks: [
        { weekStart: '2024-01-01', additions: 10, deletions: 2 },
        { weekStart: '2024-01-08', additions: 5, deletions: 1 },
        { weekStart: '2024-01-15', additions: 20, deletions: 3 },
        { weekStart: '2024-01-22', additions: 8, deletions: 4 },
      ],
    };
    const { container } = render(<CodeLineEvo data={data} />);
    const stripRects = container.querySelectorAll('.adl-chart-brush-layout__strip svg rect');
    expect(stripRects.length).toBeGreaterThan(0);
    for (const rect of stripRects) {
      const h = Number(rect.getAttribute('height'));
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});
