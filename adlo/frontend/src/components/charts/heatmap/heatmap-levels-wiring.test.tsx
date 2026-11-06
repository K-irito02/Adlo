import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { computeHeatmapCellFaded } from './heatmap-cell-state';
import { HeatmapCells } from './heatmap-cells';
import { HeatmapChart } from './heatmap-chart';
import type { HeatmapColumn } from './heatmap-context';

vi.mock('motion/react', () => {
  const createMotionValue = (initial: number) => ({
    get: () => initial,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  });
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          function MotionTag({ children, ...rest }: Record<string, unknown>) {
            const {
              animate: _animate,
              initial: _initial,
              transition: _transition,
              whileHover: _whileHover,
              whileTap: _whileTap,
              variants: _variants,
              ...domProps
            } = rest;
            return React.createElement(
              tag === 'default' ? 'div' : tag,
              { ...domProps, key: rest.key as React.Key },
              children as React.ReactNode,
            );
          },
      },
    ),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: (initial: number) => createMotionValue(initial),
    useTransform: () => createMotionValue(0),
    useSpring: () => createMotionValue(0),
    useReducedMotion: () => true,
  };
});

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

function data(): HeatmapColumn[] {
  return [
    {
      bin: 0,
      bins: [
        { count: 1, bin: 0 },
        { count: 2, bin: 1 },
        { count: 3, bin: 2 },
        { count: 4, bin: 3 },
      ],
    },
  ];
}

function renderedFills(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.visx-heatmap-rect')].map(
    (rect) => rect.getAttribute('fill') ?? '',
  );
}

describe('HeatmapChart level resolver wiring', () => {
  it('colors every non-empty cell with the resolver-provided level', () => {
    const { container } = render(
      <HeatmapChart
        data={data()}
        animationDuration={0}
        levelForCount={(count) => (count == null ? 0 : count)}
      >
        <HeatmapCells cornerRadius={2} />
      </HeatmapChart>,
    );
    const fills = renderedFills(container);

    // Counts 1/2/3/4 drive levels 1/2/3/4; the shimmer layer uses fill(0).
    expect(fills.filter((fill) => fill === 'var(--chart-scale-01)')).toHaveLength(4);
    expect(fills.filter((fill) => fill === 'var(--chart-scale-02)')).toHaveLength(1);
    expect(fills.filter((fill) => fill === 'var(--chart-scale-03)')).toHaveLength(1);
    expect(fills.filter((fill) => fill === 'var(--chart-scale-04)')).toHaveLength(1);
    expect(fills.filter((fill) => fill === 'var(--chart-scale-05)')).toHaveLength(1);
  });

  it('routes a different resolver to the darkest level', () => {
    const { container } = render(
      <HeatmapChart
        data={data()}
        animationDuration={0}
        levelForCount={(count) => ((count ?? 0) > 0 ? 4 : 0)}
      >
        <HeatmapCells cornerRadius={2} />
      </HeatmapChart>,
    );
    const fills = renderedFills(container);

    expect(fills.filter((fill) => fill === 'var(--chart-scale-05)')).toHaveLength(4);
    expect(fills.filter((fill) => fill === 'var(--chart-scale-02)')).toHaveLength(0);
  });

  it('matches legend hover levels through the same resolver', () => {
    const levelForCount = (count: number | null | undefined) => (count === 8 ? 1 : 4);
    const cell = { column: 0, row: 0 };

    const highlighted = computeHeatmapCellFaded(false, true, null, 1, cell, 8, levelForCount);
    const dimmed = computeHeatmapCellFaded(false, true, null, 1, cell, 4, levelForCount);

    expect(highlighted).toEqual({ isHighlighted: true, isDimmed: false });
    expect(dimmed).toEqual({ isHighlighted: false, isDimmed: true });
  });
});
