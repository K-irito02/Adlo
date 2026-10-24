import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ComposedChart } from './composed-chart';
import { SeriesBar } from './series-bar';
import { Line } from './line';
import { YAxis } from './y-axis';

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
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className as string, key: rest.key as string, ...elProps },
            children as React.ReactNode,
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
  }) => children({ width: 600, height: 200 }),
}));

const DATA = [
  { date: '2024-01-01', count: 2, cumulative: 2 },
  { date: '2024-01-02', count: 3, cumulative: 5 },
  { date: '2024-01-03', count: 4, cumulative: 9 },
];

describe('YAxis', () => {
  it('renders tick labels for the left (primary) axis', () => {
    const { container } = render(
      <ComposedChart data={DATA} xDataKey="date" status="ready" animationDuration={0}>
        <Line dataKey="cumulative" />
        <YAxis numTicks={4} />
      </ComposedChart>,
    );
    const labels = container.querySelectorAll('.text-chart-label');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders a separate right axis for a yAxisId="right" series', () => {
    const { container } = render(
      <ComposedChart data={DATA} xDataKey="date" status="ready" animationDuration={0}>
        <SeriesBar dataKey="count" yAxisId="right" />
        <Line dataKey="cumulative" />
        <YAxis numTicks={4} />
        <YAxis yAxisId="right" orientation="right" numTicks={4} />
      </ComposedChart>,
    );
    const labels = container.querySelectorAll('.text-chart-label');
    expect(labels.length).toBeGreaterThan(0);
    const rightAxisWrappers = Array.from(container.querySelectorAll('div')).filter(
      (d) => d.style.right === '0px' && d.style.width !== '',
    );
    expect(rightAxisWrappers.length).toBeGreaterThan(0);
  });
});
