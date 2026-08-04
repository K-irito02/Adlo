import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CalendarHeatmap } from './CalendarHeatmap';

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
    useReducedMotion: () => true,
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
});
