import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ComposedChart } from './composed-chart';
import { SeriesBar } from './series-bar';
import { Line } from './line';
import { XAxis } from './x-axis';

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
  }) => children({ width: 600, height: 200 }),
}));

const dateLabel = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

const SINGLE_YEAR_DATA = [
  { date: '2025-01-01', count: 1, cumulative: 1 },
  { date: '2025-02-01', count: 2, cumulative: 3 },
  { date: '2025-03-01', count: 3, cumulative: 6 },
  { date: '2025-04-01', count: 2, cumulative: 8 },
];

const CROSS_YEAR_DATA = [
  { date: '2025-11-01', count: 1, cumulative: 1 },
  { date: '2025-12-01', count: 2, cumulative: 3 },
  { date: '2026-01-01', count: 3, cumulative: 6 },
  { date: '2026-02-01', count: 2, cumulative: 8 },
];

function renderAxis(data: Record<string, unknown>[]) {
  return render(
    <ComposedChart
      data={data}
      xDataKey="date"
      status="ready"
      animationDuration={0}
      dateLabelFormatter={dateLabel}
    >
      <SeriesBar dataKey="count" />
      <Line dataKey="cumulative" />
      <XAxis numTicks={5} />
    </ComposedChart>,
  );
}

function renderAxisWithBrush(
  data: Record<string, unknown>[],
  xDomain: [Date, Date],
  xDomainSlotCount: number,
) {
  return render(
    <ComposedChart
      data={data}
      xDataKey="date"
      status="ready"
      animationDuration={0}
      dateLabelFormatter={dateLabel}
      xDomain={xDomain}
      xDomainSlotCount={xDomainSlotCount}
    >
      <SeriesBar dataKey="count" />
      <Line dataKey="cumulative" />
      <XAxis numTicks={5} />
    </ComposedChart>,
  );
}

function axisLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.text-chart-label')).map(
    (s) => s.textContent ?? '',
  );
}

function bareYearLabels(labels: string[]): number {
  return labels.filter((l) => /^\d{4}$/.test(l)).length;
}

describe('XAxis two-layer year labels', () => {
  it('keeps single-year charts compact with no year sub-labels', () => {
    const { container } = renderAxis(SINGLE_YEAR_DATA);
    const labels = axisLabels(container);
    expect(labels.some((l) => /^\d{4}$/.test(l))).toBe(false);
  });

  it('shows the year as a second-line sub-label on year-boundary ticks across years', () => {
    const { container } = renderAxis(CROSS_YEAR_DATA);
    const labels = axisLabels(container);
    const bareYears = labels.filter((l) => /^\d{4}$/.test(l));
    expect(bareYears.length).toBeGreaterThan(0);
  });

  it('adds the year sub-label only on year-boundary ticks, not on later same-year ticks', () => {
    const { container } = renderAxis(CROSS_YEAR_DATA);
    const labels = axisLabels(container);
    // Cross-year data: 11/1, 12/1 (2025) then 1/1, 2/1 (2026). The year sub-label
    // must appear only next to the first tick of each calendar year. Pin the exact
    // sequence so a regression attaching the year to the *last* tick of a year fails.
    expect(labels).toEqual(['11/1', '2025', '12/1', '1/1', '2026', '2/1']);
  });

  it('suppresses the year sub-label when the tick label already contains a year (month granularity)', () => {
    const monthLabel = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const { container } = render(
      <ComposedChart
        data={CROSS_YEAR_DATA}
        xDataKey="date"
        status="ready"
        animationDuration={0}
        dateLabelFormatter={monthLabel}
      >
        <SeriesBar dataKey="count" />
        <Line dataKey="cumulative" />
        <XAxis numTicks={5} />
      </ComposedChart>,
    );
    const labels = axisLabels(container);
    // Labels carry "2025-11", "2025-12", "2026-01", "2026-02" — no bare year row needed.
    expect(bareYearLabels(labels)).toBe(0);
  });

  it('never renders long full dates (regression: projection tail used full 年月日)', () => {
    // Drive through the brush + genuine projection-horizon path where the tail
    // ticks are actually generated — the original regression happened there.
    const { container } = renderAxisWithBrush(
      CROSS_YEAR_DATA,
      [new Date('2025-11-01'), new Date('2026-06-01')],
      4,
    );
    const labels = axisLabels(container);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).not.toMatch(/^\d{4}年/);
      expect(label).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('XAxis projection tail tick guard', () => {
  it('does not append tail ticks when the brush domain only extends by bar padding (half a column)', () => {
    const { container } = renderAxisWithBrush(
      SINGLE_YEAR_DATA,
      [new Date('2025-01-01'), new Date('2025-04-01')],
      4,
    );
    const labels = axisLabels(container);
    // Only the four data-aligned M/D labels; no injected projection tail.
    expect(labels.filter((l) => /^\d{1,2}\/\d{1,2}$/.test(l))).toHaveLength(4);
  });

  it('still appends tail ticks when the brush domain extends a genuine projection horizon (>= 1 data step)', () => {
    const { container } = renderAxisWithBrush(
      SINGLE_YEAR_DATA,
      [new Date('2025-01-01'), new Date('2025-06-01')],
      4,
    );
    const labels = axisLabels(container);
    const dataAligned = labels.filter((l) => /^\d{1,2}\/\d{1,2}$/.test(l));
    expect(dataAligned.length).toBeGreaterThan(4);
  });

  it('emits no tail ticks for a single visible point (regression: the guard skipped one-point data)', () => {
    const { container } = renderAxisWithBrush(
      SINGLE_YEAR_DATA,
      [new Date('2025-01-01'), new Date('2025-01-15')],
      4,
    );
    const labels = axisLabels(container);
    // Only the single visible 1/1 data-aligned label.
    expect(labels.filter((l) => /^\d{1,2}\/\d{1,2}$/.test(l))).toHaveLength(1);
  });

  it('emits no tail ticks when the tail step is non-positive (duplicate timestamps)', () => {
    const duplicateTailData = [
      { date: '2025-01-01', count: 1, cumulative: 1 },
      { date: '2025-02-01', count: 2, cumulative: 3 },
      { date: '2025-03-01', count: 3, cumulative: 6 },
      { date: '2025-03-01', count: 4, cumulative: 10 },
    ];
    const { container } = renderAxisWithBrush(
      duplicateTailData,
      [new Date('2025-01-01'), new Date('2025-04-01')],
      4,
    );
    const labels = axisLabels(container);
    // Duplicate tail timestamps yield step 0 → extension steps 0 → no tail ticks.
    // The two 3/1 ticks dedupe by label, leaving exactly the data-aligned set.
    expect(labels.filter((l) => /^\d{1,2}\/\d{1,2}$/.test(l))).toEqual(['1/1', '2/1', '3/1']);
  });
});
