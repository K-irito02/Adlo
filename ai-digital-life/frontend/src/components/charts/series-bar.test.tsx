import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ComposedChart } from './composed-chart';
import { SeriesBar } from './series-bar';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function M({ children, ...rest }: Record<string, unknown>) {
          const p: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              p[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className as string, key: rest.key as string, ...p },
            children as React.ReactNode,
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

describe('SeriesBar (grouped)', () => {
  it('renders one rect per data point per bar series', () => {
    const { container } = render(
      <ComposedChart
        data={[
          { date: '2024-01-01', a: 5, b: 3 },
          { date: '2024-01-02', a: 4, b: 6 },
        ]}
        status="ready"
        animationDuration={0}
      >
        <SeriesBar dataKey="a" />
        <SeriesBar dataKey="b" />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('.series-bar rect').length).toBe(2 * 2);
  });
});
