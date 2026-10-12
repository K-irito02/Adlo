import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { HeatmapChart } from './heatmap-chart';
import { computeHeatmapDimensions } from './heatmap-layout';
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
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US', formatT: vi.fn() }),
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
      bins.push({ count: (c + r) % 10, bin: r });
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

describe('computeHeatmapDimensions min/max clamp', () => {
  const margin = { top: 24, right: 16, bottom: 0, left: 40 };

  it('expands the SVG width past the container when the min clamp overflows (calendar narrow-window case)', () => {
    // 53 week columns in a 300px container: unclamped cell ≈ 4.6px, min 10px
    // forces a 530px plot — the SVG must expand so horizontal scroll reveals
    // cells instead of clipping them to blank.
    const dims = computeHeatmapDimensions({
      width: 300,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    expect(dims.binWidth).toBe(10);
    expect(dims.width).toBeGreaterThan(300);
    expect(dims.width).toBe(margin.left + 53 * 10 + margin.right);
  });

  it('keeps the SVG at container width when cells fit without clamping', () => {
    const dims = computeHeatmapDimensions({
      width: 600,
      parentHeight: 200,
      margin,
      columnCount: 53,
      rowCount: 7,
      binSize: 0,
      layout: 'fluid',
      separator: null,
      minBinSize: 10,
      maxBinSize: 14,
    });
    // (600 - 56) / 53 ≈ 10.26 — inside [10, 14], no overflow.
    expect(dims.binWidth).toBeGreaterThanOrEqual(10);
    expect(dims.binWidth).toBeLessThanOrEqual(14);
    expect(dims.width).toBe(600);
  });
});
