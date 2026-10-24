import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LineChartLoading } from './line-chart-loading';

const reactRequireCache = vi.hoisted(() => ({ mod: undefined as ReturnType<typeof require> }));
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = (reactRequireCache.mod ??= require('react'));
          const initial = rest.initial as Record<string, unknown> | undefined;
          const attrs: Record<string, unknown> = {
            className: rest.className,
            key: rest.key,
          };
          if (initial && typeof initial === 'object') {
            Object.entries(initial).forEach(([k, v]) => {
              if (typeof v === 'string' || typeof v === 'number') {
                attrs[`data-init-${k}`] = v;
              }
            });
          }
          return React.createElement(tag === 'default' ? 'div' : tag, attrs, children);
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
  useReducedMotion: () => false,
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US', formatT: vi.fn() }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 240 }),
}));

describe('LineChartLoading', () => {
  it('shows the loading label', () => {
    const { getByText } = render(<LineChartLoading label="Loading chart..." />);
    expect(getByText('Loading chart...')).toBeInTheDocument();
  });

  it('renders a single skeleton pulse by default', () => {
    const { container } = render(<LineChartLoading label="Loading chart..." />);
    // Default loadingStyle is "pulse" → one traveling-pulse clip on the skeleton line.
    expect(container.querySelectorAll('clipPath[id^="line-loading-clip-"]').length).toBe(1);
  });

  it('renders one skeleton line per series entry', () => {
    const { container } = render(
      <LineChartLoading
        label="Loading chart..."
        loadingStyle="sweep"
        series={[{ dataKey: 'added' }, { dataKey: 'deleted' }, { dataKey: 'net' }]}
      />,
    );
    expect(container.querySelectorAll('mask[id^="line-sweep-"]').length).toBe(3);
    expect(container.querySelectorAll('pattern[id^="line-sweep-"]').length).toBe(3);
  });

  it('assigns distinct sweep phase offsets to multi-line skeletons so they desync', () => {
    const { container } = render(
      <LineChartLoading
        label="Loading chart..."
        loadingStyle="sweep"
        series={[
          { dataKey: 'added', phaseOffset: 0 },
          { dataKey: 'deleted', phaseOffset: 0.5 },
        ]}
      />,
    );
    const rects = Array.from(
      container.querySelectorAll('pattern[id^="line-sweep-"] rect[data-init-x]'),
    );
    // Two lines → two independently-positioned sweep starts (different x).
    const xs = rects.map((r) => r.getAttribute('data-init-x'));
    expect(rects.length).toBe(2);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });
});
