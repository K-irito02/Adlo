import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { BarChart, Bar } from './bar-chart';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = require('react');
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key },
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
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {} }),
  useSpring: (v: unknown) => ({
    get: () => (typeof v === 'number' ? v : 0),
    set: () => {},
    stop: () => {},
  }),
  useReducedMotion: () => true,
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US', formatT: vi.fn() }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

describe('BarChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<BarChart data={[]} animationDuration={0} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with basic data', () => {
    const data = [
      { name: 'A', value: 10 },
      { name: 'B', value: 20 },
      { name: 'C', value: 15 },
    ];
    const { container } = render(
      <BarChart data={data} animationDuration={0}>
        <Bar dataKey="value" />
      </BarChart>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
