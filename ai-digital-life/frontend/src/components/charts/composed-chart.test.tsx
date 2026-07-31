import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ComposedChart } from './composed-chart';
import { SeriesBar } from './series-bar';
import { Line } from './line';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function M({ children, ...rest }: Record<string, unknown>) {
          const R = require('react');
          const p: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              p[k] = v;
            }
          }
          return R.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...p },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(v: T) => ({
    get: () => v,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useSpring: (v: unknown) => ({
    get: () => v,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  }),
  useReducedMotion: () => false,
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

describe('ComposedChart + SeriesBar', () => {
  it('renders bars and a line together', () => {
    const { container } = render(
      <ComposedChart
        data={[
          { date: '2024-01-01', count: 5, cum: 5 },
          { date: '2024-01-02', count: 3, cum: 8 },
        ]}
        status="ready"
        animationDuration={0}
      >
        <SeriesBar dataKey="count" radius={4} />
        <Line dataKey="cum" />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
  });
});
