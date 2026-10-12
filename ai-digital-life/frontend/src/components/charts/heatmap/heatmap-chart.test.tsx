import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { HeatmapChart } from './heatmap-chart';
import type { HeatmapColumn } from './heatmap-context';

// Mutable so individual tests can pin the exact measurement frame ParentSize
// reports. The real component starts at {0, 0}, then ResizeObserver delivers
// the true width — the fluid layout's parent height stays content-driven (0
// until this element lays out), which is why the ready gate must not gate on
// the raw parent height.
let mockParentSize = { width: 600, height: 200 };

beforeEach(() => {
  mockParentSize = { width: 600, height: 200 };
});

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
  }) => children(mockParentSize),
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

  it('renders nothing at the {0,0} pre-measurement frame even with a min clamp', () => {
    // The minBinSize clamp must not expand a pre-measurement frame into a
    // full-size chart — the gate's raw-width half is what blocks it.
    mockParentSize = { width: 0, height: 0 };
    const data = createMockData(53, 7);
    const { container } = render(
      <HeatmapChart data={data} animationDuration={0} minBinSize={10} maxBinSize={14}>
        <rect />
      </HeatmapChart>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders once the width is measured even though the fluid parent height is still 0', () => {
    // Fluid charts are content-sized: the parent div's height is driven by this
    // element, so it legitimately reports 0 until layout. Gating on the raw
    // parent height here would leave every fluid heatmap blank forever.
    mockParentSize = { width: 600, height: 0 };
    const data = createMockData(53, 7);
    const { container } = render(
      <HeatmapChart data={data} animationDuration={0} minBinSize={10} maxBinSize={14}>
        <rect />
      </HeatmapChart>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
