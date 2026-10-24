import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LineChart } from './line-chart';
import { Area } from './area';

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
  ParentSize: ({ children }: any) => children({ width: 600, height: 200 }),
}));

describe('Area', () => {
  it('renders a filled area path with baseline="bottom"', () => {
    const { container } = render(
      <LineChart
        data={[
          { date: '2024-01-01', v: 10 },
          { date: '2024-01-02', v: 20 },
        ]}
        status="ready"
        animationDuration={0}
      >
        <Area dataKey="v" baseline="bottom" />
      </LineChart>,
    );
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders a filled area path with baseline="zero" (diverging)', () => {
    const { container } = render(
      <LineChart
        data={[
          { date: '2024-01-01', v: -5 },
          { date: '2024-01-02', v: 5 },
        ]}
        status="ready"
        animationDuration={0}
      >
        <Area dataKey="v" baseline="zero" />
      </LineChart>,
    );
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThan(0);
  });
});
