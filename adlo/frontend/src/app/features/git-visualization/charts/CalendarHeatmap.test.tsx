import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CalendarHeatmap } from './CalendarHeatmap';

const mockLoadingLabel = vi.fn();
vi.mock('@/components/charts/chart-loading-label', () => ({
  ChartLoadingLabel: (props: { exiting?: boolean; text?: string }) => {
    mockLoadingLabel(props);
    return React.createElement('div', null, props.text);
  },
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy(
      {},
      {
        get: () => (p: Record<string, unknown>) => {
          const { children, ...rest } = p;
          return React.createElement(
            'div',
            { className: rest.className, key: rest.key as React.Key },
            children as React.ReactNode,
          );
        },
      },
    ),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisContribution: 'contribution',
      gitVisContributions: 'contributions',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

describe('CalendarHeatmap', () => {
  it('renders SVG', { timeout: 10000 }, () => {
    const { container } = render(<CalendarHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows skeleton cells + loading label when status is loading', () => {
    const { container, getByText } = render(
      <CalendarHeatmap status="loading" loadingLabel="Loading chart..." year={2026} />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    expect(container.querySelectorAll('.visx-heatmap-rect').length).toBeGreaterThan(0);
  });

  it('keeps the loading label visible (exiting falsy) when transitioning ready → loading', () => {
    const data = [{ date: '2026-01-15', count: 3 }];
    const { rerender } = render(
      <CalendarHeatmap data={data} year={2026} status="ready" loadingLabel="Loading chart..." />,
    );
    mockLoadingLabel.mockClear();
    // Simulate a refresh: the chart was ready and flips to loading. The label
    // mounts during the 'exitingReady' phase and must be fully visible — it must
    // NOT be rendered with exiting=true (which paints it at opacity 0 via
    // initial={false}), otherwise fast refreshes show no "loading" state at all.
    rerender(
      <CalendarHeatmap data={data} year={2026} status="loading" loadingLabel="Loading chart..." />,
    );
    expect(mockLoadingLabel).toHaveBeenCalled();
    const last = mockLoadingLabel.mock.calls.at(-1)?.[0];
    expect(last?.exiting).toBeFalsy();
  });
});
