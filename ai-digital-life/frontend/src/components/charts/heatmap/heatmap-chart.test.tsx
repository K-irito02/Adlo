import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { HeatmapChart } from './heatmap-chart';
import type { HeatmapColumn } from './heatmap-context';

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
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US' }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

function createMockData(columns: number, rows: number): HeatmapColumn[] {
  const data: HeatmapColumn[] = [];
  for (let c = 0; c < columns; c++) {
    const bins = [];
    for (let r = 0; r < rows; r++) {
      bins.push({ count: Math.floor(Math.random() * 10), bin: r });
    }
    data.push({ bin: c, bins, columnLabel: `W${c}` });
  }
  return data;
}

describe('HeatmapChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(
      <HeatmapChart data={[]} animationDuration={0}>
        <rect />
      </HeatmapChart>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders SVG with basic data', () => {
    const data = createMockData(4, 7);
    const { container } = render(
      <HeatmapChart data={data} animationDuration={0}>
        <rect />
      </HeatmapChart>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
